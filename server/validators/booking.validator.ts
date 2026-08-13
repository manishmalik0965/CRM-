import { z } from 'zod';

export const createBookingSchema = z.object({
  client_id: z.string().optional(),
  clientId: z.string().optional(),
  airline: z.string().min(1, 'Airline is required').optional(),
  origin: z.string().min(1, 'Origin airport/city is required').optional(),
  destination: z.string().min(1, 'Destination airport/city is required').optional(),
  departure_date: z.string().optional(),
  departureDate: z.string().optional(),
  arrival_date: z.string().optional(),
  arrivalDate: z.string().optional(),
  status: z.enum(['Pending', 'pending', 'Confirmed', 'confirmed', 'Ticketed', 'ticketed', 'Cancelled', 'cancelled', 'Completed', 'completed']).optional(),
  total_amount: z.number().nonnegative().optional(),
  totalAmount: z.number().nonnegative().optional(),
  pnr: z.string().optional(),
  passengers: z.array(z.any()).optional(),
  details: z.any().optional()
});

export const updateBookingSchema = createBookingSchema.partial();
