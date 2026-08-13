import { Request, Response, NextFunction } from 'express';

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = (user.role || 'agent').toLowerCase();
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    // Landlord / Super admin bypass or role match
    if (user.isLandlord || userRole === 'superadmin' || normalizedAllowed.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden: Insufficient role permissions',
      requiredRoles: allowedRoles,
      yourRole: userRole
    });
  };
};
