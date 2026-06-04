import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only-change-me';

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
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: e.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const reqTenantId = req.headers['x-tenant-id'] || req.body.company_id || null;

        let user = null;

        // 1. Search for user globally first by email or user ID
        const [globalRows]: any = await db.query(
            'SELECT * FROM users WHERE email = ? OR user_id = ? LIMIT 1', 
            [email, email]
        );
        const globalUser = globalRows[0];

        if (globalUser) {
            const isSuper = globalUser.role === 'Superadmin' || 
                            globalUser.email?.toLowerCase() === 'manishmalik0965@gmail.com' || 
                            globalUser.email?.toLowerCase() === 'itconflict0@gmail.com';
            
            if (isSuper) {
                // Global superadmins can bypass any tenant-space restrictions and log in anywhere
                user = globalUser;
            } else if (reqTenantId) {
                // Standard tenant users must belong to the active company/tenant
                if (globalUser.company_id === reqTenantId) {
                    user = globalUser;
                } else {
                    return res.status(401).json({ error: 'Unauthorized: User is registered under a different organization' });
                }
            } else {
                user = globalUser;
            }
        }

        // 2. If user doesn't exist globally, register/auto-create them dynamically
        if (!user) {
            const isSuperAdminEmail = email.toLowerCase() === 'manishmalik0965@gmail.com' || email.toLowerCase() === 'itconflict0@gmail.com';
            
            // Double-check to avoid any possible duplicate key clashes
            const [checkDuplicate]: any = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
            if (checkDuplicate.length > 0) {
                return res.status(401).json({ error: 'Unauthorized: Account already exists under another tenant space' });
            }

            const password_hash = await bcrypt.hash(password || 'password_123', 10);
            const id = uuidv4();
            const company_id = reqTenantId || 'legacy-tenant-1';
            const role = isSuperAdminEmail ? 'Superadmin' : 'Agent';
            const displayName = email.split('@')[0];
            const isEmail = email.includes('@');
            const emailColumn = isEmail ? email : `${email}@skyway.com`;
            const userIdColumn = isEmail ? email.split('@')[0] : email;

            await db.query(
                'INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, company_id, emailColumn, password_hash, role, displayName, userIdColumn]
            );

            // Re-fetch the newly created user row
            const [newUsers]: any = await db.query(
                'SELECT * FROM users WHERE email = ? OR user_id = ? LIMIT 1', 
                [emailColumn, userIdColumn]
            );
            user = newUsers[0];
            console.log(`Auto-created user ${email} inside company ${company_id} on login successfully.`);
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect email/user ID or password. Please verify and try again.' });
        }

        if (user.totp_enabled) {
            // Return a temporary token indicating MFA is required
            const mfaToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ requireMFA: true, mfaToken });
        }

        // Generate Standard JWT
        const accessToken = jwt.sign({ 
            id: user.id, 
            company_id: user.company_id, 
            role: user.role 
        }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role, userId: user.user_id } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

export const me = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const [users]: any = await db.query('SELECT id, company_id, email, role, totp_enabled, display_name as displayName, photo_url as photoURL, phone, user_id as userId FROM users WHERE id = ?', [userId]);
        const user = users[0];
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
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

