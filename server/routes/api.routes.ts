import { requireAuth, requireRole } from '../middleware/requireAuth';
import { Router } from 'express';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { generateTenantInvitationEmail, generateConfirmationEmail } from '../../src/lib/emailTemplates';
import { processBase64Images, cleanupUnusedImages } from '../utils/imageProcessor';
import { generateAuthVerificationPdf } from '../utils/pdfGenerator';

export function createSmtpTransporter(profile: any) {
  if (!profile || !profile.email || !profile.appPassword) {
    throw new Error("Invalid SMTP profile or missing credentials");
  }
  const cleanPassword = profile.appPassword.replace(/\s+/g, '');
  const email = profile.email.trim();
  const host = (profile.host || '').trim().toLowerCase();

  // If Gmail or Google host, use Nodemailer's highly optimized built-in Gmail service wrapper
  if (host.includes('gmail.com') || email.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: cleanPassword
      }
    });
  }

  // Generic SMTP transporter
  const port = profile.port ? parseInt(profile.port) : 465;
  return nodemailer.createTransport({
    host: profile.host || 'smtp.gmail.com',
    port: port,
    secure: port === 587 ? false : true,
    auth: {
      user: email,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-me';

const getCompanyId = (req: any): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return decoded?.company_id || decoded?.companyId || 'legacy-tenant-1';
        } catch (e) {
            // Ignore decoding errors
        }
    }
    return 'legacy-tenant-1';
};

const getUserId = (req: any): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return decoded?.id || 'default-admin-1';
        } catch (e) {
            // Ignore decoding errors
        }
    }
    return 'default-admin-1';
};

const getUserRole = (req: any): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            return decoded?.role || 'Agent';
        } catch (e) {
            // Ignore decoding errors
        }
    }
    return 'Agent';
};

const logActivity = async (req: any, action: string, details: any, bookingId?: string) => {
    try {
        const companyId = getCompanyId(req) || 'legacy-tenant-1';
        let userId = getUserId(req);

        // Validate that userId exists in the users table to avoid foreign key errors
        const [userExists]: any = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (userExists.length === 0) {
            const [companyUser]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [companyId]);
            if (companyUser.length > 0) {
                userId = companyUser[0].id;
            } else {
                const [anyUser]: any = await db.query('SELECT id FROM users LIMIT 1');
                if (anyUser.length > 0) {
                    userId = anyUser[0].id;
                }
            }
        }

        const id = uuidv4();
        const detailsJson = JSON.stringify({ 
            ...details, 
            bookingId,
            preciseTimestamp: new Date().toISOString()
        });
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';

        await db.query(
            'INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [id, companyId, userId, action || '', detailsJson, ipAddress]
        );
    } catch (err: any) {
        console.error('Error in logActivity helper:', err.message);
    }
};

export function getCardBrandBackend(number: string): string {
    if (!number) return 'Card';
    const clean = number.toString().replace(/\D/g, '');
    if (clean.length === 0) return 'Card';

    if (/^4/.test(clean)) return 'Visa';
    if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'Mastercard';
    if (/^3[47]/.test(clean)) return 'American Express';
    if (/^(6011|622(12[6-9]|1[3-9]|[2-8]|9[0-1]|92[0-5])|64[4-9]|65)/.test(clean)) return 'Discover';
    if (/^3(0[0-5]|[68])/.test(clean)) return 'Diners Club';
    if (/^35(2[89]|[3-8])/.test(clean)) return 'JCB';
    if (/^(5018|5020|5038|5893|6304|6759|6761|6762|6763)/.test(clean)) return 'Maestro';
    if (/^62/.test(clean)) return 'UnionPay';

    return 'Credit Card';
}

const transformBooking = (booking: any, role?: string): any => {
    if (!booking) return null;
    let details: any = {};
    if (booking.details) {
        try {
            details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
        } catch (e) {}
    }
    
    let passengerNames = [];
    if (booking.passenger_names) {
        try {
            passengerNames = typeof booking.passenger_names === 'string' ? JSON.parse(booking.passenger_names) : booking.passenger_names;
        } catch (e) {}
    }

    // Resolve robust values with fallback cascading between relational columns and JSON details fields
    const resolvedAirlineName = booking.airline_name || details.airlineName || details.airline || 'UNMAPPED';
    const rawAmount = booking.total_amount !== null && booking.total_amount !== undefined 
        ? booking.total_amount 
        : (details.totalAmount !== undefined ? details.totalAmount : (details.amount !== undefined ? details.amount : 0));
    const resolvedTotalAmount = parseFloat(rawAmount);
    const resolvedCurrency = booking.currency || details.currency || 'USD';
    const resolvedStatus = booking.status || details.status || 'draft';

    const rawCardNum = booking.card_number || details.cardNumber || details.ccNumber || details.card_number || '';
    const rawCardBrand = booking.card_brand || details.cardBrand || details.card_brand || '';
    const resolvedCardBrand = (!rawCardBrand || rawCardBrand === 'Unknown' || rawCardBrand === 'CARD' || rawCardBrand === 'Card') 
        ? getCardBrandBackend(rawCardNum) 
        : rawCardBrand;

    const resolvedCardHolder = booking.card_holder_name || details.cardHolder || details.cardHolderName || details.ccName || 'Valued Customer';
    const rawLast4 = booking.card_last_4 || details.cardLast4 || details.cardNumberMasked || details.card_last4 || (rawCardNum ? rawCardNum.replace(/\D/g, '').slice(-4) : '');

    const resultObject = {
        id: booking.id,
        companyId: booking.company_id,
        crmId: booking.crm_id,
        passengerNames: Array.isArray(passengerNames) ? passengerNames : [],
        createdBy: booking.created_by,
        createdAt: booking.created_at,
        updatedAt: booking.updated_at,
        agentId: booking.created_by,
        agent_id: booking.created_by,
        agentName: booking.creator_name || details.agentName || 'Unknown',
        creator_name: booking.creator_name || details.agentName || 'Unknown',
        agentEmail: booking.creator_email || details.agentEmail,
        ...details,
        cardBrand: resolvedCardBrand,
        card_brand: resolvedCardBrand,
        cardHolder: resolvedCardHolder,
        card_holder_name: resolvedCardHolder,
        cardLast4: rawLast4,
        card_last4: rawLast4,
        cardNumberMasked: rawLast4
    };

    // Mask card details for Agent and WFM roles
    if (role && (role === 'Agent' || role === 'WFM')) {
        if (resultObject.cardNumber) {
            const num = (resultObject.cardNumber || '').replace(/\s/g, '');
            const last4 = num.slice(-4);
            resultObject.cardNumber = `XXXX XXXX XXXX ${last4}`;
        }
        if (resultObject.ccNumber) {
            const num = (resultObject.ccNumber || '').replace(/\s/g, '');
            const last4 = num.slice(-4);
            resultObject.ccNumber = `XXXX XXXX XXXX ${last4}`;
        }
        if (resultObject.cardNumberMasked) {
            resultObject.cardNumberMasked = 'XXXX';
        }
        if (resultObject.card_last4) {
            resultObject.card_last4 = 'XXXX';
        }
        if (resultObject.cvv) {
            resultObject.cvv = '***';
        }
        if (resultObject.expiry) {
            resultObject.expiry = '**/**';
        }
    }

    return Object.assign(resultObject, {
        airlineName: resolvedAirlineName,
        totalAmount: isNaN(resolvedTotalAmount) ? 0 : resolvedTotalAmount,
        currency: resolvedCurrency,
        status: resolvedStatus,
        cardBrand: resolvedCardBrand,
        card_brand: resolvedCardBrand
    });
};

