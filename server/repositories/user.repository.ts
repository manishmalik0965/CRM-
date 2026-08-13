import db from '../database/connection';

export class UserRepository {
  async findUsers(companyId: string, isLandlordOrSuperadmin: boolean = false) {
    let sql = '';
    let params: any[] = [];

    if (isLandlordOrSuperadmin) {
      sql = 'SELECT u.id, u.company_id, u.email, u.display_name, u.role, u.totp_enabled, u.created_at, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id ORDER BY u.created_at DESC';
    } else {
      sql = 'SELECT u.id, u.company_id, u.email, u.display_name, u.role, u.totp_enabled, u.created_at, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.company_id = ? ORDER BY u.created_at DESC';
      params = [companyId];
    }

    const [rows]: any = await db.query(sql, params);
    return rows;
  }

  async findUserById(id: string) {
    const [rows]: any = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findUserByEmailOrUsername(identifier: string, companyId?: string) {
    let sql = 'SELECT * FROM users WHERE (email = ? OR user_id = ?)';
    let params: any[] = [identifier, identifier];
    if (companyId) {
      sql += ' AND company_id = ?';
      params.push(companyId);
    }
    const [rows]: any = await db.query(sql, params);
    return rows[0] || null;
  }

  async createUser(userData: {
    id: string;
    companyId: string;
    email: string;
    passwordHash: string;
    displayName: string;
    role: string;
    userId?: string;
  }) {
    await db.query(
      'INSERT INTO users (id, company_id, email, password_hash, display_name, role, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userData.id, userData.companyId, userData.email, userData.passwordHash, userData.displayName, userData.role, userData.userId || null]
    );
  }

  async updateUser(id: string, userData: {
    displayName?: string;
    role?: string;
    passwordHash?: string;
    email?: string;
    userId?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (userData.displayName !== undefined) { fields.push('display_name = ?'); params.push(userData.displayName); }
    if (userData.role !== undefined) { fields.push('role = ?'); params.push(userData.role); }
    if (userData.passwordHash !== undefined) { fields.push('password_hash = ?'); params.push(userData.passwordHash); }
    if (userData.email !== undefined) { fields.push('email = ?'); params.push(userData.email); }
    if (userData.userId !== undefined) { fields.push('user_id = ?'); params.push(userData.userId); }

    fields.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    await db.query(sql, params);
  }

  async deleteUser(id: string) {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
  }

  async getStats(companyId: string, isLandlordOrSuperadmin: boolean = false) {
    let userCountSql = isLandlordOrSuperadmin ? 'SELECT COUNT(*) as cnt FROM users' : 'SELECT COUNT(*) as cnt FROM users WHERE company_id = ?';
    let bookingCountSql = isLandlordOrSuperadmin ? 'SELECT COUNT(*) as cnt FROM bookings' : 'SELECT COUNT(*) as cnt FROM bookings WHERE company_id = ?';
    let revenueSql = isLandlordOrSuperadmin ? 'SELECT SUM(total_amount) as total FROM bookings WHERE status = "ticketed"' : 'SELECT SUM(total_amount) as total FROM bookings WHERE company_id = ? AND status = "ticketed"';

    const params = isLandlordOrSuperadmin ? [] : [companyId];

    const [[usersRes]]: any = await db.query(userCountSql, params);
    const [[bookingsRes]]: any = await db.query(bookingCountSql, params);
    const [[revenueRes]]: any = await db.query(revenueSql, params);

    return {
      userCount: usersRes?.cnt || 0,
      bookingCount: bookingsRes?.cnt || 0,
      totalRevenue: revenueRes?.total || 0
    };
  }
}

export const userRepository = new UserRepository();
