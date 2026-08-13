import db from '../database/connection';

export class EmailRepository {
  async getSentEmails(companyId: string, query?: string) {
    let sql = 'SELECT * FROM sent_emails WHERE company_id = ?';
    let params: any[] = [companyId];
    
    if (query) {
      sql += ' AND (recipient LIKE ? OR subject LIKE ? OR crm_id LIKE ? OR type LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const [rows]: any = await db.execute(sql, params);
    return rows;
  }
}

export const emailRepository = new EmailRepository();
