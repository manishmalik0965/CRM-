import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import {
  getClients,
  getClientById,
  getClientTenant,
  createClient,
  updateClient,
  resetClientPassword,
  deleteClient
} from '../controllers/client.controller';

const router = Router();

router.get('/clients/tenant', getClientTenant);
router.get('/clients/:id', getClientById);

router.get('/settings/clients', requireAuth, requireRole(['Admin', 'Superadmin']), getClients);
router.get('/settings/clients/:id', requireAuth, requireRole(['Admin', 'Superadmin']), getClientById);
router.post('/settings/clients', requireAuth, requireRole(['Admin', 'Superadmin']), createClient);
router.put('/settings/clients/:id', requireAuth, requireRole(['Admin', 'Superadmin']), updateClient);
router.post('/settings/clients/:id/reset-password', requireAuth, requireRole(['Admin', 'Superadmin']), resetClientPassword);
router.delete('/settings/clients/:id', requireAuth, requireRole(['Admin', 'Superadmin']), deleteClient);

export default router;
