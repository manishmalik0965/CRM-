import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  checkUsername,
  getStats
} from '../controllers/user.controller';

const router = Router();

router.get('/users', requireAuth, requireRole(['Admin', 'Superadmin', 'WFM']), getUsers);
router.get('/settings/users', requireAuth, requireRole(['Admin', 'Superadmin', 'WFM']), getUsers);

router.post('/users', requireAuth, requireRole(['Admin', 'Superadmin']), createUser);
router.post('/settings/users', requireAuth, requireRole(['Admin', 'Superadmin']), createUser);

router.put('/users/:id', requireAuth, requireRole(['Admin', 'Superadmin']), updateUser);
router.put('/settings/users/:id', requireAuth, requireRole(['Admin', 'Superadmin']), updateUser);

router.delete('/users/:id', requireAuth, requireRole(['Admin', 'Superadmin']), deleteUser);
router.delete('/settings/users/:id', requireAuth, requireRole(['Admin', 'Superadmin']), deleteUser);

router.get('/users/check-username', requireAuth, checkUsername);
router.get('/settings/users/check-username', requireAuth, checkUsername);

router.get('/users/stats', requireAuth, requireRole(['Admin', 'Superadmin', 'WFM']), getStats);
router.get('/settings/users/stats', requireAuth, requireRole(['Admin', 'Superadmin', 'WFM']), getStats);

export default router;
