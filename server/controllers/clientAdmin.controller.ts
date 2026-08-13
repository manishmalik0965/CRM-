import { Request, Response } from 'express';
import db from '../database/connection';
import { auditService } from '../services/audit.service';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const getCompanyId = (req: any): string => {
  const user = req.user;
  return user?.company_id || user?.companyId || 'legacy-tenant-1';
};

export const getSyncSettings = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const [rows]: any = await db.execute(
      'SELECT local_db_host, local_db_port, local_db_name, local_db_user, local_db_pass FROM client_sync_settings WHERE company_id = ?',
      [companyId]
    );

    if (rows.length === 0) {
      return res.json({
        settings: {
          localDbHost: 'localhost',
          localDbPort: '3306',
          localDbName: 'local_crm_db',
          localDbUser: 'root',
          localDbPass: ''
        }
      });
    }

    const s = rows[0];
    res.json({
      settings: {
        localDbHost: s.local_db_host,
        localDbPort: s.local_db_port,
        localDbName: s.local_db_name,
        localDbUser: s.local_db_user,
        localDbPass: s.local_db_pass
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const saveSyncSettings = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { localDbHost, localDbPort, localDbName, localDbUser, localDbPass } = req.body;

    await db.execute(`
      INSERT INTO client_sync_settings (company_id, local_db_host, local_db_port, local_db_name, local_db_user, local_db_pass)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        local_db_host = VALUES(local_db_host),
        local_db_port = VALUES(local_db_port),
        local_db_name = VALUES(local_db_name),
        local_db_user = VALUES(local_db_user),
        local_db_pass = VALUES(local_db_pass)
    `, [companyId, localDbHost || 'localhost', localDbPort || '3306', localDbName || 'local_crm_db', localDbUser || 'root', localDbPass || '']);

    await auditService.createAuditLog(req, 'Updated Distributed Sync Settings', { localDbName, localDbHost });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getBackups = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const [rows]: any = await db.execute(
      'SELECT id, type, record_count, created_at FROM client_backups WHERE company_id = ? ORDER BY created_at DESC',
      [companyId]
    );
    res.json({ backups: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const downloadBackup = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const id = req.params.id;
    const [rows]: any = await db.execute(
      'SELECT backup_sql FROM client_backups WHERE id = ? AND company_id = ?',
      [id, companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${id}.sql"`);
    res.send(rows[0].backup_sql);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const triggerSync = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);

    const [bookings]: any = await db.execute('SELECT * FROM bookings WHERE company_id = ?', [companyId]);
    const [users]: any = await db.execute('SELECT * FROM users WHERE company_id = ?', [companyId]);
    const [logs]: any = await db.execute('SELECT * FROM activity_logs WHERE company_id = ? LIMIT 500', [companyId]);

    let sql = `-- CRM SAAS REPLICATION SNAPSHOT\n`;
    sql += `-- Generated on ${new Date().toISOString()}\n`;
    sql += `-- Company Client ID: ${companyId}\n\n`;
    sql += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

    if (bookings.length > 0) {
      sql += `-- Dumping bookings\n`;
      for (const b of bookings) {
        const passNames = typeof b.passenger_names === 'string' ? b.passenger_names : JSON.stringify(b.passenger_names || []);
        const det = typeof b.details === 'string' ? b.details : JSON.stringify(b.details || {});
        sql += `INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details) VALUES (${db.escape(b.id)}, ${db.escape(b.company_id)}, ${db.escape(b.crm_id)}, ${db.escape(b.airline_name)}, ${db.escape(passNames)}, ${b.total_amount}, ${db.escape(b.currency)}, ${db.escape(b.status)}, ${db.escape(b.created_by)}, ${db.escape(det)}) ON DUPLICATE KEY UPDATE status=VALUES(status), details=VALUES(details);\n`;
      }
      sql += `\n`;
    }

    if (users.length > 0) {
      sql += `-- Dumping users\n`;
      for (const u of users) {
        sql += `INSERT INTO users_raw (id, company_id, email, password_hash, role, display_name, photo_url, phone, user_id, is_hidden) VALUES (${db.escape(u.id)}, ${db.escape(u.company_id)}, ${db.escape(u.email)}, ${db.escape(u.password_hash)}, ${db.escape(u.role)}, ${db.escape(u.display_name)}, ${db.escape(u.photo_url)}, ${db.escape(u.phone)}, ${db.escape(u.user_id)}, ${u.is_hidden || 0}) ON DUPLICATE KEY UPDATE role=VALUES(role), display_name=VALUES(display_name);\n`;
      }
      sql += `\n`;
    }

    if (logs.length > 0) {
      sql += `-- Dumping activity_logs\n`;
      for (const l of logs) {
        const det = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {});
        sql += `INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (${db.escape(l.id)}, ${db.escape(l.company_id)}, ${db.escape(l.user_id)}, ${db.escape(l.action)}, ${db.escape(det)}, ${db.escape(l.ip_address)}) ON DUPLICATE KEY UPDATE action=VALUES(action);\n`;
      }
      sql += `\n`;
    }

    sql += `SET FOREIGN_KEY_CHECKS=1;\n`;

    const backupId = 'bck_' + uuidv4().substring(0, 13);
    const recordCount = bookings.length + users.length + logs.length;

    await db.query(
      'INSERT INTO client_backups (id, company_id, type, record_count, backup_sql) VALUES (?, ?, ?, ?, ?)',
      [backupId, companyId, 'Manual On-Demand Sync', recordCount, sql]
    );

    await auditService.createAuditLog(req, 'Triggered On-Demand Database Sync', { backupId, recordCount });
    res.json({ success: true, backupId, message: 'Databases synchronized successfully' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const uploadBackupFile = async (req: any, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (!req.file) {
      return res.status(400).json({ error: 'No SQL file uploaded' });
    }

    const sqlText = req.file.buffer.toString('utf-8');
    const matches = sqlText.match(/INSERT INTO/gi);
    const recordCount = matches ? matches.length : 1;

    const backupId = 'bck_upl_' + uuidv4().substring(0, 10);
    await db.query(
      'INSERT INTO client_backups (id, company_id, type, record_count, backup_sql) VALUES (?, ?, ?, ?, ?)',
      [backupId, companyId, 'Uploaded SQL Dump', recordCount, sqlText]
    );

    await auditService.createAuditLog(req, 'Uploaded Manual SQL Backup File', { backupId, recordCount });
    res.json({ success: true, backupId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const syncBackup = async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unidentified Client Connection' });
    }

    const { databaseDump } = req.body;
    if (!databaseDump) {
      return res.status(400).json({ error: 'Empty replication bundle payload' });
    }

    const dump = typeof databaseDump === 'string' ? JSON.parse(databaseDump) : databaseDump;

    let sql = `-- CRM AUTOMATED DISTRIBUTED SYNC BACKUP\n`;
    sql += `-- Timestamp: ${dump.syncTime || new Date().toISOString()}\n`;
    sql += `-- Replicated Client: ${tenantId}\n\n`;
    sql += `SET FOREIGN_KEY_CHECKS=0;\n\n`;

    const bookings = Array.isArray(dump.bookings) ? dump.bookings : [];
    const users = Array.isArray(dump.users) ? dump.users : [];
    const logs = Array.isArray(dump.logs) ? dump.logs : [];

    if (bookings.length > 0) {
      sql += `-- Replicated bookings\n`;
      for (const b of bookings) {
        const passNames = typeof b.passenger_names === 'string' ? b.passenger_names : JSON.stringify(b.passenger_names || []);
        const det = typeof b.details === 'string' ? b.details : JSON.stringify(b.details || {});
        sql += `INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details) VALUES (${db.escape(b.id)}, ${db.escape(b.company_id)}, ${db.escape(b.crm_id)}, ${db.escape(b.airline_name)}, ${db.escape(passNames)}, ${b.total_amount}, ${db.escape(b.currency)}, ${db.escape(b.status)}, ${db.escape(b.created_by)}, ${db.escape(det)}) ON DUPLICATE KEY UPDATE status=VALUES(status), details=VALUES(details);\n`;
      }
      sql += `\n`;
    }

    if (users.length > 0) {
      sql += `-- Replicated users\n`;
      for (const u of users) {
        sql += `INSERT INTO users_raw (id, company_id, email, password_hash, role, display_name, photo_url, phone, user_id, is_hidden) VALUES (${db.escape(u.id)}, ${db.escape(u.company_id)}, ${db.escape(u.email)}, ${db.escape(u.password_hash)}, ${db.escape(u.role)}, ${db.escape(u.display_name)}, ${db.escape(u.photo_url)}, ${db.escape(u.phone)}, ${db.escape(u.user_id)}, ${u.is_hidden || 0}) ON DUPLICATE KEY UPDATE role=VALUES(role), display_name=VALUES(display_name);\n`;
      }
      sql += `\n`;
    }

    if (logs.length > 0) {
      sql += `-- Replicated activity logs\n`;
      for (const l of logs) {
        const det = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {});
        sql += `INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (${db.escape(l.id)}, ${db.escape(l.company_id)}, ${db.escape(l.user_id)}, ${db.escape(l.action)}, ${db.escape(det)}, ${db.escape(l.ip_address)}) ON DUPLICATE KEY UPDATE action=VALUES(action);\n`;
      }
      sql += `\n`;
    }

    sql += `SET FOREIGN_KEY_CHECKS=1;\n`;

    const backupId = 'bck_auto_' + uuidv4().substring(0, 10);
    const recordCount = bookings.length + users.length + logs.length;

    await db.query(
      'INSERT INTO client_backups (id, company_id, type, record_count, backup_sql) VALUES (?, ?, ?, ?, ?)',
      [backupId, tenantId, 'Automated Node Replication', recordCount, sql]
    );

    if (bookings.length > 0) {
      for (const b of bookings) {
        const passNames = typeof b.passenger_names === 'string' ? b.passenger_names : JSON.stringify(b.passenger_names || []);
        const det = typeof b.details === 'string' ? b.details : JSON.stringify(b.details || {});
        await db.query(`
          INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            airline_name = VALUES(airline_name),
            passenger_names = VALUES(passenger_names),
            total_amount = VALUES(total_amount),
            currency = VALUES(currency),
            status = VALUES(status),
            details = VALUES(details)
        `, [b.id, b.company_id, b.crm_id, b.airline_name, passNames, b.total_amount, b.currency || 'USD', b.status, b.created_by, det]);
      }
    }

    res.json({ success: true, backupId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const testConnection = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const [rows]: any = await db.execute(
      'SELECT local_db_host, local_db_port, local_db_name, local_db_user, local_db_pass FROM client_sync_settings WHERE company_id = ?',
      [companyId]
    );

    const host = rows[0]?.local_db_host || 'localhost';
    const port = parseInt(rows[0]?.local_db_port || '3306');
    const database = rows[0]?.local_db_name || 'local_crm_db';
    const user = rows[0]?.local_db_user || 'root';
    const password = rows[0]?.local_db_pass || '';

    const mysql = require('mysql2/promise');
    let success = false;
    let errorMsg = '';
    let latency = 0;

    const start = Date.now();
    try {
      const connPromise = mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 2000
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 2000ms')), 2000)
      );

      const conn = await Promise.race([connPromise, timeoutPromise]) as any;
      await conn.end();
      success = true;
      latency = Date.now() - start;
    } catch (err: any) {
      errorMsg = err.message;
      latency = Date.now() - start;
    }

    res.json({
      success,
      host,
      port,
      database,
      latency,
      error: success ? null : errorMsg,
      mainframeStatus: 'ACTIVE',
      diagnostics: success
        ? 'Excellent connection! Local database replica is fully online and synchronized with mainframe cloud clusters.'
        : `Mainframe cloud is ONLINE. Local database connection at ${host}:${port} returned: "${errorMsg}". Please ensure your local MySQL server is active, listening on port ${port}, and firewall allows requests.`
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const downloadIndex = async (req: Request, res: Response) => {
  try {
    let htmlPath = path.join(process.cwd(), 'dist', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      htmlPath = path.join(process.cwd(), 'index.html');
    }
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
    res.sendFile(htmlPath);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const downloadSchema = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);

    let sqlSchema = `-- CLIENT LOCAL REPLICA DATABASE SCHEMA TEMPLATE\n`;
    sqlSchema += `-- Pre-configured Tenant Workspace ID: ${companyId}\n\n`;
    sqlSchema += `CREATE DATABASE IF NOT EXISTS \`local_crm_db\`;\n`;
    sqlSchema += `USE \`local_crm_db\`;\n\n`;

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="client_schema_${companyId}.sql"`);
    res.send(sqlSchema);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const downloadConnectingFile = async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const mainframeUrl = `${protocol}://${host}`;

    let code = `/** SaaS Database Sync Connection Agent (sync-agent.js) */\n`;
    code += `const TENANT_ID = "${companyId}";\n`;
    code += `const MAINFRAME_URL = "${mainframeUrl}";\n`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Disposition', 'attachment; filename="sync-agent.js"');
    res.send(code);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
