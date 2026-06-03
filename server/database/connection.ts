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
