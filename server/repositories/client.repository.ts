import db from '../database/connection';

export class ClientRepository {
  async getClients(query?: string) {
    let sql = 'SELECT * FROM companies';
    let params: any[] = [];
    if (query) {
      sql += ' WHERE name LIKE ? OR domain LIKE ?';
      params.push(`%${query}%`, `%${query}%`);
    }
    sql += ' ORDER BY created_at DESC';
    const [rows]: any = await db.query(sql, params);
    return rows;
  }

  async findCompanyById(id: string) {
    const [rows]: any = await db.query('SELECT * FROM companies WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findCompanyByDomain(domain: string) {
    const [rows]: any = await db.query('SELECT * FROM companies WHERE domain = ?', [domain]);
    return rows[0] || null;
  }

  async createCompany(companyData: {
    id: string;
    name: string;
    domain?: string;
    status?: string;
  }) {
    await db.query(
      'INSERT INTO companies (id, name, domain, status) VALUES (?, ?, ?, ?)',
      [companyData.id, companyData.name, companyData.domain || null, companyData.status || 'active']
    );
  }

  async updateCompany(id: string, updateData: {
    name?: string;
    domain?: string;
    status?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (updateData.name !== undefined) { fields.push('name = ?'); params.push(updateData.name); }
    if (updateData.domain !== undefined) { fields.push('domain = ?'); params.push(updateData.domain); }
    if (updateData.status !== undefined) { fields.push('status = ?'); params.push(updateData.status); }

    fields.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE companies SET ${fields.join(', ')} WHERE id = ?`;
    await db.query(sql, params);
  }

  async deleteCompany(id: string) {
    await db.query('DELETE FROM companies WHERE id = ?', [id]);
  }
}

export const clientRepository = new ClientRepository();
