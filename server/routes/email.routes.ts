import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getSentEmails } from '../controllers/email.controller';

const router = Router();

router.get('/sent-emails', requireAuth, getSentEmails);

export default router;
