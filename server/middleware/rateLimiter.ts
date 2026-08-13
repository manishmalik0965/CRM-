import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Key generator helper that isolates rate limits per user, account, or token
// rather than locking out an entire office/NAT sharing a single IP address.
const getClientKey = (req: any, prefix: string) => {
  const tenantId = req.headers['x-tenant-id'] || 'default';
  const userId = req.user?.id || req.user?.userId;
  const email = (req.body?.email || req.body?.user_id || '').toLowerCase().trim();
  const authHeader = req.headers['authorization'] ? String(req.headers['authorization']).slice(-20) : '';
  const clientIp = req.ip || (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : '127.0.0.1');

  if (userId) {
    return `${prefix}_${tenantId}_user_${userId}`;
  }
  if (email) {
    return `${prefix}_${tenantId}_email_${email}`;
  }
  if (authHeader) {
    return `${prefix}_${tenantId}_auth_${authHeader}`;
  }
  return `${prefix}_${tenantId}_ip_${clientIp}`;
};

const shouldSkipRateLimit = (req: any) => {
  // Completely disable rate limiters per user's explicit request to remove rate limits and limitations
  return true;
};

// Rate limiter for authentication endpoints (login, forgot password, OTP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Generous limit per user/email/ip account (prevents locking out shared office IPs)
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  keyGenerator: (req) => getClientKey(req, 'auth'),
  message: {
    error: 'Too many authentication attempts for this account or session. Please try again after 15 minutes.'
  },
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.originalUrl,
      key: getClientKey(req, 'auth'),
      headers: req.headers
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Rate limiter for general API routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // High limit per session/user/token to accommodate busy corporate networks
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  keyGenerator: (req) => getClientKey(req, 'api'),
  message: {
    error: 'Too many requests. Please slow down and try again shortly.'
  }
});

// Rate limiter for authorization links and guest PDF access
export const publicAuthDocLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // 500 authorization views/downloads per 15 mins per key
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  keyGenerator: (req) => getClientKey(req, 'public_doc'),
  message: {
    error: 'Rate limit exceeded for authorization verification. Please try again later.'
  }
});

