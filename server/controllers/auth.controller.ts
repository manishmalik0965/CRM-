import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import validateEnv from '../config/env';

const env = validateEnv();
const JWT_SECRET = env.JWT_SECRET;

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, company_id } = req.body;

        if (!email || !password || !company_id) {
            return res.status(400).json({ error: 'Email, password, and company_id are required' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const id = uuidv4();

        await db.query(
            'INSERT INTO users (id, company_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [id, company_id, email, password_hash, 'Agent']
        );

        res.json({ success: true, message: 'User registered successfully' });
    } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: `The email address "${req.body.email}" is already registered within this organization.` });
        }
        res.status(500).json({ error: e.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const reqTenantId = req.headers['x-tenant-id'] || req.body.company_id || req.body.tenantId || null;

        if (!email) {
            return res.status(400).json({ error: 'Email or User ID is required' });
        }

        const cleanInput = (email || '').toLowerCase().trim();
        const isSuperAdminCreds = cleanInput === 'manishmalik0965@gmail.com' || 
                                  cleanInput === 'itconflict0@gmail.com' || 
                                  cleanInput === 'admin-0965' || 
                                  cleanInput === 'itconflict';

        let user = null;

        try {
            // 1. Search for user. If tenantId is provided, filter by it.
            let sql = 'SELECT * FROM users WHERE (email = ? OR user_id = ?)';
            let params = [email, email];
            
            if (reqTenantId) {
                sql += ' AND company_id = ?';
                params.push(reqTenantId);
            }
            sql += ' LIMIT 1';

            const [rows]: any = await db.query(sql, params);
            const foundUser = rows[0];

            if (foundUser) {
                const isSuper = foundUser.role === 'Superadmin' || 
                                foundUser.email?.toLowerCase() === 'manishmalik0965@gmail.com' || 
                                foundUser.email?.toLowerCase() === 'itconflict0@gmail.com';
                
                if (isSuper) {
                    user = foundUser;
                } else if (reqTenantId) {
                    // Already filtered by SQL, but double check
                    if (foundUser.company_id === reqTenantId || reqTenantId === 'legacy-tenant-1') {
                        user = foundUser;
                    } else {
                        return res.status(401).json({ error: 'Unauthorized: User is registered under a different organization' });
                    }
                } else {
                    user = foundUser;
                }
            }

            // 2. If user doesn't exist, register/auto-create them dynamically ONLY if it's the master owner/admin.
            if (!user) {
                if (!isSuperAdminCreds) {
                    return res.status(401).json({ error: 'Authentication failed: User not found in this organization.' });
                }

                // For superadmins, we allow auto-creation if they don't exist in the target tenant
                const targetCompanyId = reqTenantId || 'legacy-tenant-1';
                
                // Double-check to avoid any possible duplicate key clashes within the same tenant
                const [checkDuplicate]: any = await db.query('SELECT * FROM users WHERE email = ? AND company_id = ? LIMIT 1', [email, targetCompanyId]);
                if (checkDuplicate.length > 0) {
                    user = checkDuplicate[0];
                } else {
                    const password_hash = await bcrypt.hash(password || 'Admin@123', 10);
                    const id = uuidv4();
                    const role = 'Superadmin';
                    const displayName = email.split('@')[0];
                    const isEmail = email.includes('@');
                    const emailColumn = isEmail ? email : `${email}@skyway.com`;
                    const userIdColumn = isEmail ? email.split('@')[0] : email;

                    await db.query(
                        'INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [id, targetCompanyId, emailColumn, password_hash, role, displayName, userIdColumn]
                    );

                    const [newUsers]: any = await db.query(
                        'SELECT * FROM users WHERE id = ? LIMIT 1', 
                        [id]
                    );
                    user = newUsers[0];
                }
            }
        } catch (dbErr: any) {
            console.warn("[Auth Login DB Notice]", dbErr?.message || dbErr);
            // If DB connection fails, provide offline superadmin authentication fallback
            if (isSuperAdminCreds && (password === 'Admin@123' || password === 'password_123' || password === 'Password123!' || !password)) {
                const isIT = cleanInput === 'itconflict0@gmail.com' || cleanInput === 'itconflict';
                const saEmail = isIT ? 'itconflict0@gmail.com' : 'manishmalik0965@gmail.com';
                const saUserId = isIT ? 'itconflict' : 'admin-0965';
                const saId = isIT ? 'super-admin-2' : 'super-admin-1';

                const accessToken = jwt.sign({ 
                    id: saId, 
                    company_id: 'legacy-tenant-1', 
                    role: 'Superadmin' 
                }, JWT_SECRET, { expiresIn: '24h' });

                return res.json({ 
                    accessToken, 
                    user: { 
                        id: saId, 
                        email: saEmail, 
                        role: 'Superadmin', 
                        userId: saUserId, 
                        companyId: 'legacy-tenant-1' 
                    } 
                });
            }

            return res.status(500).json({ error: 'Database connection error. Please verify database setup or access privileges.' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect email/user ID or password. Please verify and try again.' });
        }

        if (user.totp_enabled) {
            const mfaToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ requireMFA: true, mfaToken });
        }

        const accessToken = jwt.sign({ 
            id: user.id, 
            company_id: user.company_id, 
            role: user.role 
        }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role, userId: user.user_id, companyId: user.company_id } });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Authentication failed' });
    }
};

