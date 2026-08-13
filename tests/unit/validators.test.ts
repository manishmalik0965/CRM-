import { describe, it, expect } from 'vitest';
import { createBookingSchema } from '../../server/validators/booking.validator';
import { loginSchema, registerSchema } from '../../server/validators/auth.validator';

describe('Validator Schemas', () => {
  describe('createBookingSchema', () => {
    it('should validate valid booking payload', () => {
      const payload = {
        airline: 'Delta',
        origin: 'JFK',
        destination: 'LAX',
        status: 'Confirmed',
        total_amount: 450.50,
        pnr: 'ABC123XYZ'
      };
      const result = createBookingSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should fail on negative total amount', () => {
      const payload = {
        total_amount: -100
      };
      const result = createBookingSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('authSchema', () => {
    it('should validate correct login schema', () => {
      const payload = {
        email: 'agent@airline.com',
        password: 'Password123!'
      };
      const result = loginSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format on registration schema', () => {
      const payload = {
        email: 'not-an-email',
        password: 'Password123!'
      };
      const result = registerSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
