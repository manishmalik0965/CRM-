import { Request, Response } from 'express';
import { bookingService, getCardBrandBackend, transformBooking } from '../services/booking.service';
import { bookingRepository } from '../repositories/booking.repository';
import { auditService } from '../services/audit.service';
import { decryptText, encryptText } from '../utils/encryption';
import { processBase64Images, cleanupUnusedImages } from '../utils/imageProcessor';
import { generateAuthVerificationPdf } from '../utils/pdfGenerator';
import { publicAuthDocLimiter } from '../middleware/rateLimiter';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import db from '../database/connection';

const getCompanyId = (req: any): string => {
  const user = req.user;
  return user?.company_id || user?.companyId || 'legacy-tenant-1';
};

export const getBookings = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const role = user?.role || 'Agent';
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const bookings = await bookingService.getBookings(companyId, role, query, limit, req);
    res.json({ bookings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getRecentUpdates = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const role = user?.role || 'Agent';

    const updates = await bookingService.getRecentUpdates(companyId, role);
    res.json(updates);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getBookingById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user?.role || 'Agent';
    const { id } = req.params;

    const booking = await bookingService.getBookingById(id, role, req);
    if (!booking) return res.status(404).json({ error: 'Not found' });

    res.json(booking);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createBooking = async (req: Request, res: Response) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const id = uuidv4();
    const user = (req as any).user;
    let { airlineName, passengerNames, totalAmount, currency, status, crmId, ...details } = req.body;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';

    if (details.packageRichText) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const baseUrl = `${proto}://${req.get('host')}`;
      details.packageRichText = await processBase64Images(details.packageRichText, baseUrl);
    }

    const cardNum = details.cardNumber || details.ccNumber || details.card_number || '';
    const cardHolder = details.cardHolder || details.cardHolderName || details.ccName || '';
    const cardBrandDetected = getCardBrandBackend(cardNum);
    const cardBrand = (details.cardBrand && details.cardBrand !== 'Unknown' && details.cardBrand !== 'CARD') ? details.cardBrand : cardBrandDetected;
    const cardLast4 = details.cardLast4 || details.cardNumberMasked || (cardNum ? cardNum.replace(/\D/g, '').slice(-4) : '');
    const cardExpMonth = details.cardExpMonth || (details.expiry ? details.expiry.split('/')[0] : '');
    const cardExpYear = details.cardExpYear || (details.expiry ? details.expiry.split('/')[1] : '');
    const cardCvv = details.cvv || details.cardCvv || '';

    const encryptedCardNum = cardNum ? encryptText(cardNum) : '';
    const encryptedCardCvv = cardCvv ? encryptText(cardCvv) : '';

    details.cardBrand = cardBrand;
    details.card_brand = cardBrand;
    details.cardLast4 = cardLast4;
    details.card_last4 = cardLast4;
    details.cardHolder = cardHolder;

    await conn.execute(
      'INSERT INTO bookings (id, company_id, crm_id, airline_name, passenger_names, total_amount, currency, status, created_by, details, card_number, card_holder_name, card_last_4, card_brand, card_exp_month, card_exp_year, card_cvv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, companyId, crmId || '', airlineName || '', JSON.stringify(passengerNames || []), totalAmount || 0, currency || 'USD', status || 'draft', user?.id || '', JSON.stringify(details),
        encryptedCardNum, cardHolder, cardLast4, cardBrand, cardExpMonth, cardExpYear, encryptedCardCvv
      ]
    );

    await conn.commit();
    await auditService.createAuditLog(req, 'Created Booking', { crmId, airlineName, totalAmount, currency, status }, id);

    res.json({ success: true, id });
  } catch (e: any) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

