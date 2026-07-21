import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'crm_saas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to filter out Superadmin role from standard client queries to enforce client-side isolation
function filterSuperadmin(queryStr: string, rows: any[]): any[] {
  if (!rows || !Array.isArray(rows)) return rows;
  
  const lowerQuery = String(queryStr || '').toLowerCase();
  
  // Let standard singular authentications (login by email, select by id) bypass
  // so the auth system continues working normally for Superadmins themselves.
  const isSingleLookup = lowerQuery.includes('where email') || 
                         lowerQuery.includes('where id') || 
                         lowerQuery.includes('where user_id') ||
                         lowerQuery.includes('limit 1');
  
  if (isSingleLookup && rows.length === 1) {
    return rows;
  }
  
  return rows.filter((row: any) => {
    if (row && typeof row === 'object') {
      const role = String(row.role || '').toLowerCase();
      if (role === 'superadmin' || role === 'super admin' || role === 'system admin') {
        return false;
      }
    }
    return true;
  });
}

// Proxy the Pool methods to transparently enforce tenant isolation and role shielding
const originalQuery = pool.query;
const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;

pool.query = async function(...args: any[]) {
  const result = await originalQuery.apply(this, args as any);
  if (result && Array.isArray(result[0])) {
    const queryStr = String(args[0] || '');
    result[0] = filterSuperadmin(queryStr, result[0]);
  }
  return result;
} as any;

pool.execute = async function(...args: any[]) {
  const result = await originalExecute.apply(this, args as any);
  if (result && Array.isArray(result[0])) {
    const queryStr = String(args[0] || '');
    result[0] = filterSuperadmin(queryStr, result[0]);
  }
  return result;
} as any;

pool.getConnection = async function() {
  const conn = await originalGetConnection.apply(this);
  const origQuery = conn.query;
  const origExecute = conn.execute;
  
  conn.query = async function(...args: any[]) {
    const result = await origQuery.apply(this, args as any);
    if (result && Array.isArray(result[0])) {
      const queryStr = String(args[0] || '');
      result[0] = filterSuperadmin(queryStr, result[0]);
    }
    return result;
  } as any;
  
  conn.execute = async function(...args: any[]) {
    const result = await origExecute.apply(this, args as any);
    if (result && Array.isArray(result[0])) {
      const queryStr = String(args[0] || '');
      result[0] = filterSuperadmin(queryStr, result[0]);
    }
    return result;
  } as any;
  
  return conn;
} as any;

export default pool;

pool.query('ALTER TABLE users ADD COLUMN display_name VARCHAR(255)').catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN photo_url VARCHAR(500)').catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(100)').catch(() => {});
pool.query('ALTER TABLE users ADD COLUMN user_id VARCHAR(255) UNIQUE').catch(() => {});
pool.query('ALTER TABLE bookings ADD COLUMN details JSON').catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS settings (
    company_id CHAR(36) PRIMARY KEY,
    settings_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  )
`).catch((err) => { console.error("Error creating settings table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS client_backups (
    id VARCHAR(255) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    type VARCHAR(255) DEFAULT 'Automatic Sync',
    record_count INT DEFAULT 0,
    backup_sql LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  )
`).catch((err) => { console.error("Error creating client_backups table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS client_sync_settings (
    company_id CHAR(36) PRIMARY KEY,
    local_db_host VARCHAR(255) DEFAULT 'localhost',
    local_db_port VARCHAR(50) DEFAULT '3306',
    local_db_name VARCHAR(255) DEFAULT 'local_crm_db',
    local_db_user VARCHAR(255) DEFAULT 'root',
    local_db_pass VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  )
`).catch((err) => { console.error("Error creating client_sync_settings table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).catch((err) => { console.error("Error creating activity_logs table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS uploaded_files (
    id VARCHAR(255) PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    buffer LONGBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch((err) => { console.error("Error creating uploaded_files table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS airports (
    iata CHAR(3) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255),
    state VARCHAR(255),
    country VARCHAR(255)
  )
`).catch((err) => { console.error("Error creating airports table dynamically:", err); });

pool.query(`
  CREATE TABLE IF NOT EXISTS sent_emails (
    id VARCHAR(255) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    booking_id VARCHAR(255) NULL,
    crm_id VARCHAR(100) NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html LONGTEXT NOT NULL,
    type VARCHAR(100) NOT NULL,
    sent_by VARCHAR(255) NULL,
    data_sent JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  )
`).catch((err) => { console.error("Error creating sent_emails table dynamically:", err); });

// Seed default company to allow foreign key checks to pass for legacy-tenant-1
async function seedDefaultCompany() {
  try {
    const [rows]: any = await pool.query("SELECT id FROM companies WHERE id = 'legacy-tenant-1'");
    if (rows.length === 0) {
      await pool.query("INSERT INTO companies (id, name, domain) VALUES ('legacy-tenant-1', 'Default Company', 'localhost') ON DUPLICATE KEY UPDATE id=id");
      console.log('Seeded default company legacy-tenant-1 successfully.');
    }
    
    // Seed default admin users
    const [userRows]: any = await pool.query("SELECT id FROM users WHERE email = 'manishmalik0965@gmail.com'");
    if (userRows.length === 0) {
      const hash = await bcrypt.hash('password_123', 10);
      await pool.query(
        "INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES ('default-admin-1', 'legacy-tenant-1', 'manishmalik0965@gmail.com', ?, 'Admin', 'Manish Malik', 'manish')",
        [hash]
      );
      console.log('Seeded default admin user manishmalik0965@gmail.com successfully.');
    } else {
      await pool.query("UPDATE users SET user_id = 'manish' WHERE email = 'manishmalik0965@gmail.com' AND user_id IS NULL");
    }

    const [userRows2]: any = await pool.query("SELECT id FROM users WHERE email = 'itconflict0@gmail.com'");
    if (userRows2.length === 0) {
      const hash2 = await bcrypt.hash('password_123', 10);
      await pool.query(
        "INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES ('default-admin-2', 'legacy-tenant-1', 'itconflict0@gmail.com', ?, 'Admin', 'IT Conflict', 'itconflict')",
        [hash2]
      );
      console.log('Seeded default admin user itconflict0@gmail.com successfully.');
    } else {
      await pool.query("UPDATE users SET user_id = 'itconflict' WHERE email = 'itconflict0@gmail.com' AND user_id IS NULL");
    }
  } catch (err) {
    console.error("Error seeding default company and users:", err);
  }
}
seedDefaultCompany();
