import { Request, Response } from 'express';
import { userService } from '../services/user.service';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const role = user?.role || 'Agent';

    const users = await userService.getUsers(companyId, role);
    res.json({ users });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const role = user?.role || 'Agent';

    const result = await userService.createUser(companyId, role, req.body, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const { id } = req.params;

    const result = await userService.updateUser(id, companyId, req.body, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const { id } = req.params;

    const result = await userService.deleteUser(id, companyId, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const checkUsername = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const username = (req.query.username || req.query.email || req.query.user_id) as string;
    const excludeId = req.query.exclude_id as string;

    const result = await userService.checkUsername(username, companyId, excludeId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const role = user?.role || 'Agent';

    const stats = await userService.getStats(companyId, role);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
