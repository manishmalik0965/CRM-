import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from 'uuid';
import { processBase64Images } from "./server/utils/imageProcessor.ts";
import { generateAuthEmail, generateConfirmationEmail } from "./src/lib/emailTemplates.ts";
import authRoutes from './server/routes/auth.routes';
import apiRoutes from './server/routes/api.routes';
import db from './server/database/connection';

export function createSmtpTransporter(profile: any) {
  let activeProfile = { ...profile };

  // Fallback to environment variables if database configuration is missing or empty
  if (!activeProfile || !activeProfile.email || !activeProfile.appPassword) {
    if (process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD) {
      console.log(`[SMTP] Profile missing or incomplete. Falling back to environment configurations: ${process.env.SMTP_EMAIL}`);
      activeProfile = {
        email: process.env.SMTP_EMAIL,
        appPassword: process.env.SMTP_APP_PASSWORD,
        host: 'smtp.gmail.com',
        port: 465,
        label: 'SkyWay Travel Group Alerts'
      };
    } else {
      throw new Error("Invalid SMTP profile or missing credentials. Please configure SMTP in Settings or define SMTP_EMAIL & SMTP_APP_PASSWORD environment variables.");
    }
  }

  const cleanPassword = activeProfile.appPassword.replace(/\s+/g, '');
  const email = activeProfile.email.trim();
  const host = (activeProfile.host || '').trim().toLowerCase();

  // If Gmail or Google host, use Nodemailer's highly optimized built-in Gmail service wrapper
  if (host.includes('gmail.com') || email.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: cleanPassword
      }
    });
  }

  // Generic SMTP transporter
  const port = activeProfile.port ? parseInt(activeProfile.port) : 465;
  return nodemailer.createTransport({
    host: activeProfile.host || 'smtp.gmail.com',
    port: port,
    secure: port === 587 ? false : true,
    auth: {
      user: email,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function processAttachmentsAndRichText(
  attachmentsList: any[] | undefined,
  packageRichText: string | undefined,
  snapshotBase64: string | undefined,
  bookingId: string,
  req: express.Request
) {
  let finalAttachments = attachmentsList ? [...attachmentsList] : [];
  let processedRichText = packageRichText || '';
  let snapshotUrl = undefined;

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const baseUrl = `${proto}://${req.get('host')}`;

  // 1. Process base64 embedded images in packageRichText
  if (processedRichText) {
    try {
      processedRichText = await processBase64Images(processedRichText, baseUrl);
    } catch (e) {
      console.warn("[processAttachmentsAndRichText] Base64 image cache warning:", e);
    }

    // Convert any remaining base64 images in packageRichText into CID attachments for maximum email client compatibility
    const base64ImgRegex = /src=["'](data:image\/([a-zA-Z0-9+-]+);base64,([^"']+))["']/gi;
    let match;
    let imgCount = 0;
    while ((match = base64ImgRegex.exec(processedRichText)) !== null) {
      const fullDataUrl = match[1];
      const mimeType = match[2];
      const base64Str = match[3];
      const cidName = `rich_img_${imgCount}_${Date.now()}`;
      const ext = mimeType.toLowerCase().replace('jpeg', 'jpg').split('+')[0] || 'png';

      try {
        const imgBuffer = Buffer.from(base64Str, 'base64');
        finalAttachments.push({
          filename: `embedded_image_${imgCount}.${ext}`,
          content: imgBuffer,
          cid: cidName,
          contentDisposition: 'inline'
        });

        processedRichText = processedRichText.replace(fullDataUrl, `cid:${cidName}`);
        imgCount++;
      } catch (err) {
        console.error(`[processAttachmentsAndRichText] Error embedding image ${imgCount}:`, err);
      }
    }

    // Ensure relative image paths resolve to absolute URLs
    processedRichText = processedRichText.replace(/src=["']\/(?!\/)/g, `src="${baseUrl}/`);
  }

  // 2. Process Booking Snapshot Image (snapshotBase64)
  if (snapshotBase64 && typeof snapshotBase64 === 'string' && snapshotBase64.trim().length > 0) {
    try {
      const cleanBase64 = snapshotBase64.replace(/^data:image\/[a-zA-Z0-9+-]+;base64,/, '').trim();
      if (cleanBase64.length > 0) {
        const imgBuffer = Buffer.from(cleanBase64, 'base64');
        const snapshotCid = `bookingsnapshot`;

        // Check if snapshotCid is already in finalAttachments
        const existingIdx = finalAttachments.findIndex((a: any) => a.cid === snapshotCid);
        const attachmentObj = {
          filename: `Booking_Snapshot_${bookingId || 'Overview'}.png`,
          content: imgBuffer,
          cid: snapshotCid,
          contentDisposition: 'inline'
        };

        if (existingIdx >= 0) {
          finalAttachments[existingIdx] = attachmentObj;
        } else {
          finalAttachments.push(attachmentObj);
        }

        snapshotUrl = `cid:${snapshotCid}`;
      }
    } catch (e) {
      console.error("[processAttachmentsAndRichText] Failed to process snapshotBase64:", e);
    }
  }

  return { finalAttachments, processedRichText, snapshotUrl };
}

async function persistSenderInfo(bookingId: string | undefined, fromEmail: string | undefined, fromLabel: string | undefined) {
  if (!bookingId || !fromEmail) return;
  try {
    const [rows]: any = await db.query('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (rows.length > 0) {
      const bookingRow = rows[0];
      let existingDetails: any = {};
      if (bookingRow.details) {
        try {
          existingDetails = typeof bookingRow.details === 'string' ? JSON.parse(bookingRow.details) : bookingRow.details;
        } catch (e) {}
      }
      const updatedDetails = {
        ...existingDetails,
        fromEmail: fromEmail || existingDetails.fromEmail || '',
        fromLabel: fromLabel || existingDetails.fromLabel || '',
        sentFromEmail: fromEmail || existingDetails.sentFromEmail || '',
        sentFromLabel: fromLabel || existingDetails.sentFromLabel || '',
      };
      await db.query('UPDATE bookings SET details = ? WHERE id = ?', [JSON.stringify(updatedDetails), bookingId]);
      console.log(`[persistSenderInfo] Saved sentFromEmail (${fromEmail}) to booking ${bookingId}`);
    }
  } catch (dbErr: any) {
    console.error('[persistSenderInfo] DB update failed:', dbErr.message);
  }
}

function formatIcsDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function parseToIcsDate(dateStr: string | undefined, defaultHour: number): string {
  if (!dateStr) {
    const d = new Date();
    d.setUTCHours(defaultHour, 0, 0, 0);
    return formatIcsDate(d);
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const isDateOnly = !dateStr.includes('T') && !dateStr.includes(':');
      if (isDateOnly) {
        d.setUTCHours(defaultHour, 0, 0, 0);
      }
      return formatIcsDate(d);
    }
  } catch (e) {}
  const d = new Date();
  d.setUTCHours(defaultHour, 0, 0, 0);
  return formatIcsDate(d);
}

function generateIcsCalendarInvite(details: any): string {
  const { bookingId, airlineName, origin, destination, pnr, passengerName, cabinClass, tripType, totalAmount, currency, departureDate, arrivalDate } = details;
  
  const formattedDtStamp = formatIcsDate(new Date());
  const formattedDeparture = parseToIcsDate(departureDate, 10);
  
  let formattedArrival;
  if (arrivalDate) {
    formattedArrival = parseToIcsDate(arrivalDate, 13);
  } else {
    try {
      const depDateObj = new Date(departureDate || new Date());
      if (isNaN(depDateObj.getTime())) {
        const d = new Date();
        d.setUTCHours(13, 0, 0, 0);
        formattedArrival = formatIcsDate(d);
      } else {
        const isDateOnly = departureDate && !departureDate.includes('T') && !departureDate.includes(':');
        if (isDateOnly) {
          depDateObj.setUTCHours(10, 0, 0, 0);
        }
        depDateObj.setUTCHours(depDateObj.getUTCHours() + 3);
        formattedArrival = formatIcsDate(depDateObj);
      }
    } catch(e) {
      const d = new Date();
      d.setUTCHours(13, 0, 0, 0);
      formattedArrival = formatIcsDate(d);
    }
  }

  const airline = airlineName || 'Airline';
  const displayOrigin = origin || 'Origin';
  const displayDest = destination || 'Destination';
  const pnrVal = pnr || 'PENDING';
  const nameVal = passengerName || 'Valued Customer';
  
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SKY CRM//Travel Agency//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:booking-${bookingId || Date.now()}@sky-crm.com`,
    `DTSTAMP:${formattedDtStamp}`,
    `DTSTART:${formattedDeparture}`,
    `DTEND:${formattedArrival}`,
    `SUMMARY:Flight Booking Reminder: ${airline} ${displayOrigin} -> ${displayDest}`,
    `DESCRIPTION:Your upcoming flight booking is scheduled.\\n\\nAirline: ${airline}\\nRoute: ${displayOrigin} to ${displayDest}\\nPNR / Record Locator: ${pnrVal}\\nPassenger: ${nameVal}\\nCabin Class: ${cabinClass || 'Economy'}\\nTrip Type: ${tripType || 'One-way'}\\nTotal Paid: ${currency || 'USD'} ${totalAmount || 0}\\n\\nThank you for booking with us.`,
    `LOCATION:${displayOrigin} to ${displayDest}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Flight Booking Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

let lastSeenAppUrl = '';

async function autoCompletePassedBookings() {
  console.log('[Auto-Complete Scheduler] Running periodic past flight checks...');
  try {
    const [rows]: any = await db.query(`
      SELECT b.*, u.id AS creator_user_id
      FROM bookings b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.status != 'Completed' AND b.status != 'completed'
    `);

    if (!rows || rows.length === 0) {
      console.log('[Auto-Complete Scheduler] No active bookings found to auto-complete.');
      return;
    }

    for (const row of rows) {
      let details: any = {};
      if (row.details) {
        try {
          details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
        } catch (e) {
          console.error(`[Auto-Complete Scheduler] Failed to parse details JSON for booking ${row.id}:`, e);
          continue;
        }
      }

      // Check departure/flight date
      const depDateStr = details.departureDate || details.departure_date;
      if (!depDateStr) {
        continue;
      }

      const depDate = new Date(depDateStr);
      if (isNaN(depDate.getTime())) {
        continue;
      }

      const timeSinceFlightMs = Date.now() - depDate.getTime();
      const timeSinceFlightHours = timeSinceFlightMs / (1000 * 60 * 60);

      // If flight date has passed by 24 hours
      if (timeSinceFlightHours >= 24) {
        console.log(`[Auto-Complete Scheduler] Booking ${row.id} (CRM ID: ${row.crm_id}) flight was on ${depDate.toLocaleString()} (${timeSinceFlightHours.toFixed(1)} hours ago). Auto-completing.`);
        
        // Update database
        await db.query("UPDATE bookings SET status = 'Completed' WHERE id = ?", [row.id]);
        
        // Log in activity_logs
        try {
          const logId = uuidv4();
          let userId = row.creator_user_id;
          if (!userId) {
            const [companyUser]: any = await db.query('SELECT id FROM users WHERE company_id = ? LIMIT 1', [row.company_id || 'legacy-tenant-1']);
            if (companyUser.length > 0) {
              userId = companyUser[0].id;
            } else {
              const [anyUser]: any = await db.query('SELECT id FROM users LIMIT 1');
              if (anyUser.length > 0) {
                userId = anyUser[0].id;
              }
            }
          }
          
          if (userId) {
            const logDetailsJson = JSON.stringify({ 
              bookingId: row.id,
              crmId: row.crm_id,
              reason: 'Automatic auto-complete after 24h past flight departure date',
              preciseTimestamp: new Date().toISOString()
            });
            
            await db.query(
              'INSERT INTO activity_logs (id, company_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
              [logId, row.company_id || 'legacy-tenant-1', userId, 'Auto-Completed Booking', logDetailsJson, 'System Scheduler']
            );
          }
        } catch (logErr: any) {
          console.error('[Auto-Complete Scheduler] Failed to insert activity log:', logErr.message);
        }
      }
    }
  } catch (err: any) {
    console.error('[Auto-Complete Scheduler] Error updating passed bookings:', err.message);
  }
}

async function checkAndAlertUpcomingBookings() {
  console.log('[Upcoming Flight Alert Scheduler] Running periodic upcoming flight date checks...');
  try {
    const [rows]: any = await db.query(`
      SELECT b.*, u.email AS agent_email, u.display_name AS agent_name, c.name AS company_name, c.domain AS company_domain
      FROM bookings b
      LEFT JOIN users u ON b.created_by = u.id
      LEFT JOIN companies c ON b.company_id = c.id
      ORDER BY b.created_at DESC
    `);

    if (!rows || rows.length === 0) {
      console.log('[Upcoming Flight Alert Scheduler] No bookings found.');
      return;
    }

    for (const row of rows) {
      let details: any = {};
      if (row.details) {
        try {
          details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
        } catch (e) {
          console.error(`[Upcoming Flight Alert Scheduler] Failed to parse details JSON for booking ${row.id}:`, e);
          continue;
        }
      }

      // If already notified, skip
      if (details.agentNotified72h) {
        continue;
      }

      // Check departure/flight date
      const depDateStr = details.departureDate || details.departure_date;
      if (!depDateStr) {
        continue;
      }

      const depDate = new Date(depDateStr);
      if (isNaN(depDate.getTime())) {
        continue;
      }

      const timeUntilFlightMs = depDate.getTime() - Date.now();
      const timeUntilFlightHours = timeUntilFlightMs / (1000 * 60 * 60);

      // Check if flight is within 72 hours and in the future
      if (timeUntilFlightHours > 0 && timeUntilFlightHours <= 72) {
        console.log(`[Upcoming Flight Alert Scheduler] Found booking ${row.id} departing in ${timeUntilFlightHours.toFixed(1)} hours.`);

        // Find SMTP profile to send alert
        let smtpProfile: any = null;
        const [settingsRows]: any = await db.query('SELECT settings_json FROM settings WHERE company_id = ?', [row.company_id]);
        if (settingsRows.length > 0) {
          try {
            const settingsObj = typeof settingsRows[0].settings_json === 'string' ? JSON.parse(settingsRows[0].settings_json) : settingsRows[0].settings_json;
            if (Array.isArray(settingsObj.smtpProfiles) && settingsObj.smtpProfiles.length > 0) {
              smtpProfile = settingsObj.smtpProfiles.find((p: any) => p.email && p.appPassword) || settingsObj.smtpProfiles[0];
            }
          } catch (e) {}
        }

        // Fallback to legacy-tenant-1
        if (!smtpProfile || !smtpProfile.appPassword) {
          const [fallbackRows]: any = await db.query("SELECT settings_json FROM settings WHERE company_id = 'legacy-tenant-1'");
          if (fallbackRows.length > 0) {
            try {
              const settingsObj = typeof fallbackRows[0].settings_json === 'string' ? JSON.parse(fallbackRows[0].settings_json) : fallbackRows[0].settings_json;
              if (Array.isArray(settingsObj.smtpProfiles) && settingsObj.smtpProfiles.length > 0) {
                smtpProfile = settingsObj.smtpProfiles.find((p: any) => p.email && p.appPassword) || settingsObj.smtpProfiles[0];
              }
            } catch (e) {}
          }
        }

        if (!smtpProfile || !smtpProfile.appPassword) {
          console.warn(`[Upcoming Flight Alert Scheduler] Cannot send alert for booking ${row.id}: No SMTP configuration found.`);
          continue;
        }

        // Gather recipient emails (notify the agent who created, or default)
        const recipients = new Set<string>();
        if (row.agent_email) recipients.add(row.agent_email);
        if (details.agentEmail) recipients.add(details.agentEmail);
        if (recipients.size === 0) {
          recipients.add('manishmalik0965@gmail.com');
        }

        // Parse passenger names
        let passengerNamesList: string[] = [];
        if (row.passenger_names) {
          try {
            const parsed = typeof row.passenger_names === 'string' ? JSON.parse(row.passenger_names) : row.passenger_names;
            passengerNamesList = Array.isArray(parsed) ? parsed.map((p: any) => typeof p === 'string' ? p : p.name || '') : [];
          } catch (e) {}
        }
        if (passengerNamesList.length === 0 && details.passengers) {
          passengerNamesList = details.passengers.map((p: any) => p.name || '');
        }
        if (passengerNamesList.length === 0) {
          passengerNamesList = [row.passenger_name || details.passengerName || 'Valued Customer'];
        }

        // Construct direct link
        const baseAppUrl = lastSeenAppUrl || `http://localhost:3000`;
        const viewBookingUrl = `${baseAppUrl}/bookings/edit/${row.id}`;

        const subject = `⚠️ UPCOMING FLIGHT ALERT: CRM ID ${(row.crm_id || '').toUpperCase()} - DEPARTS SOON`;
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); background-color: #ffffff;">
            <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px 24px; text-align: center; color: white;">
              <div style="display: inline-block; background-color: #ef4444; color: white; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; padding: 6px 12px; border-radius: 9999px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.2);">
                ⚠️ Urgent Departure Alert
              </div>
              <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.25;">Flight Departing in Under 72 Hours</h2>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #94a3b8; font-weight: 500;">CRM ID: ${(row.crm_id || '').toUpperCase()} | Tenant: ${row.company_name || 'SkyWay Group'}</p>
            </div>
            <div style="padding: 32px 24px;">
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0; margin-bottom: 24px;">
                Hello,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                One of your assigned client bookings has an upcoming flight scheduled to depart in less than 72 hours. Please find the details below and ensure all final confirmations, check-ins, or requests are completed:
              </p>
              
              <div style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #f1f5f9; padding: 20px; margin-bottom: 32px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; width: 35%; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">Carrier Name</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${(row.airline_name || '').toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">PNR / Locator</td>
                    <td style="padding: 8px 0; color: #2563eb; font-weight: 700; letter-spacing: 0.05em;">${(details.pnr || 'PENDING').toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">Flight Route</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${(details.origin || 'N/A').toUpperCase()} ➔ ${(details.destination || 'N/A').toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">Departure Time</td>
                    <td style="padding: 8px 0; color: #e11d48; font-weight: 700;">${new Date(depDateStr).toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">Passenger(s)</td>
                    <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${passengerNamesList.join(', ')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px;">Status</td>
                    <td style="padding: 8px 0;">
                      <span style="background-color: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">${(row.status || 'pending').toUpperCase()}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${viewBookingUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 13px; display: inline-block; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s ease;">
                  Open & View Booking
                </a>
              </div>

              <div style="margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 24px; text-align: center;">
                <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 0;">
                  This is an automatic notification dispatched by your CRM service.<br />
                  To manage SMTP connections or details, please visit your account's Branding settings.
                </p>
              </div>
            </div>
          </div>
        `;

        // Send email
        const transporter = createSmtpTransporter(smtpProfile);

        for (const recipient of recipients) {
          try {
            await transporter.sendMail({
              from: `"${row.company_name || smtpProfile.label || 'Secure CRM Alerts'}" <${smtpProfile.email}>`,
              to: recipient,
              subject: subject,
              html: html
            });
            console.log(`[Upcoming Flight Alert Scheduler] Alert email sent successfully to ${recipient} for booking ${row.id}`);
          } catch (sendErr: any) {
            console.error(`[Upcoming Flight Alert Scheduler] Failed to send email to ${recipient}:`, sendErr.message);
          }
        }

        // Mark as notified in database
        const updatedDetails = {
          ...details,
          agentNotified72h: true,
          agentNotified72hAt: new Date().toISOString()
        };

        await db.query('UPDATE bookings SET details = ? WHERE id = ?', [JSON.stringify(updatedDetails), row.id]);
        console.log(`[Upcoming Flight Alert Scheduler] Marked booking ${row.id} as notified.`);
      }
    }
  } catch (err: any) {
    console.error('[Upcoming Flight Alert Scheduler] Error scanning bookings:', err.message);
  }
}

async function triggerAirportSync() {
  console.log("[Airport Seeder] Seeding small reliable local airport list as requested...");
  const smallAirportList = [
    { iata: 'AGS', name: 'Augusta Regional Airport', city: 'Augusta', state: 'GA', country: 'USA' },
    { iata: 'LHR', name: 'London Heathrow Airport', city: 'London', state: 'ENG', country: 'UK' },
    { iata: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', country: 'USA' },
    { iata: 'DXB', name: 'Dubai International Airport', city: 'Dubai', state: 'DXB', country: 'UAE' },
    { iata: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', state: 'IDF', country: 'France' },
    { iata: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', state: 'SIN', country: 'Singapore' },
    { iata: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', state: 'NH', country: 'Netherlands' },
    { iata: 'ORD', name: 'O\'Hare International Airport', city: 'Chicago', state: 'IL', country: 'USA' },
    { iata: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', country: 'USA' },
    { iata: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', country: 'USA' }
  ];
  for (const item of smallAirportList) {
    await db.query(`INSERT INTO airports (iata, name, city, state, country) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`, [item.iata, item.name, item.city, item.state, item.country]);
  }
  return;
}

async function seedAirportsIfEmpty() {
  try {
    const [countRows]: any = await db.query("SELECT COUNT(*) as count FROM airports");
    if (countRows[0].count > 0) {
      console.log(`[Airport Seeder] Airports database table already has ${countRows[0].count} entries. Skipping automatic seeding.`);
      return;
    }
    console.log("[Airport Seeder] Airports table is empty. Initiating background seeding from global airports database...");
    
    triggerAirportSync().catch(err => {
      console.error("[Airport Seeder background error]:", err.message);
    });
  } catch (err: any) {
    console.error("[Airport Seeder] Pre-check failed:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Custom CORS details to support external client static site hosting
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // Capture the application's hosting URL
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    if (host && !host.includes('127.0.0.1') && !host.includes('localhost')) {
      lastSeenAppUrl = `${proto}://${host}`;
    }
    next();
  });

  // Global middleware to normalize branding logoUrl relative path into absolute URL for email template delivery
  app.use((req, res, next) => {
    if (req.body && req.body.branding) {
      const branding = req.body.branding;
      if (branding && typeof branding.logoUrl === 'string' && branding.logoUrl.startsWith('/')) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
        branding.logoUrl = `${protocol}://${host}${branding.logoUrl}`;
      }
    }
    next();
  });

  // Image Upload/Proxy Route
  app.post("/api/upload-snapshot", async (req, res) => {
    try {
      const { base64 } = req.body;
      if (!base64) return res.status(400).json({ error: "No image data" });

      const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ error: "Invalid base64 string" });
      }

      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Save to MySQL database permanently
      await db.query(
        'INSERT INTO uploaded_files (id, content_type, buffer) VALUES (?, ?, ?)',
        [id, contentType, buffer]
      );

      // Generate a URL that points back to this server
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
      const isCloudRun = host.includes('.run.app') || host.includes('.asia-southeast1.') || host.includes('.google.com') || req.secure;
      const finalProtocol = isCloudRun ? 'https' : protocol;
      const relativeUrl = `/api/v/snapshot/${id}.php`;
      const imageUrl = `${finalProtocol}://${host}${relativeUrl}`;

      res.json({ url: imageUrl, relativeUrl, id });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Dynamic Image Server (Optimized & MySQL Persistent)
  app.get("/api/v/snapshot/:id.php", async (req, res) => {
    try {
      const id = req.params.id;
      const [rows]: any = await db.query('SELECT content_type, buffer FROM uploaded_files WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).send("Not found");
      }

      const imageData = rows[0];
      res.setHeader('Content-Type', imageData.content_type);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(imageData.buffer);
    } catch (e: any) {
      console.error("Error serving image:", e);
      res.status(500).send("Internal server error");
    }
  });

  // Lightweight in-memory database of major international airports to prevent Out-Of-Memory crashes on hosting
  const MAJOR_AIRPORTS = [
    // North America
    { iata: "JFK", name: "John F. Kennedy Intl, New York, US" },
    { iata: "LGA", name: "LaGuardia, New York, US" },
    { iata: "EWR", name: "Newark Liberty Intl, New Jersey, US" },
    { iata: "LAX", name: "Los Angeles Intl, California, US" },
    { iata: "SFO", name: "San Francisco Intl, California, US" },
    { iata: "ORD", name: "O'Hare Intl, Chicago, US" },
    { iata: "MIA", name: "Miami Intl, Florida, US" },
    { iata: "DFW", name: "Dallas/Fort Worth Intl, Texas, US" },
    { iata: "ATL", name: "Hartsfield-Jackson Atlanta Intl, Georgia, US" },
    { iata: "DEN", name: "Denver Intl, Colorado, US" },
    { iata: "SEA", name: "Seattle-Tacoma Intl, Washington, US" },
    { iata: "BOS", name: "Logan Intl, Boston, US" },
    { iata: "LAS", name: "Harry Reid Intl, Las Vegas, US" },
    { iata: "MCO", name: "Orlando Intl, Florida, US" },
    { iata: "IAH", name: "George Bush Intercontinental, Houston, US" },
    { iata: "PHX", name: "Phoenix Sky Harbor Intl, Arizona, US" },
    { iata: "CLT", name: "Charlotte Douglas Intl, North Carolina, US" },
    { iata: "MSP", name: "Minneapolis-Saint Paul Intl, Minnesota, US" },
    { iata: "DTW", name: "Detroit Metropolitan, Michigan, US" },
    { iata: "FLL", name: "Fort Lauderdale-Hollywood Intl, Florida, US" },
    { iata: "SAN", name: "San Diego Intl, California, US" },
    { iata: "TPA", name: "Tampa Intl, Florida, US" },
    { iata: "YYZ", name: "Pearson Intl, Toronto, Canada" },
    { iata: "YVR", name: "Vancouver Intl, British Columbia, Canada" },
    { iata: "YUL", name: "Pierre Elliott Trudeau Intl, Montreal, Canada" },
    { iata: "YYC", name: "Calgary Intl, Alberta, Canada" },
    { iata: "MEX", name: "Benito Juarez Intl, Mexico City, Mexico" },
    { iata: "CUN", name: "Cancun Intl, Quintana Roo, Mexico" },

    // United Kingdom & Ireland
    { iata: "LHR", name: "Heathrow, London, UK" },
    { iata: "LGW", name: "Gatwick, London, UK" },
    { iata: "STN", name: "Stansted, London, UK" },
    { iata: "LTN", name: "Luton, London, UK" },
    { iata: "MAN", name: "Manchester, UK" },
    { iata: "EDI", name: "Edinburgh, Scotland, UK" },
    { iata: "BHX", name: "Birmingham, UK" },
    { iata: "GLA", name: "Glasgow, Scotland, UK" },
    { iata: "DUB", name: "Dublin, Ireland" },
    { iata: "SNN", name: "Shannon, Ireland" },

    // Europe
    { iata: "CDG", name: "Charles de Gaulle, Paris, France" },
    { iata: "ORY", name: "Orly, Paris, France" },
    { iata: "NCE", name: "Cote d'Azur, Nice, France" },
    { iata: "AMS", name: "Schiphol, Amsterdam, Netherlands" },
    { iata: "FRA", name: "Frankfurt, Germany" },
    { iata: "MUC", name: "Munich, Germany" },
    { iata: "BER", name: "Berlin Brandenburg, Germany" },
    { iata: "DUS", name: "Dusseldorf, Germany" },
    { iata: "HAM", name: "Hamburg, Germany" },
    { iata: "FCO", name: "Leonardo da Vinci-Fiumicino, Rome, Italy" },
    { iata: "MXP", name: "Malpensa, Milan, Italy" },
    { iata: "VCE", name: "Marco Polo, Venice, Italy" },
    { iata: "BCN", name: "El Prat, Barcelona, Spain" },
    { iata: "MAD", name: "Adolfo Suarez Barajas, Madrid, Spain" },
    { iata: "PMI", name: "Palma de Mallorca, Spain" },
    { iata: "AGP", name: "Malaga, Spain" },
    { iata: "ALC", name: "Alicante-Elche, Spain" },
    { iata: "LIS", name: "Humberto Delgado, Lisbon, Portugal" },
    { iata: "OPO", name: "Francisco Sa Carneiro, Porto, Portugal" },
    { iata: "ZRH", name: "Zurich, Switzerland" },
    { iata: "GVA", name: "Geneva, Switzerland" },
    { iata: "BRU", name: "Brussels, Belgium" },
    { iata: "VIE", name: "Vienna Intl, Austria" },
    { iata: "CPH", name: "Copenhagen, Denmark" },
    { iata: "ARN", name: "Arlanda, Stockholm, Sweden" },
    { iata: "OSL", name: "Gardermoen, Oslo, Norway" },
    { iata: "HEL", name: "Helsinki-Vantaa, Finland" },
    { iata: "ATH", name: "Eleftherios Venizelos, Athens, Greece" },
    { iata: "PRG", name: "Vaclav Havel, Prague, Czech Republic" },
    { iata: "WAW", name: "Chopin, Warsaw, Poland" },
    { iata: "BUD", name: "Liszt Ferenc Intl, Budapest, Hungary" },

    // Middle East & Africa
    { iata: "DXB", name: "Dubai Intl, United Arab Emirates" },
    { iata: "DWC", name: "Al Maktoum Intl, Dubai, United Arab Emirates" },
    { iata: "AUH", name: "Zayed Intl, Abu Dhabi, United Arab Emirates" },
    { iata: "DOH", name: "Hamad Intl, Doha, Qatar" },
    { iata: "IST", name: "Istanbul Airport, Istanbul, Turkey" },
    { iata: "SAW", name: "Sabiha Gokcen Intl, Istanbul, Turkey" },
    { iata: "ESB", name: "Esenboga, Ankara, Turkey" },
    { iata: "RUH", name: "King Khalid Intl, Riyadh, Saudi Arabia" },
    { iata: "JED", name: "King Abdulaziz Intl, Jeddah, Saudi Arabia" },
    { iata: "DMM", name: "King Fahd Intl, Dammam, Saudi Arabia" },
    { iata: "MCT", name: "Muscat Intl, Oman" },
    { iata: "KWI", name: "Kuwait Intl, Kuwait" },
    { iata: "BAH", name: "Bahrain Intl, Bahrain" },
    { iata: "CAI", name: "Cairo Intl, Egypt" },
    { iata: "HRG", name: "Hurghada Intl, Egypt" },
    { iata: "SSH", name: "Sharm El Sheikh Intl, Egypt" },
    { iata: "CMN", name: "Mohammed V Intl, Casablanca, Morocco" },
    { iata: "RAK", name: "Menara, Marrakech, Morocco" },
    { iata: "ADD", name: "Bole Intl, Addis Ababa, Ethiopia" },
    { iata: "NBO", name: "Jomo Kenyatta Intl, Nairobi, Kenya" },
    { iata: "CPT", name: "Cape Town Intl, South Africa" },
    { iata: "JNB", name: "O.R. Tambo Intl, Johannesburg, South Africa" },
    { iata: "MRU", name: "Sir Seewoosagur Ramgoolam Intl, Mauritius" },

    // South Asia
    { iata: "DEL", name: "Indira Gandhi Intl, Delhi, India" },
    { iata: "BOM", name: "Chhatrapati Shivaji Maharaj Intl, Mumbai, India" },
    { iata: "BLR", name: "Kempegowda Intl, Bengaluru, India" },
    { iata: "MAA", name: "Chennai Intl, Chennai, India" },
    { iata: "HYD", name: "Rajiv Gandhi Intl, Hyderabad, India" },
    { iata: "CCU", name: "Netaji Subhash Chandra Bose Intl, Kolkata, India" },
    { iata: "COK", name: "Cochin Intl, Kochi, India" },
    { iata: "AMD", name: "Sardar Vallabhbhai Patel Intl, Ahmedabad, India" },
    { iata: "GOI", name: "Dabolim, Goa, India" },
    { iata: "DAC", name: "Hazrat Shahjalal Intl, Dhaka, Bangladesh" },
    { iata: "CGP", name: "Shah Amanat Intl, Chittagong, Bangladesh" },
    { iata: "KHI", name: "Jinnah Intl, Karachi, Pakistan" },
    { iata: "LHE", name: "Allama Iqbal Intl, Lahore, Pakistan" },
    { iata: "ISB", name: "Islamabad Intl, Pakistan" },
    { iata: "CMB", name: "Bandaranaike Intl, Colombo, Sri Lanka" },
    { iata: "KTM", name: "Tribhuvan Intl, Kathmandu, Nepal" },
    { iata: "MLE", name: "Velana Intl, Male, Maldives" },

    // East & Southeast Asia
    { iata: "SIN", name: "Changi, Singapore" },
    { iata: "BKK", name: "Suvarnabhumi, Bangkok, Thailand" },
    { iata: "DMK", name: "Don Mueang Intl, Bangkok, Thailand" },
    { iata: "HKT", name: "Phuket Intl, Thailand" },
    { iata: "KUL", name: "Kuala Lumpur Intl, Malaysia" },
    { iata: "CGK", name: "Soekarno-Hatta Intl, Jakarta, Indonesia" },
    { iata: "DPS", name: "Ngurah Rai Intl, Bali, Indonesia" },
    { iata: "MNL", name: "Ninoy Aquino Intl, Manila, Philippines" },
    { iata: "SGN", name: "Tan Son Nhat Intl, Ho Chi Minh City, Vietnam" },
    { iata: "HAN", name: "Noi Bai Intl, Hanoi, Vietnam" },
    { iata: "HKG", name: "Hong Kong International Airport, HK" },
    { iata: "TPE", name: "Taoyuan Intl, Taipei, Taiwan" },
    { iata: "HND", name: "Haneda, Tokyo, Japan" },
    { iata: "NRT", name: "Narita Intl, Tokyo, Japan" },
    { iata: "KIX", name: "Kansai Intl, Osaka, Japan" },
    { iata: "ICN", name: "Incheon Intl, Seoul, South Korea" },
    { iata: "GMP", name: "Gimpo Intl, Seoul, South Korea" },
    { iata: "PVG", name: "Pudong Intl, Shanghai, China" },
    { iata: "SHA", name: "Hongqiao Intl, Shanghai, China" },
    { iata: "PEK", name: "Beijing Capital, China" },
    { iata: "PKX", name: "Daxing Intl, Beijing, China" },
    { iata: "CAN", name: "Baiyun Intl, Guangzhou, China" },
    { iata: "SZX", name: "Bao'an Intl, Shenzhen, China" },

    // Oceania
    { iata: "SYD", name: "Kingsford Smith, Sydney, Australia" },
    { iata: "MEL", name: "Tullamarine, Melbourne, Australia" },
    { iata: "BNE", name: "Brisbane Airport, Australia" },
    { iata: "PER", name: "Perth Airport, Australia" },
    { iata: "AKL", name: "Auckland Airport, New Zealand" },
    { iata: "CHC", name: "Christchurch Intl, New Zealand" },
    { iata: "NAN", name: "Nadi Intl, Fiji" }
  ];

  // Manual Airport Sync Endpoint
  app.post("/api/airports/sync", async (req, res) => {
    try {
      console.log("[API] Manual Airport Sync requested.");
      const count = await triggerAirportSync();
      res.json({ success: true, count, message: `Successfully synchronized ${count} global airports into your local database.` });
    } catch (err: any) {
      console.error("[API] Airport sync failed:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Google Flights API mock for airports (Lightweight static in-memory provider with live Travelpayouts hybrid failover)
  app.get("/api/flights/airports", async (req, res) => {
    try {
      const q = (req.query.q as string)?.trim().toLowerCase();
      if (!q) return res.json({ results: [] });
      
      // 1. Fetch from our high-performance local database `airports` table
      let localFiltered: any[] = [];
      try {
        const [rows]: any = await db.query(
          `SELECT iata, name, city, state, country FROM airports 
           WHERE iata = ? OR LOWER(name) LIKE ? OR LOWER(city) LIKE ? 
           LIMIT 50`,
          [q.toUpperCase(), `%${q}%`, `%${q}%`]
        );
        
        localFiltered = rows.map((row: any) => ({
          code: row.iata.toUpperCase(),
          iata: row.iata.toUpperCase(),
          name: row.name,
          city: row.city || row.state || '',
          country: row.country || ''
        }));
      } catch (dbErr: any) {
        console.warn("[Airport DB Search] Query failed, falling back to static list:", dbErr.message);
        // Fallback to static list if table not populated or failed
        localFiltered = MAJOR_AIRPORTS.filter((a: any) => {
          return (a.iata && a.iata.toLowerCase().includes(q)) || 
                 (a.name && a.name.toLowerCase().includes(q));
        }).map((a: any) => ({
          code: a.iata.toUpperCase(),
          iata: a.iata.toUpperCase(),
          name: a.name,
          city: a.name.split(',')[1]?.trim() || '',
          country: a.name.split(',')[2]?.trim() || ''
        }));
      }

      let apiResults: any[] = [];
      
      // 2. Query Travelpayouts real-time global directory for micro & newly added airports
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s fast timeout
        
        const response = await fetch(`https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(q)}&locale=en`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const rawData = await response.json();
          if (Array.isArray(rawData)) {
            apiResults = rawData.map((item: any) => {
              return {
                code: (item.code || '').toUpperCase().trim(),
                iata: (item.code || '').toUpperCase().trim(),
                name: item.type === 'airport' ? item.name : (item.main_airport_name || item.name),
                city: item.city_name || item.name || '',
                country: item.country_name || ''
              };
            }).filter((item: any) => item.iata && item.iata.length === 3);
          }
        }
      } catch (apiErr: any) {
        console.warn("Travelpayouts API search bypassed or timed out:", apiErr.message);
      }

      // 3. Merge, deduplicate, and sort combined lists
      const combined = [...localFiltered, ...apiResults];
      const seen = new Set<string>();
      const results: any[] = [];

      for (const item of combined) {
        if (!item.iata) continue;
        const key = item.iata.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            code: key,
            iata: key,
            name: item.name,
            city: item.city || '',
            country: item.country || ''
          });
        }
      }

      res.json({
        provider: "Hybrid Real-time Global Airport Directory",
        results: results.slice(0, 15)
      });
    } catch (err) {
      console.error("Flights API Error:", err);
      res.status(500).json({ error: "Failed to load airports" });
    }
  });

  // Proxy for Logos to ensure CORS for html-to-image
  app.get("/api/proxy-logo", async (req, res) => {
    try {
      const domain = req.query.domain as string;
      if (!domain) return res.status(400).send("No domain");

      let fetchRes;
      try {
        const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        fetchRes = await fetch(url);
      } catch (e) {
        console.warn("Favicon fetch failed:", e);
      }

      if (!fetchRes || !fetchRes.ok) {
        return res.status(404).send("Not found");
      }

      const buffer = await fetchRes.arrayBuffer();
      res.setHeader("Content-Type", fetchRes.headers.get("content-type") || "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("Proxy logo error:", err);
      res.status(500).send("Error fetching logo");
    }
  });

const AIRLINE_DOMAINS: Record<string, string> = {
  // Airlines
  'delta': 'delta.com', 'united': 'united.com', 'american': 'aa.com',
  'jetblue': 'jetblue.com', 'southwest': 'southwest.com', 'alaska': 'alaskaair.com',
  'spirit': 'spirit.com', 'frontier': 'flyfrontier.com', 'british airways': 'britishairways.com',
  'lufthansa': 'lufthansa.com', 'air france': 'airfrance.com', 'klm': 'klm.com',
  'emirates': 'emirates.com', 'qatar': 'qatarairways.com', 'etihad': 'etihad.com',
  'singapore airlines': 'singaporeair.com', 'cathay': 'cathaypacific.com',
  'ana': 'ana.co.jp', 'jal': 'jal.co.jp', 'qantas': 'qantas.com',
  'air canada': 'aircanada.com', 'westjet': 'westjet.com', 'aeromexico': 'aeromexico.com',
  'latam': 'latam.com', 'avianca': 'avianca.com', 'copa': 'copaair.com',
  'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com', 'wizz': 'wizzair.com',
  'indigo': 'goindigo.in', 'air india': 'airindia.in', 'spicejet': 'spicejet.com',
  'aer lingus': 'aerlingus.com', 'finnair': 'finnair.com',
  'sas': 'flysas.com', 'norwegian': 'norwegian.com', 'iberia': 'iberia.com',
  'tap': 'flytap.com', 'turkish airlines': 'turkishairlines.com',
  'thai': 'thaiairways.com', 'eva': 'evaair.com', 'korean': 'koreanair.com',
  'asiana': 'flyasiana.com', 'vietnam': 'vietnamairlines.com', 'garuda': 'garuda-indonesia.com',
  'malaysia': 'malaysiaairlines.com', 'philippine': 'philippineairlines.com',
  'air asia': 'airasia.com', 'lion air': 'lionair.co.id', 'jetstar': 'jetstar.com',
  'scoot': 'flyscoot.com', 'vueling': 'vueling.com', 'volotea': 'volotea.com',
  'eurowings': 'eurowings.com', 'swiss': 'swiss.com', 'austrian': 'austrian.com',
  'brussels': 'brusselsairlines.com', 'lot': 'lot.com', 'ita': 'itaspa.com',
  'alitalia': 'alitalia.com', 'aegean': 'aegeanair.com', 'el al': 'elal.com',
  'ethiopian': 'ethiopianairlines.com', 'kenya': 'kenya-airways.com', 'south african': 'flysaa.com',
  'royal air maroc': 'royalairmaroc.com', 'egyptair': 'egyptair.com', 'air china': 'airchina.com.cn',
  'china eastern': 'ceair.com', 'china southern': 'csair.com', 'hainan': 'hainanairlines.com',

  // Cruises
  'carnival': 'carnival.com', 'royal caribbean': 'royalcaribbean.com', 
  'norwegian cruise': 'ncl.com', 'princess cruises': 'princess.com',
  'celebrity cruises': 'celebritycruises.com', 'msc': 'msccruisesusa.com',
  'disney cruise': 'disneycruise.disney.go.com', 'holland america': 'hollandamerica.com',

  // Ferries & Ships
  'stena line': 'stenaline.com', 'dfds': 'dfds.com', 'brittany ferries': 'brittany-ferries.co.uk',
  'p&o ferries': 'poferries.com', 'tallink': 'tallinksilja.com', 'color line': 'colorline.com',

  // Hotels & OTAs
  'marriott': 'marriott.com', 'hilton': 'hilton.com', 'hyatt': 'hyatt.com',
  'ihg': 'ihg.com', 'wyndham': 'wyndhamhotels.com', 'best western': 'bestwestern.com',
  'choice hotels': 'choicehotels.com', 'radisson': 'radissonhotels.com',
  'booking.com': 'booking.com', 'expedia': 'expedia.com', 'agoda': 'agoda.com',
  'hotels.com': 'hotels.com', 'airbnb': 'airbnb.com'
};

const getAirlineDomainAsync = async (name: string) => {
  if (!name) return '';
  const cleanName = name.toLowerCase().trim();
  for (const [key, domain] of Object.entries(AIRLINE_DOMAINS)) {
    if (cleanName.includes(key)) return domain;
  }
  
  // Improved derivation logic
  const core = cleanName
    .replace(/\s*(airlines|airways|air|cruises|hotels|group|resorts|intl|international|express|connect|regional)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  
  if (core.length > 1) {
    return `${core}.com`;
  }
  
  const firstWord = cleanName.split(' ')[0].replace(/[^a-z0-9]/g, '');
  return firstWord.length > 1 ? `${firstWord}.com` : '';
};

async function getCompanyIdFromBooking(bookingIdOrCrmId: string): Promise<string> {
  if (!bookingIdOrCrmId) return 'legacy-tenant-1';
  try {
    const [rows]: any = await db.query(
      'SELECT company_id FROM bookings WHERE id = ? OR crm_id = ? LIMIT 1',
      [bookingIdOrCrmId, bookingIdOrCrmId]
    );
    if (rows && rows.length > 0) {
      return rows[0].company_id || 'legacy-tenant-1';
    }
  } catch (e) {}
  return 'legacy-tenant-1';
}

async function logSentEmail({
  companyId,
  bookingId,
  crmId,
  recipient,
  subject,
  bodyHtml,
  type,
  sentBy,
  dataSent
}: {
  companyId: string;
  bookingId?: string;
  crmId?: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  type: string;
  sentBy?: string;
  dataSent: any;
}) {
  try {
    const id = 'mail_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    const finalCompanyId = companyId || 'legacy-tenant-1';
    await db.query(
      'INSERT INTO sent_emails (id, company_id, booking_id, crm_id, recipient, subject, body_html, type, sent_by, data_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        finalCompanyId,
        bookingId || null,
        crmId || null,
        recipient,
        subject,
        bodyHtml,
        type,
        sentBy || null,
        dataSent ? JSON.stringify(dataSent) : null
      ]
    );
    console.log(`[Email Logger] Successfully logged sent email to ${recipient}`);
  } catch (err: any) {
    console.error('[Email Logger] Failed to log sent email:', err.message);
  }
}

  // CRM Email API with SMTP Support
  app.post("/api/send-auth-email", async (req, res) => {
    const { 
      bookingId, 
      email, 
      airlineName, 
      passengerName, 
      totalAmount, 
      currency,
      airlineCharges,
      serviceFee,
      origin,
      destination,
      tripType,
      departureDate,
      arrivalDate,
      cabinClass,
      pnr,
      passengers,
      contact,
      validatedGateway,
      packageRichText,
      appUrl,
      fromLabel,
      fromEmail,
      branding,
      snapshotBase64,
      attachments: attachmentsList,
      cardLast4,
      cardHolderName,
      cardBrand
    } = req.body;

    await persistSenderInfo(bookingId, fromEmail, fromLabel);

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const reqUrl = `${proto}://${req.get('host')}`;
    const currentAppUrl = appUrl || reqUrl;
    const authLink = `${currentAppUrl}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = await processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId, req);
    
    let airlineDomainFinal = req.body.airlineDomain || await getAirlineDomainAsync(airlineName);
    if (airlineDomainFinal) {
      try {
        let fetchRes;
        try { fetchRes = await fetch(`https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`); } catch(e) {}
        
        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          finalAttachments.push({
            filename: `airline-logo.png`,
            content: Buffer.from(buffer).toString('base64'),
            encoding: 'base64',
            cid: 'airlinelogo',
            contentDisposition: 'inline'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {
        // ignore
      }
    }
    
    const html = generateAuthEmail({
      crmId: bookingId,
      airlineName,
      airlineDomain: airlineDomainFinal,
      passengerName: passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'),
      cardHolderName: cardHolderName || passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'),
      cardLast4: cardLast4 || '',
      cardBrand: cardBrand || '',
      totalAmount,
      currency,
      authLink,
      airlineCharges,
      serviceFee,
      origin,
      destination,
      tripType,
      departureDate,
      arrivalDate,
      cabinClass,
      pnr,
      passengers,
      contact,
      validatedGateway,
      packageRichText: processedRichText,
      branding,
      appUrl,
      snapshotUrl
    });

    console.log(`\n--- [EMAIL DISPATCH REQUEST] ---`);
    console.log(`TO: ${email}`);
    console.log(`FROM: ${fromLabel} <${fromEmail}>`);
    
    // Find SMTP profile for this email
    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    
    if (profile && profile.appPassword) {
      try {
        const transporter = createSmtpTransporter(profile);

        await transporter.sendMail({
          from: `"${fromLabel || profile.label}" <${profile.email}>`,
          to: email,
          bcc: branding?.bccEmail || process.env.BCC_EMAIL || undefined,
          subject: `${(airlineName || '').toUpperCase()} NEW BOOKING AUTHORISATION`,
          html: html,
          attachments: finalAttachments,
          icalEvent: {
            filename: 'flight-reminder.ics',
            method: 'REQUEST',
            content: generateIcsCalendarInvite({
              bookingId,
              airlineName,
              origin,
              destination,
              pnr,
              passengerName,
              cabinClass,
              tripType,
              totalAmount,
              currency,
              departureDate,
              arrivalDate
            })
          }
        });

        console.log(`✅ SMTP SUCCESS: Sent via node-mailer to ${email}`);

        // Log to sent_emails database table asynchronously
        const cid = await getCompanyIdFromBooking(bookingId);
        await logSentEmail({
          companyId: cid,
          bookingId,
          crmId: bookingId,
          recipient: email,
          subject: `${(airlineName || '').toUpperCase()} NEW BOOKING AUTHORISATION`,
          bodyHtml: html,
          type: 'auth',
          sentBy: profile.email,
          dataSent: {
            bookingId, email, airlineName, passengerName, totalAmount, currency, airlineCharges, serviceFee,
            origin, destination, tripType, departureDate, arrivalDate, cabinClass, pnr, passengers, contact,
            validatedGateway, cardLast4, cardHolderName, cardBrand
          }
        });

        return res.json({ 
          success: true, 
          message: `Authorization email successfully sent via ${profile.email}`,
          dispatchedTo: email
        });
      } catch (error: any) {
        console.error(`❌ SMTP FAILED:`, error);
        let message = error.message || 'Unknown error code';
        if (message.includes('535')) {
          message = "Gmail Login Rejected: Use an App Password instead of your regular password. Verify 2FA is enabled.";
        }
        return res.status(500).json({ 
          success: false, 
          message: `Digital Dispatch Failure: ${message}`,
          error: error.code
        });
      }
    } else {
      console.log(`⚠️ SMTP CONFIG MISSING: Returning error to client`);
      return res.status(400).json({ 
        success: false, 
        message: branding?.smtpProfiles?.length > 0 
          ? `Sender identity mismatch. The requested sender (${fromEmail}) was not found in your verified SMTP profiles.` 
          : "No SMTP credentials detected. Please configure your sender accounts in System Settings to enable email dispatch.",
        error: "SMTP_NOT_CONFIGURED"
      });
    }
  });

  app.post("/api/send-confirmation-email", async (req, res) => {
    const { 
      bookingId, 
      email, 
      airlineName, 
      passengerName, 
      totalAmount, 
      currency, 
      origin,
      destination,
      tripType,
      departureDate,
      arrivalDate,
      cabinClass,
      pnr,
      passengers,
      contact,
      fromEmail, 
      fromLabel, 
      branding,
      appUrl,
      snapshotBase64,
      packageRichText,
      authEmail,
      authIp,
      signatureBase64,
      attachments: attachmentsList
    } = req.body;
    
    let finalAttachments = attachmentsList ? [...attachmentsList] : [];

    let signatureUrl = undefined;
    if (signatureBase64) {
      try {
        signatureUrl = `cid:signatureimg`;
        finalAttachments.push({
          filename: `signature.png`,
          content: signatureBase64,
          encoding: 'base64',
          cid: 'signatureimg',
          contentDisposition: 'inline'
        });
      } catch (e) {
        console.error("Failed to process signatureBase64", e);
      }
    }

    const processed = await processAttachmentsAndRichText(finalAttachments, packageRichText, snapshotBase64, bookingId, req);
    finalAttachments = processed.finalAttachments;
    const { processedRichText, snapshotUrl } = processed;
    let airlineDomainFinal = req.body.airlineDomain || await getAirlineDomainAsync(airlineName);
    if (airlineDomainFinal) {
      try {
        let fetchRes;
        try { fetchRes = await fetch(`https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`); } catch(e) {}

        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          finalAttachments.push({
            filename: `airline-logo.png`,
            content: Buffer.from(buffer).toString('base64'),
            encoding: 'base64',
            cid: 'airlinelogo',
            contentDisposition: 'inline'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {
        // ignore
      }
    }

    const html = generateConfirmationEmail({
      crmId: bookingId,
      airlineName,
      airlineDomain: airlineDomainFinal,
      passengerName: passengerName || 'Valued Customer',
      totalAmount,
      currency,
      origin,
      destination,
      tripType,
      departureDate,
      arrivalDate,
      cabinClass,
      pnr,
      passengers,
      contact,
      branding,
      appUrl,
      snapshotUrl,
      packageRichText: processedRichText,
      authEmail,
      authIp,
      signatureUrl
    });

    console.log(`\n--- [CONFIRMATION DISPATCH] ---`);
    console.log(`TO: ${email}`);

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    
    if (profile && profile.appPassword) {
      try {
        const transporter = createSmtpTransporter(profile);

        await transporter.sendMail({
          from: `"${fromLabel || profile.label}" <${profile.email}>`,
          to: email,
          bcc: branding?.bccEmail || process.env.BCC_EMAIL || undefined,
          subject: `${(airlineName || '').toUpperCase()} BOOKING CONFIRMATION ${(bookingId || '').toUpperCase()}`,
          html: html,
          attachments: finalAttachments,
          icalEvent: {
            filename: 'flight-reminder.ics',
            method: 'REQUEST',
            content: generateIcsCalendarInvite({
              bookingId,
              airlineName,
              origin,
              destination,
              pnr,
              passengerName,
              cabinClass,
              tripType,
              totalAmount,
              currency,
              departureDate,
              arrivalDate
            })
          }
        });
        console.log(`✅ SMTP SUCCESS: Sent confirmation via node-mailer to ${email}`);

        const cid = await getCompanyIdFromBooking(bookingId);
        await logSentEmail({
          companyId: cid,
          bookingId,
          crmId: bookingId,
          recipient: email,
          subject: `${(airlineName || '').toUpperCase()} BOOKING CONFIRMATION ${(bookingId || '').toUpperCase()}`,
          bodyHtml: html,
          type: 'confirmation',
          sentBy: profile.email,
          dataSent: {
            bookingId, email, airlineName, passengerName, totalAmount, currency, origin, destination, tripType,
            departureDate, arrivalDate, cabinClass, pnr, passengers, contact, authEmail, authIp
          }
        });

        return res.json({ success: true, message: "Confirmation receipt sent to " + email });
      } catch (error: any) {
        console.error(`❌ SMTP FAILED:`, error);
        return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
      }
    } else {
      console.log(`⚠️ SMTP CONFIG MISSING: Returning error for confirmation`);
      return res.status(400).json({ 
        success: false, 
        message: branding?.smtpProfiles?.length > 0 
          ? `Sender identity mismatch. The requested sender (${fromEmail}) was not found in your verified SMTP profiles.` 
          : "No SMTP credentials detected. Please configure your sender accounts in System Settings to enable confirmation receipts.",
        error: "SMTP_NOT_CONFIGURED"
      });
    }
  });

  app.post("/api/send-refund-email", async (req, res) => {
    const { bookingId, appUrl, email, crmId, airlineName, totalAmount, refundQuote, airlineCredits, airlineCharges, serviceFee, currency, pnr, passengerName, branding, fromEmail, fromLabel, validatedGateway, packageRichText, snapshotBase64, attachments: attachmentsList, cardLast4, cardHolderName, refundType, cardBrand, passengers } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    await persistSenderInfo(bookingId, fromEmail, fromLabel);

    const { generateRefundEmail } = await import('./src/lib/emailTemplates');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const reqUrl = `${proto}://${req.get('host')}`;
    const currentAppUrl = appUrl || reqUrl;
    const authLink = `${currentAppUrl}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = await processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId, req);
    
    let airlineDomainFinal = req.body.airlineDomain || await getAirlineDomainAsync(airlineName);
    if (airlineDomainFinal) {
      try {
        let fetchRes;
        try { fetchRes = await fetch(`https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`); } catch(e) {}
        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          finalAttachments.push({
            filename: `airline-logo.png`,
            content: Buffer.from(buffer).toString('base64'),
            encoding: 'base64',
            cid: 'airlinelogo',
            contentDisposition: 'inline'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateRefundEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, totalAmount, airlineCharges, serviceFee, refundQuote, airlineCredits, currency, pnr, passengerName: passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardBrand: cardBrand || '', branding, authLink, validatedGateway, packageRichText: processedRichText, snapshotUrl, refundType, passengers });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = createSmtpTransporter(profile);
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        bcc: branding?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `${(airlineName || '').toUpperCase()} REFUND PROCESSED ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments
      });

      const cid = await getCompanyIdFromBooking(bookingId || crmId);
      await logSentEmail({
        companyId: cid,
        bookingId: bookingId || crmId,
        crmId: crmId || bookingId,
        recipient: email,
        subject: `${(airlineName || '').toUpperCase()} REFUND PROCESSED ${(crmId || pnr || '').toUpperCase()}`,
        bodyHtml: html,
        type: 'refund',
        sentBy: profile.email,
        dataSent: {
          bookingId, email, crmId, airlineName, totalAmount, refundQuote, airlineCredits, airlineCharges,
          serviceFee, currency, pnr, passengerName, validatedGateway, cardLast4, cardHolderName, refundType,
          cardBrand, passengers
        }
      });

      return res.json({ success: true, message: "Refund receipt sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-cancel-email", async (req, res) => {
    const { bookingId, appUrl, email, crmId, airlineName, pnr, passengerName, origin, destination, branding, fromEmail, fromLabel, validatedGateway, packageRichText, snapshotBase64, attachments: attachmentsList, totalAmount, airlineCharges, serviceFee, refundQuote, currency, cardLast4, cardHolderName, cardBrand, passengers } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    await persistSenderInfo(bookingId, fromEmail, fromLabel);

    const { generateCancelEmail } = await import('./src/lib/emailTemplates');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const reqUrl = `${proto}://${req.get('host')}`;
    const currentAppUrl = appUrl || reqUrl;
    const authLink = `${currentAppUrl}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = await processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId, req);
    
    let airlineDomainFinal = req.body.airlineDomain || await getAirlineDomainAsync(airlineName);
    if (airlineDomainFinal) {
      try {
        let fetchRes;
        try { fetchRes = await fetch(`https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`); } catch(e) {}
        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          finalAttachments.push({
            filename: `airline-logo.png`,
            content: Buffer.from(buffer).toString('base64'),
            encoding: 'base64',
            cid: 'airlinelogo',
            contentDisposition: 'inline'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateCancelEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, pnr, passengerName: passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardBrand: cardBrand || '', origin, destination, branding, authLink, validatedGateway, totalAmount: totalAmount || 0, airlineCharges, serviceFee, currency: currency || 'USD', refundQuote: refundQuote || 0, packageRichText: processedRichText, snapshotUrl, passengers });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = createSmtpTransporter(profile);
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        bcc: branding?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `${(airlineName || '').toUpperCase()} CANCEL & REBOOK ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments
      });

      const cid = await getCompanyIdFromBooking(bookingId || crmId);
      await logSentEmail({
        companyId: cid,
        bookingId: bookingId || crmId,
        crmId: crmId || bookingId,
        recipient: email,
        subject: `${(airlineName || '').toUpperCase()} CANCEL & REBOOK ${(crmId || pnr || '').toUpperCase()}`,
        bodyHtml: html,
        type: 'cancel',
        sentBy: profile.email,
        dataSent: {
          bookingId, email, crmId, airlineName, pnr, passengerName, origin, destination, validatedGateway,
          totalAmount, airlineCharges, serviceFee, refundQuote, currency, cardLast4, cardHolderName, cardBrand,
          passengers
        }
      });

      return res.json({ success: true, message: "Cancellation notice sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-changes-email", async (req, res) => {
    const { bookingId, appUrl, email, crmId, airlineName, pnr, oldPnr, modificationDetails, passengerName, origin, destination, branding, fromEmail, fromLabel, validatedGateway, packageRichText, snapshotBase64, attachments: attachmentsList, totalAmount, airlineCharges, serviceFee, refundQuote, currency, cardLast4, cardHolderName, cardBrand, passengers } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    await persistSenderInfo(bookingId, fromEmail, fromLabel);

    const { generateChangesEmail } = await import('./src/lib/emailTemplates');
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const reqUrl = `${proto}://${req.get('host')}`;
    const currentAppUrl = appUrl || reqUrl;
    const authLink = `${currentAppUrl}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = await processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId, req);
    
    let airlineDomainFinal = req.body.airlineDomain || await getAirlineDomainAsync(airlineName);
    if (airlineDomainFinal) {
      try {
        let fetchRes;
        try { fetchRes = await fetch(`https://www.google.com/s2/favicons?domain=${airlineDomainFinal}&sz=128`); } catch(e) {}
        if (fetchRes && fetchRes.ok) {
          const buffer = await fetchRes.arrayBuffer();
          finalAttachments.push({
            filename: `airline-logo.png`,
            content: Buffer.from(buffer).toString('base64'),
            encoding: 'base64',
            cid: 'airlinelogo',
            contentDisposition: 'inline'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateChangesEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, pnr, oldPnr, modificationDetails, passengerName: passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || (passengers && passengers[0] ? (typeof passengers[0] === 'string' ? passengers[0] : passengers[0].name) : 'Valued Customer'), cardBrand: cardBrand || '', origin, destination, branding, authLink, validatedGateway, totalAmount: totalAmount || 0, airlineCharges, serviceFee, currency: currency || 'USD', refundQuote: refundQuote || 0, packageRichText: processedRichText, snapshotUrl, passengers });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = createSmtpTransporter(profile);
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        bcc: branding?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `${(airlineName || '').toUpperCase()} CHANGES ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments,
        icalEvent: {
          filename: 'flight-reminder.ics',
          method: 'REQUEST',
          content: generateIcsCalendarInvite({
                     bookingId: bookingId || crmId,
                     airlineName,
                     origin,
                     destination,
                     pnr,
                     passengerName,
                     cabinClass: req.body.cabinClass,
                     tripType: req.body.tripType,
                     totalAmount: totalAmount || req.body.totalAmount,
                     currency: currency || req.body.currency,
                     departureDate: req.body.departureDate,
                     arrivalDate: req.body.arrivalDate
                   })
        }
      });

      const cid = await getCompanyIdFromBooking(bookingId || crmId);
      await logSentEmail({
        companyId: cid,
        bookingId: bookingId || crmId,
        crmId: crmId || bookingId,
        recipient: email,
        subject: `${(airlineName || '').toUpperCase()} CHANGES ${(crmId || pnr || '').toUpperCase()}`,
        bodyHtml: html,
        type: 'changes',
        sentBy: profile.email,
        dataSent: {
          bookingId, email, crmId, airlineName, pnr, oldPnr, modificationDetails, passengerName, origin,
          destination, validatedGateway, totalAmount, airlineCharges, serviceFee, refundQuote, currency,
          cardLast4, cardHolderName, cardBrand, passengers
        }
      });

      return res.json({ success: true, message: "Changes notification sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-tenant-invitation", async (req, res) => {
    const { tenantEmail, tempPassword, appUrl, settings } = req.body;
    
    if (!tenantEmail) {
      return res.status(400).json({ success: false, message: 'Missing tenant email' });
    }

    const { generateTenantInvitationEmail } = await import('./src/lib/emailTemplates');
    const html = generateTenantInvitationEmail(tenantEmail, tempPassword, appUrl || 'http://localhost:3000', settings?.companyName || 'SKY CRM');

    const profile = settings?.smtpProfiles?.[0]; 
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "System SMTP not configured. Cannot send invitation email." });
    }

    try {
      const transporter = createSmtpTransporter(profile);
      await transporter.sendMail({
        from: `"Secure Auth CRM" <${profile.email}>`,
        to: tenantEmail,
        bcc: settings?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `Welcome - Secure Auth CRM Account Created`,
        html: html
      });
      return res.json({ success: true, message: "Invitation sent successfully" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-otp-email", async (req, res) => {
    const { email, otp, settings } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Missing email or otp' });
    }

    const profile = settings?.smtpProfiles?.[0]; 
    if (!profile || !profile.appPassword) {
      // Fail silently for notification email if smtp not configured
      return res.status(400).json({ success: false, message: "System SMTP not configured. Cannot send OTP." });
    }

    try {
      const transporter = createSmtpTransporter(profile);

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px; text-align: center;">
            <h2 style="color: white; margin: 0; text-transform: uppercase;">Security Verification</h2>
          </div>
          <div style="padding: 30px; text-align: center;">
            <p style="font-size: 16px; color: #334155;">Hello,</p>
            <p style="font-size: 16px; color: #334155;">A login attempt was made to your account. Your one-time password (OTP) is:</p>
            <h1 style="font-size: 48px; letter-spacing: 8px; font-weight: 900; color: #3b82f6; margin: 30px 0;">${otp}</h1>
            <p style="font-size: 14px; color: #64748b;">If you did not request this, please secure your account immediately.</p>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `"Secure Auth CRM" <${profile.email}>`,
        to: email,
        bcc: settings?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `Your Login Verification Code`,
        html: html
      });
      return res.json({ success: true, message: "OTP sent successfully" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-login-notification", async (req, res) => {
    const { tenantEmail, ipAddress, userAgent, settings } = req.body;
    
    if (!tenantEmail) {
      return res.status(400).json({ success: false, message: 'Missing tenant email' });
    }

    const { generateLoginNotificationEmail } = await import('./src/lib/emailTemplates');
    const html = generateLoginNotificationEmail(tenantEmail, ipAddress, userAgent);

    const profile = settings?.smtpProfiles?.[0];
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "System SMTP not configured" });
    }

    try {
      const transporter = createSmtpTransporter(profile);
      await transporter.sendMail({
        from: `"Security Alerts" <${profile.email}>`,
        to: tenantEmail,
        bcc: settings?.bccEmail || process.env.BCC_EMAIL || undefined,
        subject: `Security Alert: New Login Detected`,
        html: html
      });
      return res.json({ success: true, message: "Login notification sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  // SMTP Test Endpoint
  app.post("/api/test-smtp", async (req, res) => {
    const { email, appPassword, label, host, port } = req.body;
    
    if (!email || !appPassword) {
      return res.status(400).json({ success: false, message: "Email and App Password required" });
    }

    try {
      const transporter = createSmtpTransporter({ email, appPassword, label, host, port });

      // Verify connection configuration
      await transporter.verify();

      // Send test email
      await transporter.sendMail({
        from: `"${label || 'SMTP Test'}" <${email}>`,
        to: email,
        subject: "SkyWay SMTP Test Connection",
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #059669;">✅ SMTP Connection Successful</h2>
            <p>This is a test email from your <strong>SkyWay Travel Group</strong> CRM.</p>
            <p>Your SMTP configuration for <strong>${email}</strong> with App Passwords is working correctly.</p>
            <hr style="border: 1px solid #f1f5f9; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b;">Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        `
      });

      res.json({ success: true, message: "Test email sent successfully! Please check your inbox / spam folder." });
    } catch (error: any) {
      let message = error.message || "Failed to connect to SMTP server";
      
      // Specifically catch Gmail 535 errors which mean regular password was used
      if (message.includes('535') || message.includes('Invalid login')) {
        message = "LOGIN FAILED: Your credentials were rejected. If using Gmail, you MUST use a 16-character 'App Password' from Google Security settings. Your regular account password will not work.";
        console.error('SMTP Test Failed (Auth Reject):', error.message);
      } else {
        console.error('SMTP Test Failed:', error);
      }

      res.status(500).json({ 
        success: false, 
        message: message,
        code: error.code
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));
  app.use('/api', apiRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Auto-seed airports if database is currently empty
    seedAirportsIfEmpty();

    // Start the upcoming flight alerts scheduler
    checkAndAlertUpcomingBookings();
    setInterval(checkAndAlertUpcomingBookings, 5 * 60 * 1000); // Check every 5 minutes

    // Start the auto-complete bookings scheduler
    autoCompletePassedBookings();
    setInterval(autoCompletePassedBookings, 5 * 60 * 1000); // Check every 5 minutes
  });
}

startServer();
