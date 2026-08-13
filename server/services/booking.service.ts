import { bookingRepository } from '../repositories/booking.repository';
import { settingsRepository } from '../repositories/settings.repository';
import { emailRepository } from '../repositories/email.repository';
import { auditService } from './audit.service';
import { decryptText, encryptText } from '../utils/encryption';
import { processBase64Images, cleanupUnusedImages } from '../utils/imageProcessor';
import { generateAuthVerificationPdf } from '../utils/pdfGenerator';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import db from '../database/connection';

export function getCardBrandBackend(number: string): string {
  if (!number) return 'Card';
  const clean = number.toString().replace(/\D/g, '');
  if (clean.length === 0) return 'Card';

  if (/^4/.test(clean)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'Mastercard';
  if (/^3[47]/.test(clean)) return 'American Express';
  if (/^(6011|622(12[6-9]|1[3-9]|[2-8]|9[0-1]|92[0-5])|64[4-9]|65)/.test(clean)) return 'Discover';
  if (/^3(0[0-5]|[68])/.test(clean)) return 'Diners Club';
  if (/^35(2[89]|[3-8])/.test(clean)) return 'JCB';
  if (/^(5018|5020|5038|5893|6304|6759|6761|6762|6763)/.test(clean)) return 'Maestro';
  if (/^62/.test(clean)) return 'UnionPay';

  return 'Credit Card';
}

export const transformBooking = (booking: any, role?: string): any => {
  if (!booking) return null;
  let details: any = {};
  if (booking.details) {
    try {
      details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
    } catch (e) {}
  }
  
  let passengerNames = [];
  if (booking.passenger_names) {
    try {
      passengerNames = typeof booking.passenger_names === 'string' ? JSON.parse(booking.passenger_names) : booking.passenger_names;
    } catch (e) {}
  }

  const resolvedAirlineName = booking.airline_name || details.airlineName || details.airline || 'UNMAPPED';
  const rawAmount = booking.total_amount !== null && booking.total_amount !== undefined 
    ? booking.total_amount 
    : (details.totalAmount !== undefined ? details.totalAmount : (details.amount !== undefined ? details.amount : 0));
  const resolvedTotalAmount = parseFloat(rawAmount);
  const resolvedCurrency = booking.currency || details.currency || 'USD';
  const resolvedStatus = booking.status || details.status || 'draft';

  const rawCardNum = decryptText(booking.card_number || details.cardNumber || details.ccNumber || details.card_number || '');
  const rawCardBrand = booking.card_brand || details.cardBrand || details.card_brand || '';
  const resolvedCardBrand = (!rawCardBrand || rawCardBrand === 'Unknown' || rawCardBrand === 'CARD' || rawCardBrand === 'Card') 
    ? getCardBrandBackend(rawCardNum) 
    : rawCardBrand;

  const resolvedCardHolder = booking.card_holder_name || details.cardHolder || details.cardHolderName || details.ccName || 'Valued Customer';
  const rawLast4 = booking.card_last_4 || details.cardLast4 || details.cardNumberMasked || details.card_last4 || (rawCardNum ? rawCardNum.replace(/\D/g, '').slice(-4) : '');

  const resultObject = {
    id: booking.id,
    companyId: booking.company_id,
    crmId: booking.crm_id,
    passengerNames: Array.isArray(passengerNames) ? passengerNames : [],
    createdBy: booking.created_by,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    agentId: booking.created_by,
    agent_id: booking.created_by,
    agentName: booking.creator_name || details.agentName || 'Unknown',
    creator_name: booking.creator_name || details.agentName || 'Unknown',
    agentEmail: booking.creator_email || details.agentEmail,
    ...details,
    cardBrand: resolvedCardBrand,
    card_brand: resolvedCardBrand,
    cardHolder: resolvedCardHolder,
    card_holder_name: resolvedCardHolder,
    cardLast4: rawLast4,
    card_last4: rawLast4,
    cardNumberMasked: rawLast4
  };

  if (role && (role === 'Agent' || role === 'WFM')) {
    if (resultObject.cardNumber) {
      const num = (resultObject.cardNumber || '').replace(/\s/g, '');
      const last4 = num.slice(-4);
      resultObject.cardNumber = `XXXX XXXX XXXX ${last4}`;
    }
    if (resultObject.ccNumber) {
      const num = (resultObject.ccNumber || '').replace(/\s/g, '');
      const last4 = num.slice(-4);
      resultObject.ccNumber = `XXXX XXXX XXXX ${last4}`;
    }
    if (resultObject.cardNumberMasked) {
      resultObject.cardNumberMasked = 'XXXX';
    }
    if (resultObject.card_last4) {
      resultObject.card_last4 = 'XXXX';
    }
    if (resultObject.cvv) {
      resultObject.cvv = '***';
    }
    if (resultObject.expiry) {
      resultObject.expiry = '**/**';
    }
  }

  return Object.assign(resultObject, {
    airlineName: resolvedAirlineName,
    totalAmount: isNaN(resolvedTotalAmount) ? 0 : resolvedTotalAmount,
    currency: resolvedCurrency,
    status: resolvedStatus,
    cardBrand: resolvedCardBrand,
    card_brand: resolvedCardBrand
  });
};

export class BookingService {
  async getBookings(companyId: string, role: string, query?: string, limit: number = 100, req?: any) {
    const isGlobalAdmin = role === 'Superadmin' || (companyId === 'legacy-tenant-1' && role === 'Admin');
    const rows = await bookingRepository.findBookings(companyId, query, limit, isGlobalAdmin);
    const transformedBookings = rows.map((row: any) => transformBooking(row, role));

    if (req) {
      await auditService.createAuditLog(req, 'Listed Bookings', { count: rows.length, query: query || 'all' });
    }

    return transformedBookings;
  }

  async getRecentUpdates(companyId: string, role: string) {
    const isGlobalAdmin = role === 'Superadmin' || (companyId === 'legacy-tenant-1' && role === 'Admin');
    const rows = await bookingRepository.findRecentUpdates(companyId, isGlobalAdmin);

    return rows.map((row: any) => {
      let passengerNames = [];
      if (row.passenger_names) {
        try {
          passengerNames = typeof row.passenger_names === 'string' ? JSON.parse(row.passenger_names) : row.passenger_names;
        } catch (e) {}
      }
      return {
        id: row.id,
        crmId: row.crm_id,
        status: row.status,
        updatedAt: row.updated_at,
        passengerNames: Array.isArray(passengerNames) ? passengerNames : []
      };
    });
  }

  async getBookingById(id: string, role: string, req?: any) {
    const booking = await bookingRepository.findBookingById(id);
    if (!booking) return null;

    const transformed = transformBooking(booking, role);

    if (req) {
      await auditService.createAuditLog(req, 'Opened Booking', {
        crmId: booking.crm_id,
        status: booking.status,
        passengerName: transformed.passengerName || ''
      }, booking.id);
    }

    return transformed;
  }

  async deleteBooking(id: string, companyId: string, req?: any) {
    const existing = await bookingRepository.findBookingById(id);
    if (!existing) {
      throw new Error('Booking not found');
    }

    await bookingRepository.deleteBooking(id);

    if (req) {
      await auditService.createAuditLog(req, 'Deleted Booking', { crmId: existing.crm_id }, id);
    }

    return { success: true };
  }
}

export const bookingService = new BookingService();
