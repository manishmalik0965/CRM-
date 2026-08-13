import { Request, Response } from 'express';
import { auditService } from '../services/audit.service';

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const logs = await auditService.getAuditLogs(companyId, limit);
    res.json(logs);
  } catch (e: any) {
    console.error('Error in getAuditLogs controller:', e);
    res.status(500).json({ error: e.message });
  }
};

export const createAuditLog = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { action, details, bookingId, tenantId } = req.body;
    const reqWithAuth = {
      ...req,
      companyId: tenantId || user?.company_id || user?.companyId || 'legacy-tenant-1',
      userId: user?.id || 'default-admin-1'
    };

    const result = await auditService.createAuditLog(reqWithAuth, action, details, bookingId, tenantId);
    res.json(result);
  } catch (e: any) {
    console.error('Error in createAuditLog controller:', e);
    res.status(500).json({ error: e.message });
  }
};

export const logClientRuntimeError = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const authUser = user ? { companyId: user.company_id || user.companyId, id: user.id } : undefined;
    const result = await auditService.logClientRuntimeError(req.body, req.headers, req.ip || '', authUser);
    res.json(result);
  } catch (err: any) {
    console.error('Error in logClientRuntimeError controller:', err.message);
    res.status(500).json({ error: err.message });
  }
};
