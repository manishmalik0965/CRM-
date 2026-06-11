import { requireAuth } from '../middleware/requireAuth';
import { Router } from 'express';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { generateTenantInvitationEmail } from '../../src/lib/emailTemplates';

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

    const resultObject = {
        id: booking.id,
        companyId: booking.company_id,
        crmId: booking.crm_id,
        passengerNames: Array.isArray(passengerNames) ? passengerNames : [],
        createdBy: booking.created_by,
        createdAt: booking.created_at,
        updatedAt: booking.updated_at,
        ...details
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
        status: resolvedStatus
    });
};

// Audit Logs GET & POST Endpoints
router.get('/audit-logs', async (req, res) => {
    try {
        const companyId = getCompanyId(req);
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

        const [rows]: any = await db.query(
            `SELECT al.id, al.action, al.created_at as timestamp, u.email as userEmail, al.details 
             FROM activity_logs al 
             LEFT JOIN users u ON al.user_id = u.id 
             WHERE al.company_id = ? 
             ORDER BY al.created_at DESC LIMIT ?`,
            [companyId, limit]
        );

        const formattedLogs = rows.map((row: any) => {
            let detailsStr = '';
            let bookingIdVal = null;
            if (row.details) {
                try {
                    const detailsObj = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
                    detailsStr = detailsObj?.details || '';
                    bookingIdVal = detailsObj?.bookingId || null;
                } catch (e) {
                    detailsStr = row.details;
                }
            } else {
                detailsStr = '';
            }
            return {
                id: row.id,
                action: row.action,
                timestamp: row.timestamp,
                userEmail: row.userEmail || 'Internal Staff',
                details: detailsStr,
                bookingId: bookingIdVal
            };
        });

        res.json(formattedLogs);
    } catch (e: any) {
        console.error('Error in GET /audit-logs:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/audit-logs', async (req, res) => {
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
        const detailsJson = JSON.stringify({ details, bookingId });

        await db.query(
            'INSERT INTO activity_logs (id, company_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)',
            [id, companyId, userId, action || '', detailsJson]
        );

        res.json({ success: true });
    } catch (e: any) {
        console.error('Error in POST /audit-logs:', e);
        res.status(500).json({ error: e.message });
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
    smtpProfiles: [
        { email: 'ticketing@skyway.com', appPassword: '', label: 'Main Ticketing' }
    ]
};

// Bookings
router.get('/bookings', async (req, res) => {
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
                sql = 'SELECT * FROM bookings WHERE crm_id LIKE ? OR passenger_names LIKE ? OR details LIKE ? ORDER BY created_at DESC LIMIT ?';
                params = [`%${query}%`, `%${query}%`, `%${query}%`, limit];
            } else {
                sql = 'SELECT * FROM bookings ORDER BY created_at DESC LIMIT ?';
                params = [limit];
            }
        } else {
            if (query) {
                sql = 'SELECT * FROM bookings WHERE company_id = ? AND (crm_id LIKE ? OR passenger_names LIKE ? OR details LIKE ?) ORDER BY created_at DESC LIMIT ?';
                params = [companyId, `%${query}%`, `%${query}%`, `%${query}%`, limit];
            } else {
                sql = 'SELECT * FROM bookings WHERE company_id = ? ORDER BY created_at DESC LIMIT ?';
                params = [companyId, limit];
            }
        }

        const [rows]: any = await db.execute(sql, params);
        const transformedBookings = rows.map((row: any) => transformBooking(row, role));
        res.json({ bookings: transformedBookings });
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

router.get('/settings', async (req, res) => {
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

router.post('/settings', async (req, res) => {
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

router.get('/bookings/recent-updates', async (req, res) => {
    try {
        const [rows]: any = await db.execute("SELECT * FROM bookings WHERE status IN ('authorized', 'charged', 'chargeback') ORDER BY updated_at DESC LIMIT 5");
        const transformed = rows.map((row: any) => transformBooking(row, getUserRole(req)));
        res.json(transformed);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/settings/stats', async (req, res) => {
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

router.post('/settings/users', requireAuth, async (req, res) => {
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
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/settings/users/:id', requireAuth, async (req, res) => {
    try {
        const { email, displayName, role, temporaryPassword, photoURL, phone, userId } = req.body;
        const id = req.params.id;

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
        let params: any[] = [email, role, displayName || '', userId || null];
        
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
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/settings/users/:id', requireAuth, async (req, res) => {
    try {
        await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
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
        const { airlineName, passengerNames, totalAmount, currency, status, crmId, ...details } = req.body;
        const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
        
        await conn.execute(
            'INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, companyId, crmId || '', airlineName || '', JSON.stringify(passengerNames || []), totalAmount || 0, currency || 'USD', status || 'draft', user?.id || '', JSON.stringify(details)]
        );
        
        await conn.commit();
        console.log('[POST /bookings] Successfully saved booking ID:', id);
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
        
        await conn.execute(
            'UPDATE bookings SET airline_name = ?, passenger_names = ?, total_amount = ?, currency = ?, status = ?, details = ? WHERE id = ?',
            [
                finalAirlineName || '', 
                JSON.stringify(Array.isArray(finalPassengerNames) ? finalPassengerNames : []), 
                finalTotalAmount !== null && finalTotalAmount !== undefined ? finalTotalAmount : 0, 
                finalCurrency || 'USD', 
                finalStatus || 'draft', 
                JSON.stringify(mergedDetails || {}), 
                id
            ]
        );
        
        await conn.commit();
        console.log('[PUT /bookings/:id] Successfully updated booking ID:', id);
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
        const [rows]: any = await db.execute('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        
        // Transform for frontend
        const booking = rows[0];
        let details = {};
        if (booking.details) {
           try {
             details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
           } catch (e) {}
        }
        res.json(transformBooking(booking, getUserRole(req)));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
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
            authMetadata: authMetadata || existingDetails.authMetadata,
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
        
        await conn.commit();
        console.log('[PUT /public/bookings/:id/authorize] Client authorized booking ID successfully:', id);
        res.json({ success: true, id });
    } catch (e: any) {
        await conn.rollback();
        console.error('[PUT /public/bookings/:id/authorize] Error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        conn.release();
    }
});


router.get('/settings/clients', requireAuth, async (req, res) => {
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


router.post('/settings/clients', requireAuth, async (req, res) => {
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

            const transporter = nodemailer.createTransport({
                host: smtpProfile.host || 'smtp.gmail.com',
                port: smtpProfile.port ? parseInt(smtpProfile.port) : 465,
                secure: smtpProfile.port == 587 ? false : true,
                auth: { user: smtpProfile.email, pass: smtpProfile.appPassword.replace(/\s+/g, '') }
            });

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


router.delete('/bookings/:id', requireAuth, async (req, res) => {
    try {
        await db.execute('DELETE FROM bookings WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


router.put('/settings/clients/:id', requireAuth, async (req, res) => {
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
router.post('/settings/clients/:id/reset-password', requireAuth, async (req, res) => {
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

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/settings/clients/:id', requireAuth, async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const id = req.params.id;
        console.log('[DELETE /settings/clients/:id] Attempting to delete tenant ID:', id);
        
        // Let ON DELETE CASCADE handle users/bookings or manually delete if needed
        await conn.execute('DELETE FROM companies WHERE id = ?', [id]);
        
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

export default router;
