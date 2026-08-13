import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getAuditLogs, createAuditLog, logClientRuntimeError } from '../controllers/audit.controller';

const router = Router();

router.get('/audit-logs', requireAuth, getAuditLogs);
router.post('/audit-logs', requireAuth, createAuditLog);
router.post('/audit-logs/client-error', logClientRuntimeError);
router.post('/logs', logClientRuntimeError);

export default router;
