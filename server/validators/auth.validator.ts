import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Please enter your email address or user ID').trim(),
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters').optional(),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').optional()
});

export const verifyTotpSchema = z.object({
  token: z.string().min(6, 'TOTP token must be 6 digits').max(6, 'TOTP token must be 6 digits'),
  mfaToken: z.string().min(1, 'MFA token is required')
});

export const enableTotpSchema = z.object({
  token: z.string().min(6, 'TOTP token must be 6 digits').max(6, 'TOTP token must be 6 digits')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim()
});
