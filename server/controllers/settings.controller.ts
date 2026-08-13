import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';

export const getPublicSettings = async (req: Request, res: Response) => {
  try {
    const headerTenantId = req.headers['x-tenant-id'] as string;
    const queryTenantId = req.query.tenantId as string;
    const domain = req.query.domain as string;
    const referer = req.headers.referer as string;

    const publicSettings = await settingsService.getPublicSettings(headerTenantId, queryTenantId, domain, referer);
    res.json(publicSettings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getSettings = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';

    const settings = await settingsService.getSettings(companyId);
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';

    const updated = await settingsService.updateSettings(companyId, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