export const updateBooking = async (req: Request, res: Response) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const id = req.params.id;
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || getCompanyId(req);
    const { airlineName, passengerNames, totalAmount, currency, status, crmId, ...details } = req.body;

    const [existing]: any = await conn.execute('SELECT * FROM bookings WHERE id = ? AND company_id = ? FOR UPDATE', [id, companyId]);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found or access denied' });
    }

    const existingRow = existing[0];
    const existingDecryptedCard = decryptText(existingRow.card_number || '');
    const existingDecryptedCvv = decryptText(existingRow.card_cvv || '');

    const finalAirlineName = airlineName !== undefined ? airlineName : existingRow.airline_name;
    const finalTotalAmount = totalAmount !== undefined ? totalAmount : existingRow.total_amount;
    const finalCurrency = currency !== undefined ? currency : existingRow.currency;
    const finalStatus = status !== undefined ? status : existingRow.status;

    let finalPassengerNames = passengerNames;
    if (finalPassengerNames === undefined) {
      finalPassengerNames = existingRow.passenger_names;
      if (typeof finalPassengerNames === 'string') {
        try { finalPassengerNames = JSON.parse(finalPassengerNames); } catch (e) {}
      }
    }

    const filteredDetails: any = {};
    for (const [key, val] of Object.entries(details)) {
      if (val !== undefined) filteredDetails[key] = val;
    }

    let mergedDetails = filteredDetails;
    if (existingRow.details) {
      try {
        let parsed = typeof existingRow.details === 'string' ? JSON.parse(existingRow.details) : existingRow.details;
        mergedDetails = { ...parsed, ...filteredDetails };
      } catch (e) {}
    }

    if (mergedDetails.packageRichText) {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const baseUrl = `${proto}://${req.get('host')}`;
      mergedDetails.packageRichText = await processBase64Images(mergedDetails.packageRichText, baseUrl);
    }

    const cardNum = mergedDetails.cardNumber || mergedDetails.ccNumber || mergedDetails.card_number || existingDecryptedCard || '';
    const cardHolder = mergedDetails.cardHolder || mergedDetails.cardHolderName || mergedDetails.ccName || existingRow.card_holder_name || '';
    const cardBrandDetected = getCardBrandBackend(cardNum);
    const cardBrand = (mergedDetails.cardBrand && mergedDetails.cardBrand !== 'Unknown' && mergedDetails.cardBrand !== 'CARD') ? mergedDetails.cardBrand : (existingRow.card_brand || cardBrandDetected);
    const cardLast4 = mergedDetails.cardLast4 || mergedDetails.cardNumberMasked || (cardNum ? cardNum.replace(/\D/g, '').slice(-4) : existingRow.card_last_4 || '');
    const cardExpMonth = mergedDetails.cardExpMonth || (mergedDetails.expiry ? mergedDetails.expiry.split('/')[0] : existingRow.card_exp_month || '');
    const cardExpYear = mergedDetails.cardExpYear || (mergedDetails.expiry ? mergedDetails.expiry.split('/')[1] : existingRow.card_exp_year || '');
    const cardCvv = mergedDetails.cvv || mergedDetails.cardCvv || existingDecryptedCvv || '';

    const encryptedCardNum = cardNum ? encryptText(cardNum) : '';
    const encryptedCardCvv = cardCvv ? encryptText(cardCvv) : '';

    mergedDetails.cardBrand = cardBrand;
    mergedDetails.card_brand = cardBrand;
    mergedDetails.cardLast4 = cardLast4;
    mergedDetails.card_last4 = cardLast4;
    mergedDetails.cardHolder = cardHolder;

    await conn.execute(
      'UPDATE bookings SET airline_name = ?, passenger_names = ?, total_amount = ?, currency = ?, status = ?, details = ?, card_number = ?, card_holder_name = ?, card_last_4 = ?, card_brand = ?, card_exp_month = ?, card_exp_year = ?, card_cvv = ? WHERE id = ? AND company_id = ?',
      [
        finalAirlineName || '',
        JSON.stringify(Array.isArray(finalPassengerNames) ? finalPassengerNames : []),
        finalTotalAmount !== null && finalTotalAmount !== undefined ? finalTotalAmount : 0,
        finalCurrency || 'USD',
        finalStatus || 'draft',
        JSON.stringify(mergedDetails || {}),
        encryptedCardNum, cardHolder, cardLast4, cardBrand, cardExpMonth, cardExpYear, encryptedCardCvv,
        id, companyId
      ]
    );

    await conn.commit();
    cleanupUnusedImages().catch(e => console.error('[Cleanup] Background error:', e));

    await auditService.createAuditLog(req, 'Updated Booking', {
      crmId: existingRow.crm_id,
      previousStatus: existingRow.status,
      newStatus: finalStatus,
      airlineName: finalAirlineName
    }, id);

    res.json({ success: true, id });
  } catch (e: any) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

export const deleteBooking = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';
    const { id } = req.params;

    const result = await bookingService.deleteBooking(id, companyId, req);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const getAuthProofData = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';

    const [bookings]: any = await db.query('SELECT * FROM bookings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = bookings[0];
    const [emails]: any = await db.query('SELECT recipient, subject, type, sent_by, created_at FROM sent_emails WHERE booking_id = ? AND company_id = ? ORDER BY created_at ASC', [id, companyId]);

    res.json({ booking, emails });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const getAuthVerificationPdf = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const user = (req as any).user;
    const companyId = user?.company_id || user?.companyId || 'legacy-tenant-1';

    const [bookingRows]: any = await db.execute('SELECT * FROM bookings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (bookingRows.length === 0) return res.status(404).json({ error: 'Booking not found' });

    const booking = bookingRows[0];
    let details: any = {};
    if (booking.details) {
      try { details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details; } catch (e) {}
    }

    const authMetadata = details.authMetadata || {};
    const [emailRows]: any = await db.query('SELECT * FROM sent_emails WHERE booking_id = ? OR crm_id = ? ORDER BY created_at ASC', [id, booking.crm_id]);
    const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [booking.company_id]);
    let branding = {};
    if (settingsRows.length > 0) {
      branding = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
    }

    let passengers = [];
    if (booking.passenger_names) {
      try {
        passengers = typeof booking.passenger_names === 'string' ? JSON.parse(booking.passenger_names) : booking.passenger_names;
        if (!Array.isArray(passengers)) passengers = [];
      } catch (e) {}
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Auth_Verification_${booking.crm_id}.pdf`);

    await generateAuthVerificationPdf(res, { ...booking, authMetadata }, passengers, emailRows, branding);
  } catch (e: any) {
    console.error('PDF Generation Error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
};
