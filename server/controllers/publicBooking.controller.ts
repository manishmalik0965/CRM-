import { Request, Response } from 'express';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { transformBooking } from '../services/booking.service';
import nodemailer from 'nodemailer';

function createSmtpTransporter(profile: any) {
  if (!profile || !profile.email || !profile.appPassword) {
    throw new Error("Invalid SMTP profile or missing credentials");
  }
  const cleanPassword = profile.appPassword.replace(/\s+/g, '');
  const email = profile.email.trim();
  const host = (profile.host || '').trim().toLowerCase();

  if (host.includes('gmail.com') || email.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: email, pass: cleanPassword }
    });
  }

  const port = profile.port ? parseInt(profile.port) : 465;
  return nodemailer.createTransport({
    host: profile.host || 'smtp.gmail.com',
    port: port,
    secure: port === 587 ? false : true,
    auth: { user: email, pass: cleanPassword },
    tls: { rejectUnauthorized: false }
  });
}

export const publicAuthorize = async (req: Request, res: Response) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const id = req.params.id;

    const [existing]: any = await conn.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }

    const existingRow = existing[0];
    const { signatureData, remarks, authMetadata } = req.body;

    const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
    const signatureString = `AUTH-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;

    let existingDetails: any = {};
    if (existingRow.details) {
      try {
        existingDetails = typeof existingRow.details === 'string' ? JSON.parse(existingRow.details) : existingRow.details;
      } catch (e) {}
    }

    const updatedDetails = {
      ...existingDetails,
      signatureData: signatureData || existingDetails.signatureData,
      remarks: remarks || existingDetails.remarks,
      authMetadata: {
        ...(authMetadata || {}),
        browserIp: ipAddress,
        browserUserAgent: userAgent,
        signatureString: signatureString,
        authorizedAt: new Date().toISOString()
      },
      signature_data: signatureData || existingDetails.signature_data
    };

    await conn.execute(
      'UPDATE bookings SET status = ?, details = ? WHERE id = ?',
      ['authorized', JSON.stringify(updatedDetails), id]
    );

    await conn.commit();

    try {
      const sentFromEmail = updatedDetails.sentFromEmail || updatedDetails.fromEmail;
      if (sentFromEmail) {
        const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [existingRow.company_id]);
        if (settingsRows.length > 0) {
          const settings = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
          const profile = settings.smtpProfiles?.find((p: any) => p.email.toLowerCase() === sentFromEmail.toLowerCase());
          if (profile) {
            const transporter = createSmtpTransporter(profile);
            const bccEmail = settings.bccEmail || process.env.BCC_EMAIL;

            await transporter.sendMail({
              from: `"${settings.organizationName || 'CRM SYSTEM'}" <${profile.email}>`,
              to: profile.email,
              bcc: bccEmail || undefined,
              subject: `AUTHORIZATION REVERT: ${existingRow.airline_name} - ${existingRow.crm_id}`,
              html: `<div style="font-family: sans-serif; padding: 24px;"><h2>Authorization Revert</h2><p>Booking ${existingRow.crm_id} authorized.</p></div>`
            });
          }
        }
      }
    } catch (mailErr) {
      console.error('[Authorization Revert] Failed to send notification:', mailErr);
    }

    res.json({ success: true, id });
  } catch (e: any) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

export const publicAuthorizeDirect = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    let [rows]: any = await db.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (rows.length === 0) {
      [rows] = await db.query('SELECT * FROM bookings WHERE crm_id = ?', [id]);
    }

    if (rows.length === 0) {
      if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Booking Not Found' });
      }
      return res.status(404).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Booking Not Found</h1>
          </body>
        </html>
      `);
    }

    const booking = rows[0];
    const tb = transformBooking(booking);

    let existingDetails: any = {};
    if (booking.details) {
      try { existingDetails = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details; } catch (e) {}
    }

    const rawCardHolder = (booking.card_holder || '').trim();
    const rawDetailsCardHolder = (existingDetails.cardHolder || '').trim();
    const firstPaxName = (tb.passengerNames?.[0]?.name || tb.passengerNames?.[0] || '').trim();
    const nameToSign = rawCardHolder || rawDetailsCardHolder || firstPaxName || "Customer Consent";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200" viewBox="0 0 500 200"><rect width="100%" height="100%" fill="white"/><text x="250" y="100" font-family="cursive, sans-serif" font-size="44" font-style="italic" fill="#0f172a" text-anchor="middle" dominant-baseline="middle">${nameToSign}</text><path d="M 50 140 Q 250 160 450 140" fill="none" stroke="#0f172a" stroke-width="2"/></svg>`;
    const sigData = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    const clientIp = (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : '') || req.ip || 'Unknown';
    const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
    let signatureString: string | null = null;

    const postAuthStatuses = ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'];
    let alreadyAuthorized = postAuthStatuses.includes(booking.status);

    if (!alreadyAuthorized) {
      const newRemarkText = `[Auto-Authorization Server] ${new Date().toLocaleString()}:\nBooking Authorized Automatically (Direct Email Approve Click).\nProcessed fully in backend.\nCustomer IP: ${clientIp}`;
      const finalRemarks = booking.remarks ? booking.remarks + '\n\n' + newRemarkText : (existingDetails.remarks ? existingDetails.remarks + '\n\n' + newRemarkText : newRemarkText);

      signatureString = `AUTH-DIR-${uuidv4().split('-')[0].toUpperCase()}-${Date.now()}`;

      const updatedDetails = {
        ...existingDetails,
        signatureData: sigData,
        remarks: finalRemarks,
        authMetadata: {
          ip: clientIp,
          userAgent: userAgent,
          action: 'PAYMENT_AUTH_ACCEPTED_DIRECT',
          consent: 'I agree to the charges and terms stated via direct link.',
          platform: req.headers['sec-ch-ua-platform'] || 'Unknown',
          language: req.headers['accept-language'] || 'Unknown',
          signatureString: signatureString,
          authorizedAt: new Date().toISOString()
        },
        signature_data: sigData
      };

      await db.query('UPDATE bookings SET status = ?, details = ? WHERE id = ?', ['authorized', JSON.stringify(updatedDetails), booking.id]);
    }

    if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Booking successfully authorized.' });
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #0f172a;">
          <div style="background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <div style="font-size: 48px; margin-bottom: 20px;">✓</div>
            <h1 style="font-weight: 800; font-size: 24px; margin-bottom: 10px;">Payment Authorized</h1>
            <p style="color: #64748b; line-height: 1.5;">Thank you! Your authorization for booking reference <strong>${booking.crm_id}</strong> has been processed successfully.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
