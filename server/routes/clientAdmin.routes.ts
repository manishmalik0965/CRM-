import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import multer from 'multer';
import {
  getSyncSettings,
  saveSyncSettings,
  getBackups,
  downloadBackup,
  triggerSync,
  uploadBackupFile,
  syncBackup,
  testConnection,
  downloadIndex,
  downloadSchema,
  downloadConnectingFile
} from '../controllers/clientAdmin.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/client-admin/sync-settings', requireAuth, getSyncSettings);
router.post('/client-admin/sync-settings', requireAuth, saveSyncSettings);
router.get('/client-admin/backups', requireAuth, getBackups);
router.get('/client-admin/download-backup/:id', requireAuth, downloadBackup);
router.post('/client-admin/trigger-sync', requireAuth, triggerSync);
router.post('/client-admin/upload-backup-file', requireAuth, upload.single('backupFile'), uploadBackupFile);
router.post('/client-admin/sync-backup', syncBackup);
router.post('/client-admin/test-connection', requireAuth, testConnection);
router.get('/client-admin/download-index', requireAuth, downloadIndex);
router.get('/client-admin/download-schema', requireAuth, downloadSchema);
router.get('/client-admin/download-connecting-file', requireAuth, downloadConnectingFile);

export default router;
