import { Router } from 'express';
import { syncAirports } from '../controllers/airport.controller';

const router = Router();

router.get('/airports/sync', syncAirports);

export default router;
