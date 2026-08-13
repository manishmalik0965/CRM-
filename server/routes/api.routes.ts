import { Router } from 'express';
import auditRoutes from './audit.routes';
import emailRoutes from './email.routes';
import settingsRoutes from './settings.routes';
import bookingRoutes from './booking.routes';
import userRoutes from './user.routes';
import clientRoutes from './client.routes';
import clientAdminRoutes from './clientAdmin.routes';
import airportRoutes from './airport.routes';
import publicBookingRoutes from './publicBooking.routes';

const router = Router();

router.use(publicBookingRoutes);
router.use(auditRoutes);
router.use(emailRoutes);
router.use(settingsRoutes);
router.use(bookingRoutes);
router.use(userRoutes);
router.use(clientRoutes);
router.use(clientAdminRoutes);
router.use(airportRoutes);

export default router;
