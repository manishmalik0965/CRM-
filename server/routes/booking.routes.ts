import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { publicAuthDocLimiter } from '../middleware/rateLimiter';
import {
  getBookings,
  getRecentUpdates,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  getAuthProofData,
  getAuthVerificationPdf
} from '../controllers/booking.controller';

const router = Router();

router.get('/bookings', requireAuth, getBookings);
router.get('/bookings/recent-updates', requireAuth, getRecentUpdates);
router.get('/bookings/:id', requireAuth, getBookingById);
router.post('/bookings', requireAuth, createBooking);
router.put('/bookings/:id', requireAuth, updateBooking);
router.delete('/bookings/:id', requireAuth, deleteBooking);

router.get('/bookings/:id/auth-proof-data', requireAuth, getAuthProofData);
router.get('/bookings/:id/auth-verification-pdf', requireAuth, getAuthVerificationPdf);

export default router;
