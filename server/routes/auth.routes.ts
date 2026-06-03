import { Router } from 'express';
import { login, register, me, setupTOTP, verifyTOTP, enableTOTP, disableTOTP } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', requireAuth, me);
router.post('/setup-totp', requireAuth, setupTOTP);
router.post('/verify-totp', verifyTOTP); // Doesn't use requireAuth; uses mfaToken inside body
router.post('/enable-totp', requireAuth, enableTOTP);
router.post('/mfa/disable', requireAuth, disableTOTP);

export default router;

