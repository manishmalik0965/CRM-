import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface LogContext {
  requestId?: string;
  userId?: string;
  companyId?: string;
  ip?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  [key: string]: any;
}

export const logger = {
  info: (message: string, context: LogContext = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...context
    }));
  },
  warn: (message: string, context: LogContext = {}) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      message,
      ...context
    }));
  },
  error: (message: string, error?: any, context: LogContext = {}) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      ...context
    }));
  },
  audit: (action: string, context: LogContext = {}) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'AUDIT',
      action,
      ...context
    }));
  }
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;

    const logData: LogContext = {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      userId: (req as any).user?.id || (req as any).user?.userId,
      companyId: (req as any).user?.company_id || (req as any).user?.companyId
    };

    if (res.statusCode >= 400) {
      logger.warn(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`, logData);
    } else {
      logger.info(`HTTP ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`, logData);
    }
  });

  next();
};
