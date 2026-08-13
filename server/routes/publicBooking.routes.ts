import { Router } from 'express';
import { publicAuthDocLimiter } from '../middleware/rateLimiter';
import { publicAuthorize, publicAuthorizeDirect } from '../controllers/publicBooking.controller';

const router = Router();

router.put('/public/bookings/:id/authorize', publicAuthorize);
router.get('/public/bookings/:id/authorize-direct', publicAuthDocLimiter, publicAuthorizeDirect);

export default router;
