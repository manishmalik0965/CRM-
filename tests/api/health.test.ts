import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRoutes from '../../server/routes/auth.routes';
import apiRoutes from '../../server/routes/api.routes';
import { globalErrorHandler } from '../../server/middleware/errorHandler';

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/ready', (req, res) => {
    res.status(200).json({ status: 'ready', database: 'connected' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use(globalErrorHandler);

  return app;
}

describe('Health and Readiness APIs', () => {
  const app = buildTestApp();

  it('GET /api/health should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/ready should return status ready', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /api/nonexistent should return 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