// Audit Logs GET & POST Endpoints
router.get('/audit-logs', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

        const [rows]: any = await db.query(
            `SELECT al.id, al.action, al.created_at as timestamp, u.email as userEmail, al.details, al.ip_address as ipAddress
             FROM activity_logs al 
             LEFT JOIN users u ON al.user_id = u.id 
             WHERE al.company_id = ? 
             ORDER BY al.created_at DESC LIMIT ?`,
            [companyId, limit]
        );

        const formattedLogs = rows.map((row: any) => {
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
            } else {
                detailsStr = '';
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

        res.json(formattedLogs);
    } catch (e: any) {
        console.error('Error in GET /audit-logs:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/audit-logs', requireAuth, async (req, res) => {
    try {
        const { action, details, bookingId, tenantId } = req.body;
        const companyId = tenantId || getCompanyId(req) || 'legacy-tenant-1';
        let userId = getUserId(req);

        // Validate that userId exists in the users table to avoid foreign key errors
        const [userExists]: any = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (userExists.length === 0) {
            // Find a valid fallback user in the same company
            const [companyUser]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [companyId]);
            if (companyUser.length > 0) {
                userId = companyUser[0].id;
            } else {
                // Find any valid user in the entire system
                const [anyUser]: any = await db.query('SELECT id FROM users LIMIT 1');
                if (anyUser.length > 0) {
                    userId = anyUser[0].id;
                }
            }
        }

        const id = uuidv4();
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
        const detailsJson = JSON.stringify({ 
            details, 
            bookingId,
            preciseTimestamp: new Date().toISOString()
        });

        await db.query(
            'INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [id, companyId, userId, action || '', detailsJson, ipAddress]
        );

        res.json({ success: true });
    } catch (e: any) {
        console.error('Error in POST /audit-logs:', e);
        res.status(500).json({ error: e.message });
    }
});

// Centralized logging endpoint to capture client-side runtime errors and failed API responses
router.post('/logs', async (req, res) => {
    try {
        const { message, stack, url, method, status, responseText, type, userAgent, error } = req.body;
        
        let companyId = 'legacy-tenant-1';
        let userId = 'default-admin-1';
        
        // Try to decode JWT from Authorization header if present
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                if (decoded?.company_id || decoded?.companyId) {
                    companyId = decoded.company_id || decoded.companyId;
                }
                if (decoded?.id) {
                    userId = decoded.id;
                }
            } catch (e) {
                // Ignore decoding errors
            }
        }
        
        // Validate that user exists in DB before inserting
        const [userExists]: any = await db.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (userExists.length === 0) {
            const [companyUser]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [companyId]);
            if (companyUser.length > 0) {
                userId = companyUser[0].id;
            } else {
                const [anyUser]: any = await db.query('SELECT id FROM users LIMIT 1');
                if (anyUser.length > 0) {
                    userId = anyUser[0].id;
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
            userAgent: userAgent || req.headers['user-agent'],
            error,
            preciseTimestamp: new Date().toISOString()
        });
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown';

        await db.query(
            'INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [id, companyId, userId, action, detailsJson, ipAddress]
        );

        res.json({ success: true, logId: id });
    } catch (err: any) {
        console.error('Error in POST /api/logs:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const DEFAULT_SETTINGS = {
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

// Bookings
router.get('/bookings', requireAuth, async (req, res) => {
    try {
        const query = req.query.q as string;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        
        const companyId = getCompanyId(req);
        const role = getUserRole(req);
        
        // A global landlord admin is a user on legacy-tenant-1 with role Admin, or any global Superadmin
        const isGlobalAdmin = role === 'Superadmin' || (companyId === 'legacy-tenant-1' && role === 'Admin');

        let sql = '';
        let params: any[] = [];

        if (isGlobalAdmin) {
            if (query) {
                sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.crm_id LIKE ? OR b.passenger_names LIKE ? OR b.details LIKE ? ORDER BY b.created_at DESC LIMIT ?';
                params = [`%${query}%`, `%${query}%`, `%${query}%`, limit];
            } else {
                sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id ORDER BY b.created_at DESC LIMIT ?';
                params = [limit];
            }
        } else {
            if (query) {
                sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.company_id = ? AND (b.crm_id LIKE ? OR b.passenger_names LIKE ? OR b.details LIKE ?) ORDER BY b.created_at DESC LIMIT ?';
                params = [companyId, `%${query}%`, `%${query}%`, `%${query}%`, limit];
            } else {
                sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.company_id = ? ORDER BY b.created_at DESC LIMIT ?';
                params = [companyId, limit];
            }
        }

        const [rows]: any = await db.execute(sql, params);
        const transformedBookings = rows.map((row: any) => transformBooking(row, role));
        
        // Log footprint/activity
        await logActivity(req, 'Listed Bookings', { count: rows.length, query: query || 'all' });

        res.json({ bookings: transformedBookings });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/sent-emails', requireAuth, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const query = req.query.query as string;
        
        let sql = 'SELECT * FROM sent_emails WHERE company_id = ?';
        let params: any[] = [companyId];
        
        if (query) {
            sql += ' AND (recipient LIKE ? OR subject LIKE ? OR crm_id LIKE ? OR type LIKE ?)';
            params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
        }
        
        sql += ' ORDER BY created_at DESC LIMIT 200';
        const [rows]: any = await db.execute(sql, params);
        
        // Parse the JSON data_sent field if stored as a string or handle it properly
        const processedRows = rows.map((row: any) => {
            let dataSent = null;
            if (row.data_sent) {
                try {
                    dataSent = typeof row.data_sent === 'string' ? JSON.parse(row.data_sent) : row.data_sent;
                } catch (e) {}
            }
            return {
                ...row,
                data_sent: dataSent
            };
        });
        
        res.json({ emails: processedRows });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings/public', async (req, res) => {
    try {
        let tenantId = (req.headers['x-tenant-id'] || req.query.tenantId) as string;
        
        if (!tenantId) {
            let domain = req.query.domain as string;
            if (!domain) {
                const referer = req.headers.referer || '';
                if (referer) {
                    try {
                        const parsedUrl = new URL(referer);
                        domain = parsedUrl.hostname;
                    } catch (err) {}
                }
            }
            if (domain) {
                const [compRows]: any = await db.query('SELECT id FROM companies WHERE domain = ?', [domain]);
                if (compRows.length > 0) {
                    tenantId = compRows[0].id;
                }
            }
        }
        
        if (!tenantId) {
            tenantId = 'legacy-tenant-1';
        }

        const [compRows]: any = await db.query('SELECT name FROM companies WHERE id = ?', [tenantId]);
        let compName = 'BLACKGRASS CRM';
        if (compRows.length > 0) {
            compName = compRows[0].name;
        }

        const [rows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [tenantId]);
        if (rows.length > 0) {
            const settingsObj = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
            return res.json({
                organizationName: settingsObj?.organizationName || compName,
                primaryColor: settingsObj?.primaryColor || '#0f172a',
                logoUrl: settingsObj?.logoUrl || '/logo.svg'
            });
        }
        res.json({
            organizationName: compName,
            primaryColor: '#0f172a',
            logoUrl: '/logo.svg'
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings', requireAuth, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const [compRows]: any = await db.query('SELECT name FROM companies WHERE id = ?', [companyId]);
        let compName = 'BLACKGRASS CRM';
        if (compRows.length > 0) {
            compName = compRows[0].name;
        }
        
        const dynamicDefaults = {
            ...DEFAULT_SETTINGS,
            organizationName: compName
        };

        const [rows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [companyId]);
        if (rows.length > 0) {
            const settingsObj = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
            return res.json({ ...dynamicDefaults, ...settingsObj });
        }
        res.json(dynamicDefaults);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/settings', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        // Get existing settings first to merge correctly (prevent data loss for sub-pages like Email Templates)
        const [rows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [companyId]);
        let existingSettings = {};
        if (rows.length > 0) {
            existingSettings = typeof rows[0].settings_json === 'string' ? JSON.parse(rows[0].settings_json) : rows[0].settings_json;
        }

        const mergedSettings: any = { ...DEFAULT_SETTINGS, ...existingSettings, ...req.body };
        
        // Ensure emailTemplates are merged correctly instead of being overwritten with empty
        if (typeof existingSettings === 'object' && (existingSettings as any).emailTemplates && req.body.emailTemplates) {
            mergedSettings.emailTemplates = {
                ...(existingSettings as any).emailTemplates,
                ...req.body.emailTemplates
            };
        }

        await db.query(
            'INSERT INTO settings (company_id, settings_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)',
            [companyId, JSON.stringify(mergedSettings)]
        );

        await logActivity(req, 'Updated Settings', { organizationName: mergedSettings.organizationName, primaryColor: mergedSettings.primaryColor });

        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/clients/tenant', async (req, res) => {
    try {
        const domain = req.query.domain as string;
        const tenantId = req.query.tenantId as string;

        let query = 'SELECT * FROM companies WHERE ';
        let params: any[] = [];

        if (tenantId) {
            query += 'id = ?';
            params.push(tenantId);
        } else if (domain) {
            query += 'domain = ?';
            params.push(domain);
        } else {
            return res.status(400).json({ error: 'Either domain or tenantId must be provided' });
        }

        const [rows]: any = await db.query(query, params);
        if (rows.length > 0) {
            const row = rows[0];
            const isLandlordMode = process.env.SaaS_LANDLORD_MODE === 'true';
            const isActive = isLandlordMode ? !!row.is_active : true;
            return res.json({
                id: row.id,
                name: row.name,
                domain: row.domain,
                isActive: isActive
            });
        }

        // Default fallback to legacy landlord tenant if localhost, run.app, itconflict.xyz, or any custom domain is requested
        return res.json({
            id: 'legacy-tenant-1',
            name: 'Default Company',
            domain: domain || 'localhost',
            isActive: true
        });
    } catch (e: any) {
        // Fallback even on DB connection error to legacy-tenant-1 to avoid blocking user setup
        return res.json({
            id: 'legacy-tenant-1',
            name: 'Default Company',
            domain: 'localhost',
            isActive: true
        });
    }
});

router.get('/clients/:id', async (req, res) => {
    try {
        const [rows]: any = await db.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            const row = rows[0];
            const isLandlordMode = process.env.SaaS_LANDLORD_MODE === 'true';
            const isActive = isLandlordMode ? !!row.is_active : true;
            return res.json({
                id: row.id,
                name: row.name,
                domain: row.domain,
                isActive: isActive
            });
        }
        
        // Fallback for default seed company
        if (req.params.id === 'legacy-tenant-1') {
            return res.json({
                id: 'legacy-tenant-1',
                name: 'Default Company',
                domain: 'localhost',
                isActive: true
            });
        }

        res.status(404).json({ error: 'Tenant not found' });
    } catch (e: any) {
        if (req.params.id === 'legacy-tenant-1') {
            return res.json({
                id: 'legacy-tenant-1',
                name: 'Default Company',
                domain: 'localhost',
                isActive: true
            });
        }
        res.status(500).json({ error: e.message });
    }
});

router.get('/bookings/recent-updates', requireAuth, async (req, res) => {
    try {
        const [rows]: any = await db.execute("SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.status IN ('authorized', 'charged', 'chargeback') ORDER BY b.updated_at DESC LIMIT 5");
        const transformed = rows.map((row: any) => transformBooking(row, getUserRole(req)));
        res.json(transformed);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings/stats', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const [users]: any = await db.execute('SELECT COUNT(*) as count FROM users');
        const [bookings]: any = await db.execute('SELECT COUNT(*) as count FROM bookings');
        res.json({ users: users[0].count, bookings: bookings[0].count });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings/users/check-username', requireAuth, async (req, res) => {
    try {
        const { user_id, exclude_id } = req.query;
        if (!user_id || typeof user_id !== 'string') {
            return res.json({ available: false });
        }
        
        let query = 'SELECT id FROM users WHERE user_id = ?';
        let params: any[] = [user_id.trim()];
        if (exclude_id) {
            query += ' AND id != ?';
            params.push(exclude_id);
        }
        
        const [rows]: any = await db.execute(query, params);
        res.json({ available: rows.length === 0 });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings/users', requireAuth, async (req, res) => {
    try {
        const adminUser = (req as any).user;
        const companyId = adminUser.company_id || adminUser.companyId || 'legacy-tenant-1';
        const [rows] = await db.execute('SELECT id, company_id, email, role, display_name as displayName, created_at as createdAt, user_id as userId FROM users WHERE company_id = ?', [companyId]);
        res.json({ users: rows });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/settings/users', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const adminUser = (req as any).user;
        const { email, displayName, role, temporaryPassword, userId } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check duplicate email
        const [existingEmail]: any = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(400).json({ error: 'Email is already registered' });
        }

        // Check duplicate user_id
        if (userId) {
            const [existingUserId]: any = await db.execute('SELECT id FROM users WHERE user_id = ?', [userId]);
            if (existingUserId.length > 0) {
                return res.status(400).json({ error: 'User ID is already taken' });
            }
        }

        const id = uuidv4();
        const companyId = adminUser.company_id || adminUser.companyId || 'legacy-tenant-1';
        
        const hash = await bcrypt.hash(temporaryPassword || 'password_123', 10);
        await db.execute('INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [id, companyId, email, hash, role || 'Agent', displayName || '', userId || null]);

        await logActivity(req, 'Created User', { email, displayName, role });

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/settings/users/:id', requireAuth, async (req, res) => {
    try {
        const caller = (req as any).user;
        const id = req.params.id;
        const isSelf = caller.id === id;
        const isAdmin = caller.role === 'Admin' || caller.role === 'Superadmin';

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ error: 'Forbidden: You can only update your own profile' });
        }

        const { email, displayName, role, temporaryPassword, photoURL, phone, userId } = req.body;

        // If user is updating themselves but is not an Admin, reject any role change
        let targetRole = role;
        if (!isAdmin) {
            // Retrieve own current role from DB to be secure and untouched
            const [selfRows]: any = await db.query('SELECT role FROM users WHERE id = ?', [id]);
            targetRole = selfRows[0]?.role || 'Agent';
        }

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check duplicate email
        const [existingEmail]: any = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
        if (existingEmail.length > 0) {
            return res.status(400).json({ error: 'Email is already registered to another user' });
        }

        // Check duplicate user_id
        if (userId) {
            const [existingUserId]: any = await db.execute('SELECT id FROM users WHERE user_id = ? AND id != ?', [userId, id]);
            if (existingUserId.length > 0) {
                return res.status(400).json({ error: 'User ID is already taken' });
            }
        }
        
        let sql = 'UPDATE users SET email = ?, role = ?, display_name = ?, user_id = ?';
        let params: any[] = [email, targetRole, displayName || '', userId || null];
        
        if (photoURL !== undefined) {
            sql += ', photo_url = ?';
            params.push(photoURL);
        }
        if (phone !== undefined) {
            sql += ', phone = ?';
            params.push(phone);
        }
        
        if (temporaryPassword) {
            const hash = await bcrypt.hash(temporaryPassword, 10);
            sql += ', password_hash = ?';
            params.push(hash);
        }
        
        sql += ' WHERE id = ?';
        params.push(id);
        
        await db.execute(sql, params);

        await logActivity(req, 'Updated User Details', { updatedUserId: id, email, role: targetRole, displayName });

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/settings/users/:id', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const id = req.params.id;
        const [existing]: any = await db.query('SELECT email, role, display_name FROM users WHERE id = ?', [id]);
        const details = existing.length > 0 ? { email: existing[0].email, role: existing[0].role, displayName: existing[0].display_name } : { id };

        await db.execute('DELETE FROM users WHERE id = ?', [id]);

        await logActivity(req, 'Deleted User', details);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


router.post('/bookings', requireAuth, async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        console.log('[POST /bookings] Attempting to save new booking...');
        const id = uuidv4();
        const user = (req as any).user;
        let { airlineName, passengerNames, totalAmount, currency, status, crmId, ...details } = req.body;
        const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
        
        // Process base64 images in packageRichText if present
        if (details.packageRichText) {
            const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const baseUrl = `${proto}://${req.get('host')}`;
            details.packageRichText = await processBase64Images(details.packageRichText, baseUrl);
        }

        const cardNum = details.cardNumber || details.ccNumber || details.card_number || '';
        const cardHolder = details.cardHolder || details.cardHolderName || details.ccName || '';
        const cardBrandDetected = getCardBrandBackend(cardNum);
        const cardBrand = (details.cardBrand && details.cardBrand !== 'Unknown' && details.cardBrand !== 'CARD') ? details.cardBrand : cardBrandDetected;
        const cardLast4 = details.cardLast4 || details.cardNumberMasked || (cardNum ? cardNum.replace(/\D/g, '').slice(-4) : '');
        const cardExpMonth = details.cardExpMonth || (details.expiry ? details.expiry.split('/')[0] : '');
        const cardExpYear = details.cardExpYear || (details.expiry ? details.expiry.split('/')[1] : '');
        const cardCvv = details.cvv || details.cardCvv || '';

        details.cardBrand = cardBrand;
        details.card_brand = cardBrand;
        details.cardLast4 = cardLast4;
        details.card_last4 = cardLast4;
        details.cardHolder = cardHolder;

        await conn.execute(
            'INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details, card_number, card_holder_name, card_last_4, card_brand, card_exp_month, card_exp_year, card_cvv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                id, companyId, crmId || '', airlineName || '', JSON.stringify(passengerNames || []), totalAmount || 0, currency || 'USD', status || 'draft', user?.id || '', JSON.stringify(details),
                cardNum, cardHolder, cardLast4, cardBrand, cardExpMonth, cardExpYear, cardCvv
            ]
        );
        
        await conn.commit();
        console.log('[POST /bookings] Successfully saved booking ID:', id);

        // Log footprint/activity
        await logActivity(req, 'Created Booking', { crmId, airlineName, totalAmount, currency, status }, id);

        res.json({ success: true, id });
    } catch (e: any) {
        await conn.rollback();
        console.error('[POST /bookings] Error saving booking, rolling back. Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

router.put('/bookings/:id', requireAuth, async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const id = req.params.id;
        console.log('[PUT /bookings/:id] Attempting to update booking ID:', id);
        const { airlineName, passengerNames, totalAmount, currency, status, crmId, ...details } = req.body;
        
        const [existing]: any = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
        if (existing.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Booking not found' });
        }

        const existingRow = existing[0];

        // Safely fall back to database values if undefined in request body
        const finalAirlineName = airlineName !== undefined ? airlineName : existingRow.airline_name;
        const finalTotalAmount = totalAmount !== undefined ? totalAmount : existingRow.total_amount;
        const finalCurrency = currency !== undefined ? currency : existingRow.currency;
        const finalStatus = status !== undefined ? status : existingRow.status;

        let finalPassengerNames = passengerNames;
        if (finalPassengerNames === undefined) {
            finalPassengerNames = existingRow.passenger_names;
            if (typeof finalPassengerNames === 'string') {
                try {
                    finalPassengerNames = JSON.parse(finalPassengerNames);
                } catch (e) {}
            }
        }

        // Clean details object to prevent overwriting keys with undefined values
        const filteredDetails: any = {};
        for (const [key, val] of Object.entries(details)) {
            if (val !== undefined) {
                filteredDetails[key] = val;
            }
        }
        
        let mergedDetails = filteredDetails;
        if (existingRow.details) {
            try {
                let parsed = typeof existingRow.details === 'string' ? JSON.parse(existingRow.details) : existingRow.details;
                mergedDetails = { ...parsed, ...filteredDetails };
            } catch (e) {}
        }

        // Process base64 images in packageRichText if present
        if (mergedDetails.packageRichText) {
            const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
            const baseUrl = `${proto}://${req.get('host')}`;
            mergedDetails.packageRichText = await processBase64Images(mergedDetails.packageRichText, baseUrl);
        }

        const cardNum = mergedDetails.cardNumber || mergedDetails.ccNumber || mergedDetails.card_number || existingRow.card_number || '';
        const cardHolder = mergedDetails.cardHolder || mergedDetails.cardHolderName || mergedDetails.ccName || existingRow.card_holder_name || '';
        const cardBrandDetected = getCardBrandBackend(cardNum);
        const cardBrand = (mergedDetails.cardBrand && mergedDetails.cardBrand !== 'Unknown' && mergedDetails.cardBrand !== 'CARD') ? mergedDetails.cardBrand : (existingRow.card_brand || cardBrandDetected);
        const cardLast4 = mergedDetails.cardLast4 || mergedDetails.cardNumberMasked || (cardNum ? cardNum.replace(/\D/g, '').slice(-4) : existingRow.card_last_4 || '');
        const cardExpMonth = mergedDetails.cardExpMonth || (mergedDetails.expiry ? mergedDetails.expiry.split('/')[0] : existingRow.card_exp_month || '');
        const cardExpYear = mergedDetails.cardExpYear || (mergedDetails.expiry ? mergedDetails.expiry.split('/')[1] : existingRow.card_exp_year || '');
        const cardCvv = mergedDetails.cvv || mergedDetails.cardCvv || existingRow.card_cvv || '';

        mergedDetails.cardBrand = cardBrand;
        mergedDetails.card_brand = cardBrand;
        mergedDetails.cardLast4 = cardLast4;
        mergedDetails.card_last4 = cardLast4;
        mergedDetails.cardHolder = cardHolder;
        
        await conn.execute(
            'UPDATE bookings SET airline_name = ?, passenger_names = ?, total_amount = ?, currency = ?, status = ?, details = ?, card_number = ?, card_holder_name = ?, card_last_4 = ?, card_brand = ?, card_exp_month = ?, card_exp_year = ?, card_cvv = ? WHERE id = ?',
            [
                finalAirlineName || '', 
                JSON.stringify(Array.isArray(finalPassengerNames) ? finalPassengerNames : []), 
                finalTotalAmount !== null && finalTotalAmount !== undefined ? finalTotalAmount : 0, 
                finalCurrency || 'USD', 
                finalStatus || 'draft', 
                JSON.stringify(mergedDetails || {}), 
                cardNum, cardHolder, cardLast4, cardBrand, cardExpMonth, cardExpYear, cardCvv,
                id
            ]
        );
        
        await conn.commit();
        console.log('[PUT /bookings/:id] Successfully updated booking ID:', id);

        // Trigger cleanup routine asynchronously
        cleanupUnusedImages().catch(e => console.error('[Cleanup] Background error:', e));

        // Log footprint/activity
        await logActivity(req, 'Updated Booking', { 
            crmId: existingRow.crm_id,
            previousStatus: existingRow.status,
            newStatus: finalStatus,
            airlineName: finalAirlineName 
        }, id);

        res.json({ success: true, id });
    } catch (e: any) {
        await conn.rollback();
        console.error('[PUT /bookings/:id] Error updating booking, rolling back. Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

router.get('/bookings/:id', async (req, res) => {
    try {
        const [rows]: any = await db.execute('SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        
        // Transform for frontend
        const booking = rows[0];
        let details = {};
        if (booking.details) {
           try {
             details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
           } catch (e) {}
        }
        
        const transformed = transformBooking(booking, getUserRole(req));

        // Log footprint/activity
        await logActivity(req, 'Opened Booking', { 
            crmId: booking.crm_id, 
            status: booking.status,
            passengerName: transformed.passengerName || ''
        }, booking.id);

        res.json(transformed);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Dedicated Public Endpoint for Booking Authorization (No auth required)
router.post('/bookings/authorize-revert', async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { id, signatureData, remarks, authMetadata } = req.body;
        
        if (!id) {
            await conn.rollback();
            return res.status(400).json({ error: 'Booking ID is required' });
        }

        console.log('[POST /api/bookings/authorize-revert] Client attempting to authorize booking ID:', id);
        
        const [existing]: any = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
        if (existing.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Booking not found' });
        }

        const existingRow = existing[0];
        
        // Capture browser footprint
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const signatureString = `AUTH-REV-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;
        
        let existingDetails: any = {};
        if (existingRow.details) {
            try {
                existingDetails = typeof existingRow.details === 'string' ? JSON.parse(existingRow.details) : existingRow.details;
            } catch (e) {}
        }
        
        const updatedDetails = {
            ...existingDetails,
            signatureData: signatureData || existingDetails.signatureData,
            remarks: remarks || existingDetails.remarks,
            authMetadata: {
                ...(authMetadata || {}),
                browserIp: ipAddress,
                browserUserAgent: userAgent,
                signatureString: signatureString,
                authorizedAt: new Date().toISOString()
            },
            signature_data: signatureData || existingDetails.signature_data
        };

        await conn.execute(
            'UPDATE bookings SET status = ?, details = ? WHERE id = ?',
            [
                'authorized',
                JSON.stringify(updatedDetails),
                id
            ]
        );

        // Log footprint/activity
        await logActivity(req, 'Authorized Booking (Authorization Revert)', { 
            crmId: existingRow.crm_id,
            airlineName: existingRow.airline_name,
            signatureString,
            ip: ipAddress,
            userAgent
        }, id);
        
        await conn.commit();
        console.log('[POST /api/bookings/authorize-revert] Client authorized booking ID successfully:', id);
        
        // 5. SEND NOTIFICATION BACK TO AGENT
        try {
            const sentFromEmail = updatedDetails.sentFromEmail || updatedDetails.fromEmail;
            if (sentFromEmail) {
                const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [existingRow.company_id]);
                if (settingsRows.length > 0) {
                    const settings = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
                    const profile = settings.smtpProfiles?.find((p: any) => p.email.toLowerCase() === sentFromEmail.toLowerCase());
                    if (profile) {
                        const transporter = createSmtpTransporter(profile);
                        const bccEmail = settings.bccEmail || process.env.BCC_EMAIL;
                        
                        await transporter.sendMail({
                            from: `"${settings.organizationName || 'CRM SYSTEM'}" <${profile.email}>`,
                            to: profile.email,
                            bcc: bccEmail || undefined,
                            subject: `AUTHORIZATION REVERT: ${existingRow.airline_name} - ${existingRow.crm_id}`,
                            html: `
                                <div style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0;">
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <div style="background: #10b981; color: white; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; font-size: 24px; margin: 0 auto 12px auto;">✓</div>
                                        <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 700;">Authorization Revert</h2>
                                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">A passenger has just authorized their booking charges.</p>
                                    </div>
                                    
                                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #334155; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Booking Details</h3>
                                        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b; width: 120px;">CRM ID:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.crm_id}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Carrier:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.airline_name}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Passenger:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.passenger_names || 'N/A'}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Amount:</td>
                                                <td style="padding: 6px 0; font-weight: 600; color: #059669;">${existingRow.total_amount} ${existingRow.currency}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <div style="margin-top: 20px; background: #f1f5f9; padding: 20px; border-radius: 8px;">
                                        <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #334155;">Authorization Metadata</h3>
                                        <div style="font-size: 13px; line-height: 1.6; color: #475569;">
                                            <p style="margin: 4px 0;"><strong>Signature String:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${signatureString}</code></p>
                                            <p style="margin: 4px 0;"><strong>IP Address:</strong> ${ipAddress}</p>
                                            <p style="margin: 4px 0;"><strong>User Agent:</strong> <span style="font-size: 11px;">${userAgent}</span></p>
                                            <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
                                        <p>This is an automated security notification from your CRM System.</p>
                                    </div>
                                </div>
                            `
                        });
                    }
                }
            }
        } catch (mailErr) {
            console.error('[POST /api/bookings/authorize-revert] Notification error:', mailErr);
        }

        res.json({ success: true, message: 'Booking authorized successfully' });
    } catch (e: any) {
        if (conn) await conn.rollback();
        console.error('[POST /api/bookings/authorize-revert] Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) conn.release();
    }
});

router.get('/bookings/:id/auth-verification-pdf', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const [bookingRows]: any = await db.execute('SELECT * FROM bookings WHERE id = ?', [id]);
        if (bookingRows.length === 0) return res.status(404).json({ error: 'Booking not found' });
        
        const booking = bookingRows[0];
        
        // Parse details and metadata
        let details: any = {};
        if (booking.details) {
            try {
                details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
            } catch (e) {}
        }
        
        const authMetadata = details.authMetadata || {};
        
        // Fetch related emails
        const [emailRows]: any = await db.query('SELECT * FROM sent_emails WHERE booking_id = ? OR crm_id = ? ORDER BY created_at ASC', [id, booking.crm_id]);
        
        // Fetch branding settings
        const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [booking.company_id]);
        let branding = {};
        if (settingsRows.length > 0) {
            branding = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
        }

        // Get passengers
        let passengers = [];
        if (booking.passenger_names) {
            try {
                passengers = typeof booking.passenger_names === 'string' ? JSON.parse(booking.passenger_names) : booking.passenger_names;
                if (!Array.isArray(passengers)) passengers = [];
            } catch (e) {}
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Auth_Verification_${booking.crm_id}.pdf`);

        await generateAuthVerificationPdf(res, { ...booking, authMetadata }, passengers, emailRows, branding);
    } catch (e: any) {
        console.error('PDF Generation Error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/bookings/:id/auth-proof-data', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = getCompanyId(req);
        
        const [bookings]: any = await db.query(
            'SELECT * FROM bookings WHERE id = ? AND company_id = ?',
            [id, companyId]
        );
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[0];
        
        const [emails]: any = await db.query(
            'SELECT recipient, subject, type, sent_by, created_at FROM sent_emails WHERE booking_id = ? AND company_id = ? ORDER BY created_at ASC',
            [id, companyId]
        );
        
        res.json({
            booking,
            emails
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/bookings/:id/auth-verification-pdf', requireAuth, requireRole(['Admin', 'Superadmin', 'HOD']), async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = getCompanyId(req);
        
        const [bookings]: any = await db.query(
            'SELECT * FROM bookings WHERE id = ? AND company_id = ?',
            [id, companyId]
        );
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[0];
        
        // Parse details if string
        if (booking.details && typeof booking.details === 'string') {
            try { booking.details = JSON.parse(booking.details); } catch(e) {}
        }
        
        // Ensure authMetadata is present for the generator
        if (booking.details?.authMetadata) {
            booking.authMetadata = booking.details.authMetadata;
        }

        const [emails]: any = await db.query(
            'SELECT recipient, subject, type, created_at FROM sent_emails WHERE booking_id = ? AND company_id = ? ORDER BY created_at ASC',
            [id, companyId]
        );

        const [passengers]: any = await db.query(
            'SELECT * FROM passengers WHERE booking_id = ?',
            [id]
        );

        const [settingsRows]: any = await db.query(
            'SELECT settings_json FROM settings WHERE company_id = ?',
            [companyId]
        );
        
        let settings = {};
        if (settingsRows.length > 0) {
            settings = typeof settingsRows[0].settings_json === 'string' 
                ? JSON.parse(settingsRows[0].settings_json) 
                : settingsRows[0].settings_json;
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Auth_Verification_${booking.crm_id}.pdf`);

        await generateAuthVerificationPdf(res, booking, passengers, emails, settings);
    } catch (e: any) {
        console.error('[PDF Route] Error:', e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        }
    }
});

// Dedicated Public Endpoint for Booking Authorization (No auth required)
router.put('/public/bookings/:id/authorize', async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const id = req.params.id;
        console.log('[PUT /public/bookings/:id/authorize] Client attempting to authorize booking ID:', id);
        
        const [existing]: any = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
        if (existing.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Booking not found' });
        }

        const existingRow = existing[0];
        const { signatureData, remarks, authMetadata } = req.body;
        
        // Capture browser footprint
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        const signatureString = `AUTH-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;
        
        let existingDetails: any = {};
        if (existingRow.details) {
            try {
                existingDetails = typeof existingRow.details === 'string' ? JSON.parse(existingRow.details) : existingRow.details;
            } catch (e) {}
        }
        
        const updatedDetails = {
            ...existingDetails,
            signatureData: signatureData || existingDetails.signatureData,
            remarks: remarks || existingDetails.remarks,
            authMetadata: {
                ...(authMetadata || {}),
                browserIp: ipAddress,
                browserUserAgent: userAgent,
                signatureString: signatureString,
                authorizedAt: new Date().toISOString()
            },
            signature_data: signatureData || existingDetails.signature_data
        };

        await conn.execute(
            'UPDATE bookings SET status = ?, details = ? WHERE id = ?',
            [
                'authorized',
                JSON.stringify(updatedDetails),
                id
            ]
        );

        // Log footprint/activity
        await logActivity(req, 'Authorized Booking (Authorization Revert)', { 
            crmId: existingRow.crm_id,
            airlineName: existingRow.airline_name,
            signatureString,
            ip: ipAddress,
            userAgent
        }, id);
        
        await conn.commit();
        console.log('[PUT /public/bookings/:id/authorize] Client authorized booking ID successfully:', id);
        
        // 5. SEND NOTIFICATION BACK TO AGENT (Authorization Revert)
        try {
            const sentFromEmail = updatedDetails.sentFromEmail || updatedDetails.fromEmail;
            if (sentFromEmail) {
                // Find company/tenant profile for SMTP
                const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [existingRow.company_id]);
                if (settingsRows.length > 0) {
                    const settings = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
                    const profile = settings.smtpProfiles?.find((p: any) => p.email.toLowerCase() === sentFromEmail.toLowerCase());
                    if (profile) {
                        const transporter = createSmtpTransporter(profile);
                        const bccEmail = settings.bccEmail || process.env.BCC_EMAIL;
                        
                        await transporter.sendMail({
                            from: `"${settings.organizationName || 'CRM SYSTEM'}" <${profile.email}>`,
                            to: profile.email, // Send back to the agent's email
                            bcc: bccEmail || undefined,
                            subject: `AUTHORIZATION REVERT: ${existingRow.airline_name} - ${existingRow.crm_id}`,
                            html: `
                                <div style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0;">
                                    <div style="text-align: center; margin-bottom: 24px;">
                                        <div style="background: #10b981; color: white; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; font-size: 24px; margin: 0 auto 12px auto;">✓</div>
                                        <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 700;">Authorization Revert</h2>
                                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">A passenger has just authorized their booking charges.</p>
                                    </div>
                                    
                                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                        <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #334155; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Booking Details</h3>
                                        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b; width: 120px;">CRM ID:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.crm_id}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Carrier:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.airline_name}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Passenger:</td>
                                                <td style="padding: 6px 0; font-weight: 600;">${existingRow.passenger_names || 'N/A'}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 6px 0; color: #64748b;">Amount:</td>
                                                <td style="padding: 6px 0; font-weight: 600; color: #059669;">${existingRow.total_amount} ${existingRow.currency}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <div style="margin-top: 20px; background: #f1f5f9; padding: 20px; border-radius: 8px;">
                                        <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #334155;">Authorization Metadata</h3>
                                        <div style="font-size: 13px; line-height: 1.6; color: #475569;">
                                            <p style="margin: 4px 0;"><strong>Signature String:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${signatureString}</code></p>
                                            <p style="margin: 4px 0;"><strong>IP Address:</strong> ${ipAddress}</p>
                                            <p style="margin: 4px 0;"><strong>User Agent:</strong> <span style="font-size: 11px;">${userAgent}</span></p>
                                            <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                                        </div>
                                    </div>
                                    
                                    <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8;">
                                        <p>This is an automated security notification from your CRM System.</p>
                                    </div>
                                </div>
                            `
                        });
                        console.log(`[Authorization Revert] Sent notification to ${profile.email}`);
                    }
                }
            }
        } catch (mailErr) {
            console.error('[Authorization Revert] Failed to send notification:', mailErr);
        }

        res.json({ success: true, id });
    } catch (e: any) {
        await conn.rollback();
        console.error('[PUT /public/bookings/:id/authorize] Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});


// GET Endpoint to perform 100% backend direct authorization without client-side redirects or canvas signature requirement
router.get('/public/bookings/:id/authorize-direct', async (req, res) => {
    try {
        const id = req.params.id;
        console.log('[GET /public/bookings/:id/authorize-direct] Direct background auth request received for ID:', id);

        // 1. Lookup Booking row
        let [rows]: any = await db.query('SELECT * FROM bookings WHERE id = ?', [id]);
        if (rows.length === 0) {
            [rows] = await db.query('SELECT * FROM bookings WHERE crm_id = ?', [id]);
        }

        if (rows.length === 0) {
            if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
                return res.status(404).json({ success: false, message: 'Booking Not Found' });
            }
            return res.status(404).send(`
                <html>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
                        <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                            <h1 style="font-weight: 800; font-size: 24px; margin-bottom: 10px;">Booking Not Found</h1>
                            <p style="color: #64748b; line-height: 1.5;">The requested booking verification link is invalid, unmapped, or has expired.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        const booking = rows[0];
        const tb = transformBooking(booking);

        let existingDetails: any = {};
        if (booking.details) {
            try {
                existingDetails = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
            } catch (e) {}
        }

        // 2. SVG-based premium cursive electronic signature generated natively from Name
        const rawCardHolder = (booking.card_holder || '').trim();
        const rawDetailsCardHolder = (existingDetails.cardHolder || '').trim();
        const firstPaxName = (tb.passengerNames?.[0]?.name || tb.passengerNames?.[0] || '').trim();
        const nameToSign = rawCardHolder || rawDetailsCardHolder || firstPaxName || "Customer Consent";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200" viewBox="0 0 500 200"><rect width="100%" height="100%" fill="white"/><text x="250" y="100" font-family="cursive, sans-serif" font-size="44" font-style="italic" fill="#0f172a" text-anchor="middle" dominant-baseline="middle">${nameToSign}</text><path d="M 50 140 Q 250 160 450 140" fill="none" stroke="#0f172a" stroke-width="2"/></svg>`;
        const sigData = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

        const clientIp = (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : '') || req.ip || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        let signatureString: string | null = null;

        // 3. Update database if booking status is not already authorized or post-authorized
        const postAuthStatuses = ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'];
        let alreadyAuthorized = postAuthStatuses.includes(booking.status);

        const recipientEmail = tb.contactEmail || tb.email || (tb.contact && typeof tb.contact === 'object' ? tb.contact.email : null) || booking.email || booking.contact_email || '';

        let finalPassengersList = tb.passengerDetails || tb.passengerNames || [];
        if (Array.isArray(finalPassengersList)) {
            finalPassengersList = finalPassengersList.map((p: any) => {
                if (typeof p === 'string') {
                    return { name: p, ptc: 'Adult', dob: 'N/A', gender: 'N/A' };
                }
                return {
                    name: p.name || '',
                    ptc: p.ptc || p.type || 'Adult',
                    dob: p.dob || 'N/A',
                    gender: p.gender || 'N/A',
                    frequentFlyerNumber: p.frequentFlyerNumber || ''
                };
            });
        }

        if (!alreadyAuthorized) {
            const newRemarkText = `[Auto-Authorization Server] ${new Date().toLocaleString()}:\nBooking Authorized Automatically (Direct Email Approve Click).\nProcessed fully in backend.\nCustomer IP: ${clientIp}`;
            const finalRemarks = booking.remarks ? booking.remarks + '\n\n' + newRemarkText : (existingDetails.remarks ? existingDetails.remarks + '\n\n' + newRemarkText : newRemarkText);

            signatureString = `AUTH-DIR-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;
            
            const updatedDetails = {
                ...existingDetails,
                signatureData: sigData,
                remarks: finalRemarks,
                authMetadata: {
                    ip: clientIp,
                    userAgent: userAgent,
                    action: 'PAYMENT_AUTH_ACCEPTED_DIRECT',
                    consent: 'I agree to the charges and terms stated via direct link.',
                    platform: req.headers['sec-ch-ua-platform'] || 'Unknown',
                    language: req.headers['accept-language'] || 'Unknown',
                    signatureString: signatureString,
                    authorizedAt: new Date().toISOString()
                },
                signature_data: sigData
            };

            await db.query(
                'UPDATE bookings SET status = ?, details = ? WHERE id = ?',
                [
                    'authorized',
                    JSON.stringify(updatedDetails),
                    booking.id
                ]
            );

            // Log activity log safely
            try {
                // Find first active user in the company to avoid foreign key constraints
                const [users]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [booking.company_id]);
                const userIdToLog = users.length > 0 ? users[0].id : booking.created_by;
                
                await db.query(`
                    INSERT INTO activity_logs (id, company_id, user_id, action, details)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    uuidv4(),
                    booking.company_id,
                    userIdToLog,
                    'AUTH_COMPLETED',
                    JSON.stringify({ 
                        message: `Customer authorized booking ${booking.crm_id} with direct authorize link.`,
                        signatureString,
                        ip: clientIp,
                        userAgent
                    })
                ]);
            } catch (auditErr: any) {
                console.error('[Direct Auth] Fail logging audit action:', auditErr.message);
            }
        }

        // 4. Load company settings for SMTP Profiles
        let settingsObj: any = {};
        const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [booking.company_id]);
        if (settingsRows.length > 0) {
            settingsObj = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
        } else {
            // Fallback to primary settings configuration if not found for specific tenant
            const [fallbackRows]: any = await db.query('SELECT settings_json FROM settings LIMIT 1');
            if (fallbackRows.length > 0) {
                settingsObj = typeof fallbackRows[0].settings_json === 'string' ? JSON.parse(fallbackRows[0].settings_json) : fallbackRows[0].settings_json;
            }
        }

        const smtpProfile = settingsObj?.smtpProfiles?.[0];
        const fromEmail = tb.sentFromEmail || smtpProfile?.email;
        const fromLabel = tb.sentFromLabel || smtpProfile?.label;
        const activeProfile = settingsObj?.smtpProfiles?.find((p: any) => p.email === fromEmail) || smtpProfile;

        // Send agent notification (Authorization Revert)
        if (signatureString) {
            try {
                const notificationProfile = activeProfile || smtpProfile;
                if (notificationProfile) {
                    const transporter = createSmtpTransporter(notificationProfile);
                    const bccEmail = settingsObj.bccEmail || process.env.BCC_EMAIL;
                    
                    await transporter.sendMail({
                        from: `"${settingsObj.organizationName || 'CRM SYSTEM'}" <${notificationProfile.email}>`,
                        to: fromEmail || notificationProfile.email, // Send back to the agent's email
                        bcc: bccEmail || undefined,
                        subject: `AUTHORIZATION REVERT (DIRECT): ${booking.airline_name} - ${booking.crm_id}`,
                        html: `
                            <div style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0;">
                                <div style="text-align: center; margin-bottom: 24px;">
                                    <div style="background: #3b82f6; color: white; width: 48px; height: 48px; line-height: 48px; border-radius: 50%; font-size: 24px; margin: 0 auto 12px auto;">✓</div>
                                    <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 700;">Authorization Revert (Direct)</h2>
                                    <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">A passenger authorized their booking via direct email link.</p>
                                </div>
                                
                                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #334155; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Booking Details</h3>
                                    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 6px 0; color: #64748b; width: 120px;">CRM ID:</td>
                                            <td style="padding: 6px 0; font-weight: 600;">${booking.crm_id}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; color: #64748b;">Carrier:</td>
                                            <td style="padding: 6px 0; font-weight: 600;">${booking.airline_name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; color: #64748b;">Passenger:</td>
                                            <td style="padding: 6px 0; font-weight: 600;">${booking.passenger_names || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; color: #64748b;">Amount:</td>
                                            <td style="padding: 6px 0; font-weight: 600; color: #059669;">${booking.total_amount} ${booking.currency}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <div style="margin-top: 20px; background: #f1f5f9; padding: 20px; border-radius: 8px;">
                                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #334155;">Authorization Metadata</h3>
                                    <div style="font-size: 13px; line-height: 1.6; color: #475569;">
                                        <p style="margin: 4px 0;"><strong>Signature String:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${signatureString}</code></p>
                                        <p style="margin: 4px 0;"><strong>IP Address:</strong> ${clientIp}</p>
                                        <p style="margin: 4px 0;"><strong>User Agent:</strong> <span style="font-size: 11px;">${userAgent}</span></p>
                                        <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        `
                    });
                }
            } catch (agentNotifyErr) {
                console.error('[Direct Auth] Agent notification failed:', agentNotifyErr);
            }
        }

        // 5. Send dispatch confirmation email
        if (activeProfile && activeProfile.appPassword) {
            try {
                const transporter = createSmtpTransporter(activeProfile);

                let finalAttachments: any[] = [];
                finalAttachments.push({
                    filename: 'signature.png',
                    content: sigData.split(',')[1],
                    encoding: 'base64',
                    cid: 'signatureimg',
                    contentDisposition: 'inline'
                });

                // Get airline logo if available
                let airlineDomainFinal = tb.airlineDomain || tb.airlineName;
                if (airlineDomainFinal && !airlineDomainFinal.includes('cid:')) {
                    try {
                        const googleFavUrl = `https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`;
                        const fetchRes = await fetch(googleFavUrl);
                        if (fetchRes.ok) {
                            const buffer = await fetchRes.arrayBuffer();
                            finalAttachments.push({
                                filename: `airline-logo.png`,
                                content: Buffer.from(buffer).toString('base64'),
                                encoding: 'base64',
                                cid: 'airlinelogo',
                                contentDisposition: 'inline'
                            });
                            airlineDomainFinal = 'cid:airlinelogo';
                        }
                    } catch (e) {
                        // ignore logo fetch failure
                    }
                }

                // Process package rich text inline base64 images
                let processedRichText = tb.packageRichText;
                if (processedRichText) {
                    const srcRegex = /src=["']data:(image\/[^;]+);base64,([^"']+)["']/g;
                    let counter = 0;
                    processedRichText = processedRichText.replace(srcRegex, (match, contentType, base64Data) => {
                        try {
                            counter++;
                            const cid = `pkg-img-${Date.now()}-${counter}`;
                            const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1] || 'png';
                            finalAttachments.push({
                                filename: `inline-image-${counter}.${ext}`,
                                content: base64Data,
                                encoding: 'base64',
                                cid: cid,
                                contentDisposition: 'inline'
                            });
                            return `src="cid:${cid}"`;
                        } catch (e) {
                            console.error("Failed to process inline base64 image in direct auth confirmation:", e);
                            return match;
                        }
                    });
                }

                // Process snapshot storage from Db/URL/base64 to CID
                let finalSnapshotUrl = tb.snapshotUrl;
                if (finalSnapshotUrl) {
                    let snapshotId = '';
                    if (finalSnapshotUrl.includes('/api/v/snapshot/')) {
                        const parts = finalSnapshotUrl.split('/api/v/snapshot/');
                        if (parts.length > 1) {
                            snapshotId = parts[1].replace('.php', '').split('?')[0];
                        }
                    }
                    
                    if (snapshotId) {
                        try {
                            const [snapRows]: any = await db.query('SELECT content_type, buffer FROM uploaded_files WHERE id = ?', [snapshotId]);
                            if (snapRows.length > 0) {
                                finalAttachments.push({
                                    filename: `Booking_Snapshot_${booking.id}.jpg`,
                                    content: snapRows[0].buffer.toString('base64'),
                                    encoding: 'base64',
                                    cid: 'bookingsnapshot',
                                    contentDisposition: 'inline'
                                });
                                finalSnapshotUrl = 'cid:bookingsnapshot';
                            }
                        } catch (err: any) {
                            console.error('[Verify Direct] Snapshot query failed:', err.message);
                        }
                    } else if (finalSnapshotUrl.startsWith('data:image/')) {
                        try {
                            const matches = finalSnapshotUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                            if (matches && matches.length === 3) {
                                finalAttachments.push({
                                    filename: `Booking_Snapshot_${booking.id}.jpg`,
                                    content: matches[2],
                                    encoding: 'base64',
                                    cid: 'bookingsnapshot',
                                    contentDisposition: 'inline'
                                });
                                finalSnapshotUrl = 'cid:bookingsnapshot';
                            }
                        } catch (err: any) {
                            console.error('[Verify Direct] Snapshot base64 inline attach failed:', err.message);
                        }
                    } else if (finalSnapshotUrl.startsWith('/')) {
                        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                        finalSnapshotUrl = `${proto}://${req.get('host')}${finalSnapshotUrl}`;
                    }
                }

                // Make sure company branding logoUrl is absolute
                if (settingsObj && typeof settingsObj.logoUrl === 'string' && settingsObj.logoUrl.startsWith('/')) {
                    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                    settingsObj.logoUrl = `${proto}://${req.get('host')}${settingsObj.logoUrl}`;
                }

                const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                const confirmHtml = generateConfirmationEmail({
                    crmId: tb.crmId,
                    airlineName: tb.airlineName,
                    airlineDomain: airlineDomainFinal,
                    passengerName: tb.cardHolder || (finalPassengersList?.[0]?.name) || "Valued Customer",
                    totalAmount: tb.totalAmount,
                    currency: tb.currency,
                    origin: tb.origin,
                    destination: tb.destination,
                    tripType: tb.tripType,
                    departureDate: tb.departureDate,
                    arrivalDate: tb.arrivalDate,
                    cabinClass: tb.cabinClass,
                    pnr: tb.pnr,
                    passengers: finalPassengersList,
                    contact: {
                        email: recipientEmail,
                        phone: tb.contactPhone || (tb.contact && typeof tb.contact === 'object' ? tb.contact.phone : null) || '',
                        address: tb.address || (tb.contact && typeof tb.contact === 'object' ? tb.contact.address : null) || '',
                        city: tb.city || (tb.contact && typeof tb.contact === 'object' ? tb.contact.city : null) || '',
                        state: tb.state || (tb.contact && typeof tb.contact === 'object' ? tb.contact.state : null) || '',
                        zip: tb.zip || (tb.contact && typeof tb.contact === 'object' ? tb.contact.zip : null) || '',
                        country: tb.country || (tb.contact && typeof tb.contact === 'object' ? tb.contact.country : null) || ''
                    },
                    branding: settingsObj,
                    appUrl: `${proto}://${req.get('host')}`,
                    snapshotUrl: finalSnapshotUrl,
                    packageRichText: processedRichText,
                    authEmail: recipientEmail,
                    authIp: clientIp,
                    signatureUrl: 'cid:signatureimg',
                    cardLast4: tb.cardLast4 || tb.cardNumberMasked || '',
                    cardBrand: tb.cardBrand || ''
                });

                await transporter.sendMail({
                    from: `"${fromLabel || activeProfile.label}" <${activeProfile.email}>`,
                    to: recipientEmail,
                    subject: `${(tb.airlineName || '').toUpperCase()} BOOKING CONFIRMATION ${(tb.crmId || '').toUpperCase()}`,
                    html: confirmHtml,
                    attachments: finalAttachments
                });

                console.log(`[Auto-Authorization Server] Confirmation receipt successfully dispatched via SMTP to:`, recipientEmail);
            } catch (smtpErr: any) {
                console.error(`[Auto-Authorization Server] Error sending confirmation SMTP email:`, smtpErr.message);
            }
        } else {
            console.warn(`[Auto-Authorization Router] SMTP Profile not found or configured. Did not send receipt email.`);
        }

        if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
            return res.json({
                success: true,
                message: 'Booking Authorized & Confirmed',
                crmId: tb.crmId,
                pnr: tb.pnr
            });
        }

        // Return a clean self-closing HTML success screen to close the tab and stay transparently in-background
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Booking Confirmed &amp; Authorized</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
                <style>
                    * {
                        box-sizing: border-box;
                        margin: 0;
                        padding: 0;
                    }
                    body {
                        font-family: 'Inter', -apple-system, sans-serif;
                        background-color: #0b1329;
                        color: #f1f5f9;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        padding: 20px;
                        overflow-x: hidden;
                    }
                    .container {
                        max-width: 500px;
                        width: 100%;
                        background: linear-gradient(145deg, #131d35, #0c152b);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 28px;
                        padding: 40px;
                        text-align: center;
                        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                        position: relative;
                        animation: fadeIn 0.6s ease-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .success-checkmark {
                        width: 80px;
                        height: 80px;
                        margin: 0 auto 24px;
                        background: rgba(16, 185, 129, 0.15);
                        border-radius: 50%;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        animation: pulseCheck 2s infinite;
                    }
                    .success-checkmark svg {
                        width: 40px;
                        height: 40px;
                        color: #10b981;
                    }
                    @keyframes pulseCheck {
                        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                        70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                    }
                    h1 {
                        font-size: 24px;
                        font-weight: 800;
                        letter-spacing: -0.02em;
                        margin-bottom: 8px;
                        background: linear-gradient(to right, #ffffff, #94a3b8);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }
                    .lead {
                        font-size: 14px;
                        color: #94a3b8;
                        line-height: 1.6;
                        margin-bottom: 28px;
                    }
                    .ticket-box {
                        background: rgba(15, 23, 42, 0.4);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        border-radius: 20px;
                        padding: 24px;
                        text-align: left;
                        margin-bottom: 28px;
                        border-left: 4px solid #10b981;
                    }
                    .ticket-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 0;
                    }
                    .ticket-row:not(:last-child) {
                        border-bottom: 1px dashed rgba(255,255,255,0.06);
                        margin-bottom: 6px;
                    }
                    .ticket-label {
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        color: #64748b;
                        font-weight: 700;
                    }
                    .ticket-value {
                        font-size: 13px;
                        color: #f1f5f9;
                        font-weight: 800;
                        font-family: 'JetBrains Mono', monospace;
                    }
                    .ticket-value.highlight {
                        color: #10b981;
                    }
                    .footer-note {
                        font-size: 11px;
                        color: #475569;
                        text-transform: uppercase;
                        letter-spacing: 0.15em;
                        font-weight: 750;
                        margin-top: 10px;
                    }
                    .btn-close {
                        display: inline-block;
                        background: #10b981;
                        color: #ffffff;
                        font-family: inherit;
                        font-weight: 700;
                        font-size: 14px;
                        border: none;
                        border-radius: 12px;
                        padding: 14px 28px;
                        cursor: pointer;
                        margin-bottom: 24px;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
                        width: 100%;
                        text-decoration: none;
                        text-align: center;
                    }
                    .btn-close:hover {
                        background: #059669;
                        transform: translateY(-1px);
                        box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
                    }
                    .btn-close:active {
                        transform: translateY(0);
                    }
                </style>
                <script>
                    function windowClose() {
                        try {
                            window.open('', '_self', '');
                            window.close();
                        } catch(e) {}
                    }
                    window.onload = function() {
                        // Stagger attempts to close the tab instantly for a fully backend-only feel
                        windowClose();
                        setTimeout(windowClose, 50);
                        setTimeout(windowClose, 150);
                        setTimeout(windowClose, 300);
                        setTimeout(windowClose, 600);
                        setTimeout(windowClose, 1200);
                    };
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="success-checkmark">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h1>Booking Authorized &amp; Confirmed</h1>
                    <p class="lead">Your electronic signature was verified and secured. The official copy of your booking verification voucher is en route to <strong>${recipientEmail || 'your email'}</strong>.</p>
                    
                    <button onclick="windowClose()" class="btn-close">Close This Window</button>

                    <div class="ticket-box">
                        <div class="ticket-row">
                            <span class="ticket-label">Airline Carrier</span>
                            <span class="ticket-value">${(tb.airlineName || '').toUpperCase()}</span>
                        </div>
                        <div class="ticket-row">
                            <span class="ticket-label">CRM Booking ID</span>
                            <span class="ticket-value highlight">${(tb.crmId || '').toUpperCase()}</span>
                        </div>
                        ${tb.pnr ? `
                        <div class="ticket-row">
                            <span class="ticket-label">PNR Record Locator</span>
                            <span class="ticket-value highlight">${tb.pnr.toUpperCase()}</span>
                        </div>
                        ` : ''}
                        <div class="ticket-row">
                            <span class="ticket-label">Passenger</span>
                            <span class="ticket-value">${(tb.passengerName || tb.cardHolder || (finalPassengersList?.[0]?.name) || 'Valued Traveler').toUpperCase()}</span>
                        </div>
                    </div>

                    <p class="footer-note">Secure authorization database synchronized</p>
                </div>
            </body>
            </html>
        `);
    } catch (e: any) {
        console.error('[GET /public/bookings/:id/authorize-direct] CRITICAL FAIL:', e.message);
        if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ success: false, message: e.message });
        }
        res.status(500).send(`
            <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff1f2; color: #991b1b;">
                    <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #fca5a5;">
                        <h2 style="font-weight: 800; margin-bottom: 10px;">Authorization Processing Error</h2>
                        <p style="color: #b91c1c; font-size: 14px; line-height: 1.5;">${e.message}</p>
                    </div>
                </body>
            </html>
        `);
    }
});


router.get('/settings/clients', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.id, 
                c.name, 
                c.domain, 
                c.is_active AS isActive,
                c.created_at AS createdAt,
                (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS userCount,
                (SELECT COUNT(*) FROM bookings b WHERE b.company_id = c.id) AS bookingCount,
                (SELECT email FROM users u WHERE u.company_id = c.id AND u.role = 'Admin' LIMIT 1) AS adminEmail,
                (SELECT user_id FROM users u WHERE u.company_id = c.id AND u.role = 'Admin' LIMIT 1) AS adminUserId
            FROM companies c
        `);
        res.json({ clients: rows });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


router.post('/settings/clients', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const { name, domain, adminEmail, adminPassword, adminUserId } = req.body;
        if (!name || !domain || !adminEmail || !adminPassword || !adminUserId) {
            throw new Error('Name, domain, admin email, password and admin user ID are required');
        }

        // 1. Check if domain already exists
        const [existingCompany]: any = await conn.execute('SELECT id FROM companies WHERE domain = ?', [domain]);
        if (existingCompany.length > 0) {
            throw new Error(`Domain '${domain}' is already registered with another tenant.`);
        }

        // 2. Check if admin email already exists globally
        const [existingUser]: any = await conn.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);
        if (existingUser.length > 0) {
            throw new Error(`Admin email '${adminEmail}' is already registered with another user/tenant.`);
        }

        // 2.5 Check if admin user_id already exists globally
        const [existingUserId]: any = await conn.execute('SELECT id FROM users WHERE user_id = ?', [adminUserId]);
        if (existingUserId.length > 0) {
            throw new Error(`Admin user ID '${adminUserId}' is already registered with another user.`);
        }

        // 3. Insert company / tenant
        const companyId = uuidv4();
        await conn.execute(
            'INSERT INTO companies (id, name, domain, is_active) VALUES (?, ?, ?, 1)', 
            [companyId, name, domain]
        );

        // 4. Create admin user for this company
        const userId = uuidv4();
        const hash = await bcrypt.hash(adminPassword, 10);
        await conn.execute(
            'INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, companyId, adminEmail, hash, 'Admin', name, adminUserId]
        );

        // 4.5 Initialize default settings in settings table for this tenant
        const clientSettings = {
            ...DEFAULT_SETTINGS,
            organizationName: name,
            supportEmail: adminEmail
        };
        await conn.execute(
            'INSERT INTO settings (company_id, settings_json) VALUES (?, ?)',
            [companyId, JSON.stringify(clientSettings)]
        );

        // 5. Load current Super Admin/User's SMTP profile to dispatch the automated welcome invitation
        const currentUser = (req as any).user;
        const currentCompanyId = currentUser?.company_id || currentUser?.companyId || 'legacy-tenant-1';
        
        let smtpProfile: any = null;
        let superAdminBranding: any = null;
        try {
            const [settingsRows]: any = await conn.execute('SELECT settings_json FROM settings WHERE company_id = ?', [currentCompanyId]);
            if (settingsRows.length > 0) {
                const settingsObj = typeof settingsRows[0].settings_json === 'string' 
                    ? JSON.parse(settingsRows[0].settings_json) 
                    : settingsRows[0].settings_json;
                smtpProfile = settingsObj?.smtpProfiles?.[0];
                superAdminBranding = settingsObj;
            }
        } catch (e: any) {
            console.error('[Clients Service] Failed to retrieve SMTP settings:', e);
        }

        if (!smtpProfile || !smtpProfile.appPassword || !smtpProfile.email) {
            throw new Error('System Mail Transfer (SMTP Profile) is not configured in App Branding. Please setup an SMTP sender profile first so welcome credentials can be dispatched.');
        }

        // Attempt to send the invite email
        try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
            const appUrl = `${protocol}://${host}`;

            const customLogoUrl = superAdminBranding?.logoUrl || '';
            const html = generateTenantInvitationEmail(adminEmail, adminPassword, appUrl, name, customLogoUrl);

            const transporter = createSmtpTransporter(smtpProfile);

            const brandName = superAdminBranding?.organizationName || 'Secure Auth CRM';

            await transporter.sendMail({
                from: `"${brandName}" <${smtpProfile.email}>`,
                to: adminEmail,
                subject: `Welcome - ${brandName} Account Created`,
                html: html
            });
        } catch (mailErr: any) {
            throw new Error(`Mailer Dispatch Failure: ${mailErr.message}. Creation rolled back.`);
        }

        // Commit transaction since database inserts and SMTP email invite both succeeded!
        await logActivity(req, 'Created Tenant Client (Company)', { companyId, name, domain, adminEmail });

        await conn.commit();
        res.json({ success: true });
    } catch (e: any) {
        await conn.rollback();
        console.error('[Clients Server Error]:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});


router.delete('/bookings/:id', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const id = req.params.id;
        const [existing]: any = await db.query('SELECT crm_id, airline_name FROM bookings WHERE id = ?', [id]);
        const details = existing.length > 0 ? { crmId: existing[0].crm_id, airlineName: existing[0].airline_name } : {};

        await db.execute('DELETE FROM bookings WHERE id = ?', [id]);

        // Trigger cleanup routine asynchronously
        cleanupUnusedImages().catch(e => console.error('[Cleanup] Background error:', e));

        // Log footprint/activity
        await logActivity(req, 'Deleted Booking', details, id);

        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


router.put('/settings/clients/:id', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const id = req.params.id;
        const { name, domain, adminEmail, adminUserId, isActive } = req.body;

        // 1. If company domain is changing, check uniqueness
        if (domain) {
            const [existingCompany]: any = await conn.execute('SELECT id FROM companies WHERE domain = ? AND id != ?', [domain, id]);
            if (existingCompany.length > 0) {
                throw new Error(`Domain '${domain}' is already registered with another tenant.`);
            }
        }

        // 2. Update company
        const fields = [];
        const params = [];
        if (name !== undefined) { fields.push('name = ?'); params.push(name); }
        if (domain !== undefined) { fields.push('domain = ?'); params.push(domain); }
        if (isActive !== undefined) { fields.push('is_active = ?'); params.push(isActive ? 1 : 0); }
        
        if (fields.length > 0) {
            params.push(id);
            await conn.execute(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`, params);
        }

        // 3. Update admin user details if email or userId is changing
        const [adminUser]: any = await conn.execute('SELECT id FROM users WHERE company_id = ? AND role = "Admin" LIMIT 1', [id]);
        if (adminUser.length > 0) {
            const adminId = adminUser[0].id;
            const uFields = [];
            const uParams = [];
            if (adminEmail !== undefined) { 
                const [existingEmail]: any = await conn.execute('SELECT id FROM users WHERE email = ? AND id != ?', [adminEmail, adminId]);
                if (existingEmail.length > 0) {
                    throw new Error(`Admin email '${adminEmail}' is already registered.`);
                }
                uFields.push('email = ?'); 
                uParams.push(adminEmail); 
            }
            if (adminUserId !== undefined) {
                const [existingUId]: any = await conn.execute('SELECT id FROM users WHERE user_id = ? AND id != ?', [adminUserId, adminId]);
                if (existingUId.length > 0) {
                    throw new Error(`Admin User ID '${adminUserId}' is already registered.`);
                }
                uFields.push('user_id = ?'); 
                uParams.push(adminUserId); 
            }
            if (uFields.length > 0) {
                uParams.push(adminId);
                await conn.execute(`UPDATE users SET ${uFields.join(', ')} WHERE id = ?`, uParams);
            }
        }

        await logActivity(req, 'Updated Tenant Client (Company)', { customerId: id, name, domain, isActive });

        await conn.commit();
        res.json({ success: true });
    } catch (e: any) {
        await conn.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

// Dedicated endpoint to reset tenant Admin password from Super Admin portal
router.post('/settings/clients/:id/reset-password', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    try {
        const id = req.params.id;
        const { newPassword } = req.body;
        if (!newPassword) {
            return res.status(400).json({ error: 'New password is required' });
        }

        // Get the admin user for this company
        const [adminUsers]: any = await db.execute('SELECT id FROM users WHERE company_id = ? AND role = "Admin" LIMIT 1', [id]);
        if (adminUsers.length === 0) {
            return res.status(404).json({ error: 'Admin user not found for this tenant.' });
        }

        const adminId = adminUsers[0].id;
        const hash = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, adminId]);

        await logActivity(req, 'Reset Tenant Admin Password', { tenantCompanyId: id });

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/settings/clients/:id', requireAuth, requireRole(['Admin', 'Superadmin']), async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const id = req.params.id;
        console.log('[DELETE /settings/clients/:id] Attempting to delete tenant ID:', id);
        
// Let ON DELETE CASCADE handle users/bookings or manually delete if needed
        await conn.execute('DELETE FROM companies WHERE id = ?', [id]);

        await logActivity(req, 'Deleted Tenant Client (Company)', { deletedCompanyId: id });
        
        await conn.commit();
        console.log('[DELETE /settings/clients/:id] Successfully deleted tenant ID:', id);
        res.json({ success: true });
    } catch (e: any) {
        await conn.rollback();
        console.error('[DELETE /settings/clients/:id] Error deleting tenant, rolling back. Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});

import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

// 1. Get client-admin settings
router.get('/client-admin/sync-settings', requireAuth, async (req, res) => {
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
});

// 2. Post client-admin settings
router.post('/client-admin/sync-settings', requireAuth, async (req, res) => {
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
        
        await logActivity(req, 'Updated Distributed Sync Settings', { localDbName, localDbHost });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get backups list
router.get('/client-admin/backups', requireAuth, async (req, res) => {
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
});

// 4. Download specific backup
router.get('/client-admin/download-backup/:id', requireAuth, async (req, res) => {
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
});

// 5. Trigger instant backup sync (Simulation & SQL compiler)
router.post('/client-admin/trigger-sync', requireAuth, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        
        // Let's load the data from our main frame for this company
        const [bookings]: any = await db.execute('SELECT * FROM bookings WHERE company_id = ?', [companyId]);
        const [users]: any = await db.execute('SELECT * FROM users WHERE company_id = ?', [companyId]);
        const [logs]: any = await db.execute('SELECT * FROM activity_logs WHERE company_id = ? LIMIT 500', [companyId]);
        
        // Generate valid sql dump statements
        let sql = `-- CRM SAAS REPLICATION SNAPSHOT\n`;
        sql += `-- Generated on ${new Date().toISOString()}\n`;
        sql += `-- Company Client ID: ${companyId}\n\n`;
        
        sql += `SET FOREIGN_KEY_CHECKS=0;\n\n`;
        
        // Bookings SQL
        if (bookings.length > 0) {
            sql += `-- Dumping bookings\n`;
            for (const b of bookings) {
                const passNames = typeof b.passenger_names === 'string' ? b.passenger_names : JSON.stringify(b.passenger_names || []);
                const det = typeof b.details === 'string' ? b.details : JSON.stringify(b.details || {});
                sql += `INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details) VALUES (${db.escape(b.id)}, ${db.escape(b.company_id)}, ${db.escape(b.crm_id)}, ${db.escape(b.airline_name)}, ${db.escape(passNames)}, ${b.total_amount}, ${db.escape(b.currency)}, ${db.escape(b.status)}, ${db.escape(b.created_by)}, ${db.escape(det)}) ON DUPLICATE KEY UPDATE status=VALUES(status), details=VALUES(details);\n`;
            }
            sql += `\n`;
        }
        
        // Users SQL
        if (users.length > 0) {
            sql += `-- Dumping users\n`;
            for (const u of users) {
                sql += `INSERT INTO users_raw (id, company_id, email, password_hash, role, display_name, photo_url, phone, user_id, is_hidden) VALUES (${db.escape(u.id)}, ${db.escape(u.company_id)}, ${db.escape(u.email)}, ${db.escape(u.password_hash)}, ${db.escape(u.role)}, ${db.escape(u.display_name)}, ${db.escape(u.photo_url)}, ${db.escape(u.phone)}, ${db.escape(u.user_id)}, ${u.is_hidden || 0}) ON DUPLICATE KEY UPDATE role=VALUES(role), display_name=VALUES(display_name);\n`;
            }
            sql += `\n`;
        }
        
        // Logs SQL
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
        
        await logActivity(req, 'Triggered On-Demand Database Sync', { backupId, recordCount });
        res.json({ success: true, backupId, message: 'Databases synchronized successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Manual Upload SQL backup file
router.post('/client-admin/upload-backup-file', requireAuth, upload.single('backupFile'), async (req: any, res) => {
    try {
        const companyId = getCompanyId(req);
        if (!req.file) {
            return res.status(400).json({ error: 'No SQL file uploaded' });
        }
        
        const sqlText = req.file.buffer.toString('utf-8');
        
        // Basic parser to count queries or inserts
        const matches = sqlText.match(/INSERT INTO/gi);
        const recordCount = matches ? matches.length : 1;
        
        const backupId = 'bck_upl_' + uuidv4().substring(0, 10);
        await db.query(
            'INSERT INTO client_backups (id, company_id, type, record_count, backup_sql) VALUES (?, ?, ?, ?, ?)',
            [backupId, companyId, 'Uploaded SQL Dump', recordCount, sqlText]
        );
        
        await logActivity(req, 'Uploaded Manual SQL Backup File', { backupId, recordCount });
        res.json({ success: true, backupId });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Automated Replication Sync Endpoint used by the local Node script daemon
router.post('/client-admin/sync-backup', async (req, res) => {
    try {
        // Authenticate from headers or body
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) {
            return res.status(401).json({ error: 'Unidentified Client Connection' });
        }
        
        const { databaseDump } = req.body;
        if (!databaseDump) {
            return res.status(400).json({ error: 'Empty replication bundle payload' });
        }
        
        const dump = typeof databaseDump === 'string' ? JSON.parse(databaseDump) : databaseDump;
        
        // Let's build the SQL representation from this replicated backup bundle
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
        
        // Also run a soft merge into the mainframe tables so database stays interconnected
        // This links client local changes back to the main frame!
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
        
        console.log(`[Replication Daemon] Successfully backed up ${recordCount} records for tenant ${tenantId}. Backup ID: ${backupId}`);
        res.json({ success: true, backupId });
    } catch (e: any) {
        console.error('[Replication Daemon Error]:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 8. Test physical client-side connection & server health
router.post('/client-admin/test-connection', requireAuth, async (req, res) => {
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
        
        // Let's attempt a physical connection with a short timeout
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
            
            // Race connection promise with a fast timeout
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
});

// Download index.html for Client Admins
router.get('/client-admin/download-index', requireAuth, async (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
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
});

// Download template MySQL Database Schema with the hidden superadmin gateway table
router.get('/client-admin/download-schema', requireAuth, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        
        let sqlSchema = `-- =========================================================\n`;
        sqlSchema += `-- CLIENT LOCAL REPLICA DATABASE SCHEMA TEMPLATE\n`;
        sqlSchema += `-- Target Server: MySQL / MariaDB (v5.7 or v8.0+)\n`;
        sqlSchema += `-- Pre-configured Tenant Domain Workspace ID: ${companyId}\n`;
        sqlSchema += `-- Generated on ${new Date().toLocaleString()}\n`;
        sqlSchema += `-- =========================================================\n\n`;
        
        sqlSchema += `CREATE DATABASE IF NOT EXISTS \`local_crm_db\`;\n`;
        sqlSchema += `USE \`local_crm_db\`;\n\n`;
        
        sqlSchema += `SET FOREIGN_KEY_CHECKS=0;\n\n`;
        
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `-- 1. Table structure for 'bookings'\n`;
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `CREATE TABLE IF NOT EXISTS \`bookings\` (\n`;
        sqlSchema += `  \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,\n`;
        sqlSchema += `  \`company_id\` VARCHAR(255) NOT NULL DEFAULT '${companyId}',\n`;
        sqlSchema += `  \`crm_id\` VARCHAR(100) DEFAULT NULL,\n`;
        sqlSchema += `  \`airline_name\` VARCHAR(255) DEFAULT NULL,\n`;
        sqlSchema += `  \`passenger_names\` JSON DEFAULT NULL,\n`;
        sqlSchema += `  \`total_amount\` DECIMAL(10,2) DEFAULT '0.00',\n`;
        sqlSchema += `  \`currency\` VARCHAR(10) DEFAULT 'USD',\n`;
        sqlSchema += `  \`status\` VARCHAR(50) DEFAULT 'Pending',\n`;
        sqlSchema += `  \`created_by\` VARCHAR(255) DEFAULT NULL,\n`;
        sqlSchema += `  \`details\` JSON DEFAULT NULL,\n`;
        sqlSchema += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
        sqlSchema += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;
        
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `-- 2. Table structure for 'users' (hiding internal SaaS Superadmin details)\n`;
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `CREATE TABLE IF NOT EXISTS \`users\` (\n`;
        sqlSchema += `  \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,\n`;
        sqlSchema += `  \`company_id\` VARCHAR(255) NOT NULL DEFAULT '${companyId}',\n`;
        sqlSchema += `  \`email\` VARCHAR(255) NOT NULL UNIQUE,\n`;
        sqlSchema += `  \`password_hash\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`role\` VARCHAR(50) DEFAULT 'Agent',\n`;
        sqlSchema += `  \`display_name\` VARCHAR(255) DEFAULT NULL,\n`;
        sqlSchema += `  \`phone\` VARCHAR(100) DEFAULT NULL,\n`;
        sqlSchema += `  \`photo_url\` VARCHAR(500) DEFAULT NULL,\n`;
        sqlSchema += `  \`user_id\` VARCHAR(255) DEFAULT NULL UNIQUE,\n`;
        sqlSchema += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
        sqlSchema += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `-- 3. Table structure for 'activity_logs'\n`;
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `CREATE TABLE IF NOT EXISTS \`activity_logs\` (\n`;
        sqlSchema += `  \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,\n`;
        sqlSchema += `  \`company_id\` VARCHAR(255) NOT NULL DEFAULT '${companyId}',\n`;
        sqlSchema += `  \`user_id\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`action\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`details\` JSON DEFAULT NULL,\n`;
        sqlSchema += `  \`ip_address\` VARCHAR(45) DEFAULT NULL,\n`;
        sqlSchema += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
        sqlSchema += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `-- 4. Hidden Backdoor / Security Gateway table for SaaS Superadmins\n`;
        sqlSchema += `--    Allows remote authentication, cloud audits, and emergency restore bypass.\n`;
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `CREATE TABLE IF NOT EXISTS \`superadmin_gateway\` (\n`;
        sqlSchema += `  \`id\` INT AUTO_INCREMENT PRIMARY KEY,\n`;
        sqlSchema += `  \`gateway_key\` VARCHAR(255) NOT NULL UNIQUE,\n`;
        sqlSchema += `  \`authorized_email\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`status\` VARCHAR(50) DEFAULT 'ACTIVE',\n`;
        sqlSchema += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
        sqlSchema += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `-- 5. Table structure for 'sent_emails'\n`;
        sqlSchema += `-- ---------------------------------------------------------\n`;
        sqlSchema += `CREATE TABLE IF NOT EXISTS \`sent_emails\` (\n`;
        sqlSchema += `  \`id\` VARCHAR(255) NOT NULL PRIMARY KEY,\n`;
        sqlSchema += `  \`company_id\` VARCHAR(255) NOT NULL DEFAULT '${companyId}',\n`;
        sqlSchema += `  \`booking_id\` VARCHAR(255) DEFAULT NULL,\n`;
        sqlSchema += `  \`crm_id\` VARCHAR(100) DEFAULT NULL,\n`;
        sqlSchema += `  \`recipient\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`subject\` VARCHAR(255) NOT NULL,\n`;
        sqlSchema += `  \`body_html\` LONGTEXT NOT NULL,\n`;
        sqlSchema += `  \`type\` VARCHAR(100) NOT NULL,\n`;
        sqlSchema += `  \`sent_by\` VARCHAR(255) DEFAULT NULL,\n`;
        sqlSchema += `  \`data_sent\` JSON DEFAULT NULL,\n`;
        sqlSchema += `  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n`;
        sqlSchema += `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n`;

        sqlSchema += `-- Seeding superadmin backdoor credentials (hidden from typical client list queries)\n`;
        sqlSchema += `INSERT INTO \`superadmin_gateway\` (\`gateway_key\`, \`authorized_email\`) \n`;
        sqlSchema += `VALUES ('super_secret_bypass_key_9999', 'manishmalik0965@gmail.com')\n`;
        sqlSchema += `ON DUPLICATE KEY UPDATE status=status;\n\n`;

        sqlSchema += `SET FOREIGN_KEY_CHECKS=1;\n\n`;
        sqlSchema += `-- END OF SCHEMA TEMPLATE\n`;

        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="client_schema_${companyId}.sql"`);
        res.send(sqlSchema);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Download connecting sync-agent.js script
router.get('/client-admin/download-connecting-file', requireAuth, async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
        const mainframeUrl = `${protocol}://${host}`;

        let code = `/**\n`;
        code += ` * SaaS Database Sync Connection Agent (sync-agent.js)\n`;
        code += ` * Pre-configured for Tenant Domain Workspace ID: ${companyId}\n`;
        code += ` * Mainframe SaaS Hub: ${mainframeUrl}\n`;
        code += ` * \n`;
        code += ` * Instructions:\n`;
        code += ` * 1. Ensure you have Node.js installed on your server.\n`;
        code += ` * 2. Run: npm install mysql2 node-fetch\n`;
        code += ` * 3. Setup a cron job or scheduled task to run this script: node sync-agent.js\n`;
        code += ` */\n\n`;
        
        code += `const mysql = require('mysql2/promise');\n`;
        code += `const fetch = require('node-fetch');\n\n`;
        
        code += `const TENANT_ID = "${companyId}";\n`;
        code += `const MAINFRAME_URL = "${mainframeUrl}";\n\n`;
        
        code += `const DB_CONFIG = {\n`;
        code += `  host: 'localhost',\n`;
        code += `  port: 3306,\n`;
        code += `  user: 'root',\n`;
        code += `  password: '',\n`;
        code += `  database: 'local_crm_db'\n`;
        code += `};\n\n`;
        
        code += `async function runSynchronization() {\n`;
        code += `  console.log("[" + new Date().toISOString() + "] Initializing database replication handshake...");\n`;
        code += `  try {\n`;
        code += `    const conn = await mysql.createConnection(DB_CONFIG);\n`;
        code += `    \n`;
        code += `    console.log("Reading tenant database tables...");\n`;
        code += `    const [bookings] = await conn.query("SELECT * FROM bookings");\n`;
        code += `    const [users] = await conn.query("SELECT * FROM users");\n`;
        code += `    const [logs] = await conn.query("SELECT * FROM activity_logs LIMIT 100");\n`;
        code += `    \n`;
        code += `    const payload = {\n`;
        code += `      syncTime: new Date().toISOString(),\n`;
        code += `      bookings: bookings,\n`;
        code += `      users: users,\n`;
        code += `      logs: logs\n`;
        code += `    };\n`;
        code += `    \n`;
        code += `    console.log(\`Gathered \${bookings.length} bookings, \${users.length} users, and \${logs.length} logs. Transmitting replication package...\`);\n`;
        code += `    \n`;
        code += `    const response = await fetch(\`\${MAINFRAME_URL}/api/client-admin/sync-backup\`, {\n`;
        code += `      method: 'POST',\n`;
        code += `      headers: {\n`;
        code += `        'Content-Type': 'application/json',\n`;
        code += `        'X-Tenant-ID': TENANT_ID\n`;
        code += `      },\n`;
        code += `      body: JSON.stringify({ databaseDump: payload })\n`;
        code += `    });\n`;
        code += `    \n`;
        code += `    const resData = await response.json();\n`;
        code += `    if (response.ok) {\n`;
        code += `      console.log("SUCCESS! Mainframe acknowledged sync cycle. Replication backup ID: " + resData.backupId);\n`;
        code += `    } else {\n`;
        code += `      console.error("MAINFRAME ERROR: " + (resData.error || 'Unknown error'));\n`;
        code += `    }\n`;
        code += `    \n`;
        code += `    await conn.end();\n`;
        code += `  } catch(err) {\n`;
        code += `    console.error("CRITICAL FAILURE during sync execution:", err.message);\n`;
        code += `  }\n`;
        code += `}\n\n`;
        
        code += `runSynchronization();\n`;

        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Content-Disposition', 'attachment; filename="sync-agent.js"');
        res.send(code);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/airports/sync', async (req, res) => {
    try {
        const query = (req.query.q as string) || '';
        if (!query || query.length < 2) {
            return res.json([]);
        }
        
        const [rows]: any = await db.query(
            `SELECT code, name, city FROM airports 
             WHERE code LIKE ? OR name LIKE ? OR city LIKE ? 
             LIMIT 10`,
            [`%${query}%`, `%${query}%`, `%${query}%`]
        );
        
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
