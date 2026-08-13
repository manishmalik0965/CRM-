import { Request, Response } from 'express';
import { emailService } from '../services/email.service';

export const getSentEmails = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const query = req.query.query as string;

    const emails = await emailService.getSentEmails(companyId, query);
    res.json({ emails });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
