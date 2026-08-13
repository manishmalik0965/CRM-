import { auditRepository } from '../repositories/audit.repository';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  async getAuditLogs(companyId: string, limit: number = 50) {
    const rows = await auditRepository.getAuditLogs(companyId, limit);

    return rows.map((row: any) => {
      let detailsStr = '';
      let bookingIdVal = null;
      let preciseTimestampVal = null;
      if (row.details) {
        try {
          const detailsObj = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
          bookingIdVal = detailsObj?.bookingId || null;
          preciseTimestampVal = detailsObj?.preciseTimestamp || null;
          if (detailsObj) {
            if (detailsObj.details) {
              detailsStr = detailsObj.details;
            } else {
              detailsStr = Object.entries(detailsObj)
                .filter(([k]) => k !== 'bookingId' && k !== 'preciseTimestamp')
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(' | ');
            }
          }
        } catch (e) {
          detailsStr = row.details;
        }
      }

      return {
        id: row.id,
        action: row.action,
        timestamp: preciseTimestampVal || row.timestamp,
        userEmail: row.userEmail || 'Internal Staff',
        details: detailsStr,
        bookingId: bookingIdVal,
        ipAddress: row.ipAddress || 'Unknown'
      };
    });
  }

  async createAuditLog(req: any, action: string, details: any, bookingId?: string, tenantId?: string) {
    const companyId = tenantId || req.companyId || 'legacy-tenant-1';
    let userId = req.userId || 'default-admin-1';

    // Verify user exists
    const userExists = await auditRepository.findUserById(userId);
    if (userExists.length === 0) {
      const companyUsers = await auditRepository.findCompanyUser(companyId);
      if (companyUsers.length > 0) {
        userId = companyUsers[0].id;
      } else {
        const anyUsers = await auditRepository.findAnyUser();
        if (anyUsers.length > 0) {
          userId = anyUsers[0].id;
        }
      }
    }

    const id = uuidv4();
    const ipAddress = req.ip || req.headers?.['x-forwarded-for'] || 'Unknown';
    const detailsJson = JSON.stringify({
      details,
      bookingId,
      preciseTimestamp: new Date().toISOString()
    });

    await auditRepository.createAuditLog(id, companyId, userId, action || '', detailsJson, ipAddress);
    return { success: true, logId: id };
  }

  async logClientRuntimeError(reqBody: any, reqHeaders: any, reqIp: string, authUser?: { companyId?: string; id?: string }) {
    const { message, stack, url, method, status, responseText, type, userAgent, error } = reqBody;

    console.error('--- [CLIENT ERROR CAPTURED BY LOGGER] ---');
    console.error('Type:', type);
    console.error('Message:', message);
    console.error('Stack:', stack);
    console.error('URL:', url);
    console.error('Method:', method);
    console.error('Status:', status);
    console.error('Response:', responseText);
    console.error('Error object:', error);
    console.error('------------------------------------------');

    const companyId = authUser?.companyId || 'legacy-tenant-1';
    let userId = authUser?.id || 'default-admin-1';

    const userExists = await auditRepository.findUserById(userId);
    if (userExists.length === 0) {
      const companyUsers = await auditRepository.findCompanyUser(companyId);
      if (companyUsers.length > 0) {
        userId = companyUsers[0].id;
      } else {
        const anyUsers = await auditRepository.findAnyUser();
        if (anyUsers.length > 0) {
          userId = anyUsers[0].id;
        }
      }
    }

    const id = uuidv4();
    const action = type === 'api' ? 'Failed API Response' : 'Client Runtime Error';
    const detailsJson = JSON.stringify({
      message,
      stack,
      url,
      method,
      status,
      responseText,
      userAgent: userAgent || reqHeaders['user-agent'],
      error,
      preciseTimestamp: new Date().toISOString()
    });
    const ipAddress = reqIp || reqHeaders['x-forwarded-for'] || 'Unknown';

    await auditRepository.createAuditLog(id, companyId, userId, action, detailsJson, ipAddress);
    return { success: true, logId: id };
  }
}

export const auditService = new AuditService();