export const me = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const tokenRole = (req as any).user?.role;
        const tokenCompany = (req as any).user?.company_id;

        try {
            const [users]: any = await db.query('SELECT id, company_id, email, role, totp_enabled, display_name as displayName, photo_url as photoURL, phone, user_id as userId FROM users WHERE id = ?', [userId]);
            const user = users[0];
            if (user) return res.json({ user });
        } catch (dbErr) {
            console.warn("[Auth Me DB Notice]", dbErr);
        }

        if (userId === 'super-admin-1' || userId === 'super-admin-2' || tokenRole === 'Superadmin') {
            const isIT = userId === 'super-admin-2';
            return res.json({
                user: {
                    id: userId,
                    company_id: tokenCompany || 'legacy-tenant-1',
                    email: isIT ? 'itconflict0@gmail.com' : 'manishmalik0965@gmail.com',
                    role: 'Superadmin',
                    displayName: isIT ? 'Super Admin (IT Conflict)' : 'Super Admin (Manish Malik)',
                    userId: isIT ? 'itconflict' : 'admin-0965'
                }
            });
        }

        return res.status(404).json({ error: 'User not found' });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'User request failed' });
    }
};

export const setupTOTP = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const [rows]: any = await db.query('SELECT email, user_id FROM users WHERE id = ?', [userId]);
        const user = rows[0];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const accountName = user.user_id || user.email.split('@')[0];
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(accountName, 'SKY_CRM', secret);
        
        await db.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]);

        const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
        res.json({ qrCode: qrCodeDataUrl, secret });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const verifyTOTP = async (req: Request, res: Response) => {
    try {
        const { token, mfaToken } = req.body;
        
        const decoded: any = jwt.verify(mfaToken, JWT_SECRET);
        const [users]: any = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        const user = users[0];

        const isValid = authenticator.verify({ token, secret: user.totp_secret });
        
        if (!isValid) return res.status(401).json({ error: 'Invalid authenticator code' });

        const accessToken = jwt.sign({ 
            id: user.id, 
            company_id: user.company_id, 
            role: user.role 
        }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
    } catch (e: any) {
        res.status(401).json({ error: 'Invalid or expired MFA token' });
    }
};


export const enableTOTP = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { token } = req.body;
        
        const [users]: any = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        const user = users[0];
        if (!user || !user.totp_secret) return res.status(400).json({ error: 'MFA not setup' });

        const isValid = authenticator.verify({ token, secret: user.totp_secret });
        if (!isValid) return res.status(401).json({ error: 'Invalid authenticator code' });

        await db.query('UPDATE users SET totp_enabled = 1 WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const disableTOTP = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        await db.query('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

