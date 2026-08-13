import db from '../database/connection';

export class SettingsRepository {
  async getCompanyById(id: string) {
    const [rows]: any = await db.query('SELECT name FROM companies WHERE id = ?', [id]);
    return rows;
  }

  async getCompanyByDomain(domain: string) {
    const [rows]: any = await db.query('SELECT id FROM companies WHERE domain = ?', [domain]);
    return rows;
  }

  async getSettingsByCompanyId(companyId: string) {
    const [rows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [companyId]);
    return rows;
  }

  async upsertSettings(companyId: string, settingsJson: string) {
    const [rows]: any = await db.query('SELECT id FROM settings WHERE company_id = ?', [companyId]);
    if (rows.length > 0) {
      await db.query('UPDATE settings SET settings_json = ?, updated_at = NOW() WHERE company_id = ?', [settingsJson, companyId]);
    } else {
      await db.query('INSERT INTO settings (id, company_id, settings_json) VALUES (UUID(), ?, ?)', [companyId, settingsJson]);
    }
  }
}

export const settingsRepository = new SettingsRepository();
