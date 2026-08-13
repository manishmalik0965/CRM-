import { settingsRepository } from '../repositories/settings.repository';

export const DEFAULT_SETTINGS = {
  organizationName: 'BLACKGRASS CRM',
  primaryColor: '#0f172a',
  twoFactorEnabled: true,
  globalTwoFactorEnabled: false,
  supportPhone: '+1 800 555 1234',
  supportEmail: 'support@skyway.com',
  logoUrl: '/logo.svg',
  fullAddress: '123 Aviation Blvd, New York, NY 10001',
  customCss: '',
  customFooterHtml: '',
  customDomain: '',
  bccEmail: '',
  smtpProfiles: [
    { email: 'ticketing@skyway.com', appPassword: '', label: 'Main Ticketing' }
  ]
};

export class SettingsService {
  async getPublicSettings(headerTenantId?: string, queryTenantId?: string, reqDomain?: string, referer?: string) {
    let tenantId = headerTenantId || queryTenantId;

    if (!tenantId) {
      let domain = reqDomain;
      if (!domain && referer) {
        try {
          const parsedUrl = new URL(referer);
          domain = parsedUrl.hostname;
        } catch (err) {}
      }
      if (domain) {
        const compRows = await settingsRepository.getCompanyByDomain(domain);
        if (compRows.length > 0) {
          tenantId = compRows[0].id;
        }
      }
    }

    if (!tenantId) {
      tenantId = 'legacy-tenant-1';
    }

    const compRows = await settingsRepository.getCompanyById(tenantId);
    let compName = 'BLACKGRASS CRM';
    if (compRows.length > 0) {
      compName = compRows[0].name;
    }

    const rows = await settingsRepository.getSettingsByCompanyId(tenantId);
    if (rows.length > 0) {
      const settingsObj = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
      return {
        tenantId,
        organizationName: settingsObj?.organizationName || compName,
        primaryColor: settingsObj?.primaryColor || '#0f172a',
        logoUrl: settingsObj?.logoUrl || '/logo.svg'
      };
    }

    return {
      tenantId,
      organizationName: compName,
      primaryColor: '#0f172a',
      logoUrl: '/logo.svg'
    };
  }

  async getSettings(companyId: string) {
    const compRows = await settingsRepository.getCompanyById(companyId);
    let compName = 'BLACKGRASS CRM';
    if (compRows.length > 0) {
      compName = compRows[0].name;
    }

    const dynamicDefaults = {
      ...DEFAULT_SETTINGS,
      organizationName: compName
    };

    const rows = await settingsRepository.getSettingsByCompanyId(companyId);
    if (rows.length > 0) {
      const settingsObj = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
      return { ...dynamicDefaults, ...settingsObj };
    }

    return dynamicDefaults;
  }

  async updateSettings(companyId: string, bodyData: any) {
    const rows = await settingsRepository.getSettingsByCompanyId(companyId);
    let existingSettings = {};
    if (rows.length > 0) {
      existingSettings = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
    }

    const mergedSettings: any = { ...DEFAULT_SETTINGS, ...existingSettings, ...bodyData };

    if (typeof existingSettings === 'object' && (existingSettings as any).emailTemplates && bodyData.emailTemplates) {
      mergedSettings.emailTemplates = {
        ...(existingSettings as any).emailTemplates,
        ...bodyData.emailTemplates
      };
    }

    await settingsRepository.upsertSettings(companyId, JSON.stringify(mergedSettings));
    return mergedSettings;
  }
}

export const settingsService = new SettingsService();
