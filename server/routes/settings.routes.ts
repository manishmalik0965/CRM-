import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getPublicSettings, getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();

router.get('/public/settings', getPublicSettings);
router.get('/settings/public', getPublicSettings);
router.get('/settings', requireAuth, getSettings);
router.post('/settings', requireAuth, updateSettings);

export default router;
