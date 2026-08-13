import { Request, Response } from 'express';
import db from '../database/connection';

export const syncAirports = async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const [rows]: any = await db.query(
      `SELECT code, name, city FROM airports 
       WHERE code LIKE ? OR name LIKE ? OR city LIKE ? 
       LIMIT 10`,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
