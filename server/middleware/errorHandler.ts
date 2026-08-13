import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || err.status || 500;
  const requestId = req.headers['x-request-id'] as string;
  const userId = (req as any).user?.id || (req as any).user?.userId;
  const companyId = (req as any).user?.company_id || (req as any).user?.companyId;

  logger.error(err.message || 'Unhandled Internal Server Error', err, {
    requestId,
    userId,
    companyId,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: err.isOperational ? err.message : 'An unexpected server error occurred.',
    requestId,
    ...(isProduction ? {} : { stack: err.stack, details: err })
  });
};
