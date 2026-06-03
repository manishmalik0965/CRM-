import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import { generateAuthEmail, generateConfirmationEmail } from "./src/lib/emailTemplates.ts";
import { GoogleGenAI } from "@google/genai";
import authRoutes from './server/routes/auth.routes';
import apiRoutes from './server/routes/api.routes';
import db from './server/database/connection';

function processAttachmentsAndRichText(attachmentsList: any[] | undefined, packageRichText: string | undefined, snapshotBase64: string | undefined, bookingId: string) {
  let finalAttachments = attachmentsList ? [...attachmentsList] : [];
  let processedRichText = packageRichText;
  let snapshotUrl = undefined;

  if (processedRichText) {
    const srcRegex = /src=["']data:(image\/[^;]+);base64,([^"']+)["']/g;
    let counter = 0;
    processedRichText = processedRichText.replace(srcRegex, (match, contentType, base64Data) => {
      try {
        counter++;
        const cid = `pkg-img-${Date.now()}-${counter}`;
        const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1] || 'png';
        finalAttachments.push({
          filename: `inline-image-${counter}.${ext}`,
          content: base64Data,
          encoding: 'base64',
          cid: cid
        });
        return `src="cid:${cid}"`;
      } catch (e) {
        console.error("Failed to process inline base64 image:", e);
        return match;
      }
    });
  }

  if (snapshotBase64) {
    try {
      snapshotUrl = `cid:bookingsnapshot`;
      finalAttachments.push({
        filename: `Booking_Snapshot_${bookingId}.jpg`,
        content: snapshotBase64,
        encoding: 'base64',
        cid: 'bookingsnapshot'
      });
    } catch (e) {
       console.error("Failed to process snapshotBase64", e);
    }
  }

  return { finalAttachments, processedRichText, snapshotUrl };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

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

  // Google Flights API mock for airports
  app.get("/api/flights/airports", (req, res) => {
    try {
      const q = (req.query.q as string)?.toLowerCase();
      if (!q) return res.json([]);
      
      const airportsPath = path.join(process.cwd(), 'src/lib/airports.json');
      const data = JSON.parse(fs.readFileSync(airportsPath, 'utf8'));
      
      const filtered = data.filter((a: any) => {
        return (a.iata && a.iata.toLowerCase().includes(q)) || 
               (a.name && a.name.toLowerCase().includes(q)) ||
               (a.city && a.city.toLowerCase().includes(q));
      }).slice(0, 10);
      
      // Return structured response typical of flight APIs
      res.json({
        provider: "Google Flights API (Mock)",
        results: filtered
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
  
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `What is the primary official website domain (e.g. delta.com) for the travel company / airline "${name}"? Return ONLY the domain in plain text, nothing else.`,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      const guess = response.text?.trim().toLowerCase();
      const domain = guess?.replace(/^https?:\/\//, '').split('/')[0] || '';
      if (domain.includes('.')) return domain;
    } catch(err) {
      console.warn("Gemini logo search failed:", err);
    }
  }

  return `${cleanName.split(' ')[0]}.com`;
};

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
      cardHolderName
    } = req.body;

    const authLink = `${appUrl || 'http://localhost:3000'}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId);
    
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
            cid: 'airlinelogo'
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
      passengerName: passengerName || 'Valued Customer',
      cardHolderName: cardHolderName || passengerName || 'Valued Customer',
      cardLast4: cardLast4 || '',
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
        const cleanPassword = profile.appPassword.replace(/\s+/g, '');
        const transporter = nodemailer.createTransport({
          host: profile.host || 'smtp.gmail.com',
          port: profile.port ? parseInt(profile.port) : 465,
          secure: profile.port == 587 ? false : true,
          auth: {
            user: profile.email,
            pass: cleanPassword
          }
        });

        await transporter.sendMail({
          from: `"${fromLabel || profile.label}" <${profile.email}>`,
          to: email,
          subject: `${(airlineName || '').toUpperCase()} NEW BOOKING AUTHORISATION`,
          html: html,
          attachments: finalAttachments
        });

        console.log(`✅ SMTP SUCCESS: Sent via node-mailer to ${email}`);
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
          cid: 'signatureimg'
        });
      } catch (e) {
        console.error("Failed to process signatureBase64", e);
      }
    }

    const processed = processAttachmentsAndRichText(finalAttachments, packageRichText, snapshotBase64, bookingId);
    finalAttachments = processed.finalAttachments;
    const { processedRichText, snapshotUrl } = processed;

    if (snapshotBase64) {
      // It is already processed by processAttachmentsAndRichText
    }

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
            cid: 'airlinelogo'
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
        const cleanPassword = profile.appPassword.replace(/\s+/g, '');
        const transporter = nodemailer.createTransport({
          host: profile.host || 'smtp.gmail.com',
          port: profile.port ? parseInt(profile.port) : 465,
          secure: profile.port == 587 ? false : true,
          auth: {
            user: profile.email,
            pass: cleanPassword
          }
        });

        await transporter.sendMail({
          from: `"${fromLabel || profile.label}" <${profile.email}>`,
          to: email,
          subject: `${(airlineName || '').toUpperCase()} BOOKING CONFIRMATION ${(bookingId || '').toUpperCase()}`,
          html: html,
          attachments: finalAttachments
        });
        console.log(`✅ SMTP SUCCESS: Sent confirmation via node-mailer to ${email}`);
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
    const { bookingId, appUrl, email, crmId, airlineName, totalAmount, refundQuote, airlineCredits, airlineCharges, serviceFee, currency, pnr, passengerName, branding, fromEmail, fromLabel, packageRichText, snapshotBase64, attachments: attachmentsList, cardLast4, cardHolderName } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    const { generateRefundEmail } = await import('./src/lib/emailTemplates');
    const authLink = `${appUrl || 'http://localhost:3000'}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId);

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
            cid: 'airlinelogo'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateRefundEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, totalAmount, airlineCharges, serviceFee, refundQuote, airlineCredits, currency, pnr, passengerName, cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || '', branding, authLink, packageRichText: processedRichText, snapshotUrl });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        subject: `${(airlineName || '').toUpperCase()} REFUND PROCESSED ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments
      });
      return res.json({ success: true, message: "Refund receipt sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-cancel-email", async (req, res) => {
    const { bookingId, appUrl, email, crmId, airlineName, pnr, passengerName, origin, destination, branding, fromEmail, fromLabel, validatedGateway, packageRichText, snapshotBase64, attachments: attachmentsList, totalAmount, airlineCharges, serviceFee, refundQuote, currency, cardLast4, cardHolderName } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    const { generateCancelEmail } = await import('./src/lib/emailTemplates');
    const authLink = `${appUrl || 'http://localhost:3000'}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId);

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
            cid: 'airlinelogo'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateCancelEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, pnr, passengerName, cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || '', origin, destination, branding, authLink, validatedGateway, totalAmount: totalAmount || 0, airlineCharges, serviceFee, currency: currency || 'USD', refundQuote: refundQuote || 0, packageRichText: processedRichText, snapshotUrl });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        subject: `${(airlineName || '').toUpperCase()} CANCEL & REBOOK ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments
      });
      return res.json({ success: true, message: "Cancellation notice sent" });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: `SMTP Error: ${error.message}` });
    }
  });

  app.post("/api/send-changes-email", async (req, res) => {
    const { bookingId, appUrl, email, crmId, airlineName, pnr, oldPnr, modificationDetails, passengerName, origin, destination, branding, fromEmail, fromLabel, validatedGateway, packageRichText, snapshotBase64, attachments: attachmentsList, totalAmount, airlineCharges, serviceFee, refundQuote, currency, cardLast4, cardHolderName } = req.body;
    
    if (!email || !fromEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient or sender email' });
    }

    const { generateChangesEmail } = await import('./src/lib/emailTemplates');
    const authLink = `${appUrl || 'http://localhost:3000'}/authorize/${bookingId}`;
    
    const { finalAttachments, processedRichText, snapshotUrl } = processAttachmentsAndRichText(attachmentsList, packageRichText, snapshotBase64, bookingId);

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
            cid: 'airlinelogo'
          });
          airlineDomainFinal = 'cid:airlinelogo';
        }
      } catch(e) {}
    }

    const html = generateChangesEmail({ crmId, airlineName, airlineDomain: airlineDomainFinal, pnr, oldPnr, modificationDetails, passengerName, cardLast4: cardLast4 || '', cardHolderName: cardHolderName || passengerName || '', origin, destination, branding, authLink, validatedGateway, totalAmount: totalAmount || 0, airlineCharges, serviceFee, currency: currency || 'USD', refundQuote: refundQuote || 0, packageRichText: processedRichText, snapshotUrl });

    const profile = branding?.smtpProfiles?.find((p: any) => p.email === fromEmail);
    if (!profile || !profile.appPassword) {
      return res.status(400).json({ success: false, message: "Missing SMTP config" });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });
      await transporter.sendMail({
        from: `"${fromLabel || profile.label}" <${profile.email}>`,
        to: email,
        subject: `${(airlineName || '').toUpperCase()} CHANGES ${(crmId || pnr || '').toUpperCase()}`,
        html: html,
        attachments: finalAttachments
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
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });
      await transporter.sendMail({
        from: `"Secure Auth CRM" <${profile.email}>`,
        to: tenantEmail,
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
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });

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
      const transporter = nodemailer.createTransport({
        host: profile.host || 'smtp.gmail.com',
        port: profile.port ? parseInt(profile.port) : 465,
        secure: profile.port == 587 ? false : true,
        auth: { user: profile.email, pass: profile.appPassword.replace(/\s+/g, '') }
      });
      await transporter.sendMail({
        from: `"Security Alerts" <${profile.email}>`,
        to: tenantEmail,
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

    const cleanPassword = appPassword.replace(/\s+/g, '');

    try {
      const transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port: port ? parseInt(port) : 465,
        secure: port == 587 ? false : true,
        auth: { user: email, pass: cleanPassword }
      });

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
  });
}

startServer();
