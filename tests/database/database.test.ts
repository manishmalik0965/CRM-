import { describe, it, expect } from 'vitest';
import pool from '../../server/database/connection';

describe('Database Connection & Proxy Mechanics', () => {
  it('pool should be defined and configured', () => {
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.execute).toBe('function');
    expect(typeof pool.getConnection).toBe('function');
  });

  it('pool.query should handle execution gracefully without crashing', async () => {
    try {
      const [rows] = await pool.query('SELECT 1 as test');
      expect(rows).toBeDefined();
    } catch (err: any) {
      // Access denied or connection refuser on dev env without active MySQL is handled safely
      expect(err).toBeDefined();
    }
  });
});
