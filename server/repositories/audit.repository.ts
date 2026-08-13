import db from '../database/connection';

export class AuditRepository {
  async getAuditLogs(companyId: string, limit: number) {
    const [rows]: any = await db.query(
      `SELECT al.id, al.action, al.created_at as timestamp, u.email as userEmail, al.details, al.ip_address as ipAddress
       FROM activity_logs al 
       LEFT JOIN users u ON al.user_id = u.id 
       WHERE al.company_id = ? 
       ORDER BY al.created_at DESC LIMIT ?`,
      [companyId, limit]
    );
    return rows;
  }

  async createAuditLog(id: string, companyId: string, userId: string, action: string, detailsJson: string, ipAddress: string) {
    await db.query(
      'INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [id, companyId, userId, action || '', detailsJson, ipAddress]
    );
  }

  async findUserById(userId: string) {
    const [rows]: any = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows;
  }

  async findCompanyUser(companyId: string) {
    const [rows]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [companyId]);
    return rows;
  }

  async findAnyUser() {
    const [rows]: any = await db.query('SELECT id FROM users LIMIT 1');
    return rows;
  }
}

export const auditRepository = new AuditRepository();
