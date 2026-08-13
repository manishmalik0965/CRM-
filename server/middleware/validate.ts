import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

export const validate = (schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = (await schema.query.parseAsync(req.query)) as any;
      }
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = (error.issues || []).map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        logger.warn('Request validation failed', {
          path: req.originalUrl,
          ip: req.ip,
          errors: formattedErrors
        });

        const firstMsg = formattedErrors[0]?.message || 'Invalid request data';

        return res.status(400).json({
          error: firstMsg,
          details: formattedErrors
        });
      }
      return res.status(500).json({ error: 'Internal validation error' });
    }
  };
};
