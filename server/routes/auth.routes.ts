import { Router } from 'express';
import { login, register, me, setupTOTP, verifyTOTP, enableTOTP, disableTOTP } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { loginSchema, registerSchema, verifyTotpSchema, enableTotpSchema } from '../validators/auth.validator';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.get('/me', requireAuth, me);
router.post('/setup-totp', requireAuth, setupTOTP);
router.post('/verify-totp', authLimiter, validate({ body: verifyTotpSchema }), verifyTOTP); // Uses mfaToken inside body
router.post('/enable-totp', requireAuth, validate({ body: enableTotpSchema }), enableTOTP);
router.post('/mfa/disable', requireAuth, disableTOTP);

export default router;


