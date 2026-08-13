import db from '../database/connection';

export class BookingRepository {
  async findBookings(companyId: string, query?: string, limit: number = 100, isGlobalAdmin: boolean = false) {
    let sql = '';
    let params: any[] = [];

    if (isGlobalAdmin) {
      if (query) {
        sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.crm_id LIKE ? OR b.passenger_names LIKE ? OR b.details LIKE ? ORDER BY b.created_at DESC LIMIT ?';
        params = [`%${query}%`, `%${query}%`, `%${query}%`, limit];
      } else {
        sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id ORDER BY b.created_at DESC LIMIT ?';
        params = [limit];
      }
    } else {
      if (query) {
        sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.company_id = ? AND (b.crm_id LIKE ? OR b.passenger_names LIKE ? OR b.details LIKE ?) ORDER BY b.created_at DESC LIMIT ?';
        params = [companyId, `%${query}%`, `%${query}%`, `%${query}%`, limit];
      } else {
        sql = 'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.company_id = ? ORDER BY b.created_at DESC LIMIT ?';
        params = [companyId, limit];
      }
    }

    const [rows]: any = await db.execute(sql, params);
    return rows;
  }

  async findRecentUpdates(companyId: string, isGlobalAdmin: boolean = false) {
    let sql = '';
    let params: any[] = [];

    if (isGlobalAdmin) {
      sql = 'SELECT b.id, b.crm_id, b.status, b.updated_at, b.passenger_names, b.details FROM bookings b ORDER BY b.updated_at DESC LIMIT 10';
    } else {
      sql = 'SELECT b.id, b.crm_id, b.status, b.updated_at, b.passenger_names, b.details FROM bookings b WHERE b.company_id = ? ORDER BY b.updated_at DESC LIMIT 10';
      params = [companyId];
    }

    const [rows]: any = await db.execute(sql, params);
    return rows;
  }

  async findBookingById(id: string) {
    const [rows]: any = await db.execute(
      'SELECT b.*, u.display_name AS creator_name, u.email AS creator_email FROM bookings b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ? OR b.crm_id = ?',
      [id, id]
    );
    return rows[0] || null;
  }

  async createBooking(booking: {
    id: string;
    companyId: string;
    crmId: string;
    passengerNames: string;
    airlineName: string;
    totalAmount: number;
    currency: string;
    status: string;
    cardNumber?: string;
    cardHolderName?: string;
    cardLast4?: string;
    cardBrand?: string;
    createdBy: string;
    detailsJson: string;
  }) {
    await db.execute(
      `INSERT INTO bookings (
        id, company_id, crm_id, passenger_names, airline_name, total_amount, currency, status,
        card_number, card_holder_name, card_last_4, card_brand, created_by, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        booking.id,
        booking.companyId,
        booking.crmId,
        booking.passengerNames,
        booking.airlineName,
        booking.totalAmount,
        booking.currency,
        booking.status,
        booking.cardNumber || null,
        booking.cardHolderName || null,
        booking.cardLast4 || null,
        booking.cardBrand || null,
        booking.createdBy,
        booking.detailsJson
      ]
    );
  }

  async updateBooking(id: string, updateData: {
    passengerNames?: string;
    airlineName?: string;
    totalAmount?: number;
    currency?: string;
    status?: string;
    cardNumber?: string;
    cardHolderName?: string;
    cardLast4?: string;
    cardBrand?: string;
    detailsJson?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (updateData.passengerNames !== undefined) { fields.push('passenger_names = ?'); params.push(updateData.passengerNames); }
    if (updateData.airlineName !== undefined) { fields.push('airline_name = ?'); params.push(updateData.airlineName); }
    if (updateData.totalAmount !== undefined) { fields.push('total_amount = ?'); params.push(updateData.totalAmount); }
    if (updateData.currency !== undefined) { fields.push('currency = ?'); params.push(updateData.currency); }
    if (updateData.status !== undefined) { fields.push('status = ?'); params.push(updateData.status); }
    if (updateData.cardNumber !== undefined) { fields.push('card_number = ?'); params.push(updateData.cardNumber); }
    if (updateData.cardHolderName !== undefined) { fields.push('card_holder_name = ?'); params.push(updateData.cardHolderName); }
    if (updateData.cardLast4 !== undefined) { fields.push('card_last_4 = ?'); params.push(updateData.cardLast4); }
    if (updateData.cardBrand !== undefined) { fields.push('card_brand = ?'); params.push(updateData.cardBrand); }
    if (updateData.detailsJson !== undefined) { fields.push('details = ?'); params.push(updateData.detailsJson); }

    fields.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`;
    await db.execute(sql, params);
  }

  async deleteBooking(id: string) {
    await db.execute('DELETE FROM bookings WHERE id = ?', [id]);
  }
}

export const bookingRepository = new BookingRepository();
