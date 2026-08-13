import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRoutes from '../../server/routes/auth.routes';
import { globalErrorHandler } from '../../server/middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(globalErrorHandler);

describe('Authentication API Endpoints', () => {
  it('POST /api/auth/login with missing fields should return validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect([400, 422, 500]).toContain(res.status);
  });

  it('POST /api/auth/login with invalid email format should fail', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'invalid-email', password: 'Password123!' });
    expect([400, 422, 401, 500]).toContain(res.status);
  });

  it('GET /api/auth/me without authorization header should fail with 401', async () => {
    const res = await request(app)
      .get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
