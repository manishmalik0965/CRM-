import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(2, 'Client name must be at least 2 characters'),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  phone: z.string().optional(),
  passportNumber: z.string().optional(),
  passport_number: z.string().optional(),
  nationality: z.string().optional(),
  dob: z.string().optional(),
  notes: z.string().optional()
});

export const updateClientSchema = createClientSchema.partial();
