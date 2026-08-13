import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import validateEnv from '../config/env';

const env = validateEnv();
const JWT_SECRET = env.JWT_SECRET;

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        (req as any).user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

export const requireTenant = (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user || !(req as any).user.company_id) {
        return res.status(403).json({ error: 'Forbidden: Company scope required' });
    }
    next();
};

export const requireRole = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized: Authentication required' });
        }
        
        const role = user.role || 'Agent';
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ error: `Forbidden: Access restricted. Required roles: [${allowedRoles.join(', ')}]` });
        }
        next();
    };
};
