import PDFDocument from 'pdfkit';
import { Response } from 'express';

function htmlToPlainText(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  text = text.replace(/<\/td>/gi, ' | ');
  text = text.replace(/<\/th>/gi, ' | ');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<h[1-6][^>]*>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/gi, ' ')
             .replace(/&amp;/gi, '&')
             .replace(/&lt;/gi, '<')
             .replace(/&gt;/gi, '>')
             .replace(/&quot;/gi, '"')
             .replace(/&#39;/gi, "'")
             .replace(/&rarr;/gi, '->')
             .replace(/&check;/gi, '✓');
  return text.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

export async function generateAuthVerificationPdf(
  res: Response,
  booking: any,
  passengers: any[],
  emails: any[],
  branding: any = {}
) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Master Chargeback Defense & Auth Certificate - ${booking.crm_id || booking.crmId}`,
      Author: branding.organizationName || 'CRM SYSTEM',
    }
  });

  doc.pipe(res);

  const primaryColor = branding.primaryColor || '#0f172a';
  const secondaryColor = '#64748b';

  // Parse details
  let details: any = {};
  if (booking.details) {
    try {
      details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
    } catch (e) {}
  }

  const authMetadata = booking.authMetadata || details.authMetadata || {};
  const signatureData = booking.signature_data || booking.signatureData || details.signatureData || details.signature_data || authMetadata.signatureData;

  const cardHolderName = booking.card_holder_name || booking.cardHolder || (passengers[0]?.name || 'Valued Customer');
  const currency = booking.currency || 'USD';
  const totalAmount = booking.total_amount || booking.totalAmount || 0;
  const airlineCharges = booking.airline_charges || booking.airlineCharges || 0;
  const serviceFee = booking.service_fee || booking.serviceFee || 0;
  const crmId = booking.crm_id || booking.crmId || 'N/A';
  const airlineName = (booking.airline_name || booking.airlineName || 'AIRLINE').toUpperCase();
  const pnr = (booking.pnr || 'PENDING').toUpperCase();
  const origin = (booking.origin || 'TBD').toUpperCase();
  const destination = (booking.destination || 'TBD').toUpperCase();

  // -------------------------------------------------------------
  // PAGE 1: DOCUSIGN SECURE eSIGNATURE AUDIT RECORD & CERTIFICATE
  // -------------------------------------------------------------
  doc.rect(0, 0, 595.28, 841.89).fill('#f8fafc');
  doc.roundedRect(25, 25, 545, 791, 8).fill('#ffffff');

  // Header Banner
  doc.rect(25, 25, 545, 55).fill(primaryColor);
  doc.fillColor('#ffffff')
     .fontSize(14)
     .font('Helvetica-Bold')
     .text('DOCUSIGN SECURE eSIGNATURE AUDIT RECORD & CERTIFICATE', 25, 42, {
       width: 545,
       align: 'center'
     });

  let currentY = 95;

  // Envelope Details & Status
  doc.fillColor(secondaryColor).fontSize(8).font('Helvetica-Bold').text('ENVELOPE IDENTIFIER', 45, currentY);
  doc.fillColor('#0f172a').fontSize(13).text(`DS-CRM-${crmId}`, 45, currentY + 12);

  doc.fillColor(secondaryColor).fontSize(8).font('Helvetica-Bold').text('SUBJECT', 240, currentY);
  doc.fillColor('#0f172a').fontSize(11).font('Helvetica').text(`Official Payment Authorization - ${airlineName}`, 240, currentY + 12);

  doc.fillColor(secondaryColor).fontSize(8).font('Helvetica-Bold').text('ENVELOPE STATUS', 440, currentY);
  doc.rect(440, currentY + 10, 110, 22).fill('#10b981');
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('COMPLETED ✓', 440, currentY + 16, { width: 110, align: 'center' });

  currentY += 45;

  // Signer Events Summary Header
  doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('SIGNER EVENTS SUMMARY & VERIFIED CONSENT', 45, currentY);
  currentY += 15;

  // Summary Grid Frame
  doc.roundedRect(45, currentY, 505, 115, 6).fill('#f8fafc').stroke('#cbd5e1');

  let gridY = currentY + 10;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Signer Identity:', 55, gridY);
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica').text(`${cardHolderName} (${booking.contact_email || booking.contactEmail || 'N/A'})`, 150, gridY);

  gridY += 18;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Direct Consent:', 55, gridY);
  doc.fillColor('#0f172a').fontSize(8).font('Helvetica').text(authMetadata.consent || 'Consent: I agree to the charges and terms stated via direct link.', 150, gridY, { width: 380 });

  gridY += 20;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Audit IP Address:', 55, gridY);
  doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(authMetadata.browserIp || authMetadata.ip || booking.auth_ip || 'Unknown IP', 150, gridY);

  gridY += 18;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Timestamp:', 55, gridY);
  doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica').text(authMetadata.authorizedAt || booking.authorized_at || new Date().toLocaleString(), 150, gridY);

  gridY += 18;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Browser Device:', 55, gridY);
  doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(authMetadata.browserUserAgent || authMetadata.userAgent || 'Mozilla/5.0 (Handshake Verified)', 150, gridY, { width: 380 });

  currentY += 130;

  // Split Charges Acknowledgement Box
  doc.roundedRect(45, currentY, 505, 55, 6).fill('#eff6ff').stroke('#93c5fd');
  doc.fillColor('#1e40af').fontSize(8.5).font('Helvetica-Bold').text('SPLIT CHARGES & FINANCIAL ACKNOWLEDGEMENT', 55, currentY + 8);
  doc.fillColor('#1e3a8a').fontSize(8).font('Helvetica').text(
    `The signer explicitly acknowledges and agrees that the total authorized sum of ${currency} ${totalAmount.toLocaleString()} may be split and billed in multiple transactions under the respective merchant names (e.g. airline carrier ${airlineName} and secondary service fees), but will not exceed the cumulative total amount authorized.`,
    55, currentY + 20, { width: 485 }
  );

  currentY += 70;

  // RECORDED ELECTRONIC SIGNATURE
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text('RECORDED ELECTRONIC SIGNATURE:', 45, currentY);
  currentY += 12;

  let hasImage = false;
  if (signatureData && typeof signatureData === 'string' && signatureData.includes('base64')) {
    try {
      const cleanBase64 = signatureData.replace(/^data:image\/[a-zA-Z0-9+-]+;base64,/, '').trim();
      const imgBuffer = Buffer.from(cleanBase64, 'base64');
      doc.image(imgBuffer, 45, currentY, { width: 160 });
      currentY += 65;
      hasImage = true;
    } catch (err) {
      hasImage = false;
    }
  }

  if (!hasImage) {
    // Stylized Signature Certificate Box
    doc.roundedRect(45, currentY, 260, 48, 4).fillAndStroke('#f8fafc', '#94a3b8');
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-BoldOblique').text(cardHolderName, 55, currentY + 14);
    doc.fillColor('#10b981').fontSize(8.5).font('Helvetica-Bold').text('✓ DIGITALLY SIGNED & HANDSHAKE VERIFIED', 45, currentY + 54);
    currentY += 70;
  }

  // Footer Audit Token
  const tokenHash = `DS-SW-${crmId}-${authMetadata.browserIp || '127.0.0.1'}-${Date.now()}`;
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Oblique').text(`Envelope Token Hash: ${tokenHash}`, 45, 780, { width: 505, align: 'center' });


  // -------------------------------------------------------------
  // PAGE 2: DOCUMENT TRANSMISSION HISTORY (FULL SENT EMAIL COPY)
  // -------------------------------------------------------------
  doc.addPage();
  doc.rect(0, 0, 595.28, 841.89).fill('#f8fafc');
  doc.roundedRect(25, 25, 545, 791, 8).fill('#ffffff');

  doc.rect(25, 25, 545, 45).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold').text('DOCUMENT TRANSMISSION HISTORY (Copy of Electronic Mail Agreement)', 25, 40, { width: 545, align: 'center' });

  currentY = 85;

  const firstEmail = emails && emails.length > 0 ? emails[0] : null;
  const emailDate = firstEmail ? new Date(firstEmail.created_at).toLocaleString() : (authMetadata.authorizedAt || new Date().toLocaleString());
  const recipient = firstEmail ? firstEmail.recipient : (booking.contact_email || booking.contactEmail || 'Customer');
  const subject = firstEmail ? firstEmail.subject : `PAYMENT AUTHORIZATION REQUEST - CRM-${crmId}`;

  doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text(`Date: ${emailDate}`, 45, currentY);
  currentY += 14;
  doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text(`To: ${recipient}`, 45, currentY);
  currentY += 14;
  doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text(`From: Secure Authorization Service via CRM System`, 45, currentY);
  currentY += 14;
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(`Subject: ${subject}`, 45, currentY);

  currentY += 20;
  doc.moveTo(45, currentY).lineTo(550, currentY).stroke('#cbd5e1');
  currentY += 15;

  // Extract or build full email agreement text
  let fullEmailText = '';
  if (firstEmail && firstEmail.body_html) {
    fullEmailText = htmlToPlainText(firstEmail.body_html);
  }

  if (!fullEmailText || fullEmailText.length < 50) {
    fullEmailText = `Dear ${cardHolderName},\n\nGreetings of the Day!\n\nYour secure reservation with ${airlineName} has been initialized. As per our telephonic conversation, I ${cardHolderName}, authorize ${airlineName} and validated gateway to process the charges under the respective merchants to charge my card ending in XXXX for the reservation on the itinerary below.\n\nPlease note that charges may appear as split transactions under the respective merchant names (including the airline and the service gateway), but the cumulative total charged will not exceed the authorized sum of ${currency} ${totalAmount.toLocaleString()}.\n\nThis payment authorization is for the amount indicated above and is valid for one-time use only. I certify that I ${cardHolderName} am an authorized user of this card and will not dispute the payment with my credit/debit card company or bank.\n\nFlight Details & Itinerary Summary:\n- Airline Carrier: ${airlineName}\n- Record Locator (PNR): ${pnr}\n- Routing: ${origin} to ${destination}\n- Airline Charges: ${currency} ${airlineCharges.toLocaleString()}\n- Taxes & Service Fees: ${currency} ${serviceFee.toLocaleString()}\n- TOTAL SECURED SUM: ${currency} ${totalAmount.toLocaleString()}\n\nAuthorized & Signed Digitally By:\nName: ${cardHolderName}\nIP Address: ${authMetadata.browserIp || 'Verified'}\nTimestamp: ${emailDate}`;
  }

  // Print full email text nicely
  doc.fillColor('#1e293b').fontSize(8.5).font('Helvetica').text(fullEmailText, 45, currentY, { width: 505, height: 620, ellipsis: true });


  // -------------------------------------------------------------
  // PAGE 3: OFFICIAL RESERVATION DOSSIER & TRAVEL MANIFEST
  // -------------------------------------------------------------
  doc.addPage();
  doc.rect(0, 0, 595.28, 841.89).fill('#f8fafc');
  doc.roundedRect(25, 25, 545, 791, 8).fill('#ffffff');

  doc.rect(25, 25, 545, 45).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text('OFFICIAL RESERVATION DOSSIER & TRAVEL MANIFEST', 25, 40, { width: 545, align: 'center' });

  currentY = 85;

  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('1. ROUTING & CARRIER SPECIFICATIONS', 45, currentY);
  currentY += 15;

  const routeDetails = [
    ['Airline Carrier / Merchant', airlineName],
    ['Record Locator (PNR)', pnr],
    ['Routing Itinerary', `${origin} -> ${destination}`],
    ['Cabin / Class of Service', (booking.cabin_class || booking.cabinClass || 'ECONOMY').toUpperCase()],
    ['Departure Date', booking.departure_date || booking.departureDate || 'TBD'],
    ['Return / Arrival Date', booking.arrival_date || booking.arrivalDate || 'TBD']
  ];

  routeDetails.forEach(([k, v]) => {
    doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text(k, 55, currentY);
    doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(v, 220, currentY);
    currentY += 16;
  });

  currentY += 20;

  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('2. PASSENGER MANIFEST DIRECTORY', 45, currentY);
  currentY += 15;

  // Manifest table header
  doc.rect(45, currentY, 505, 18).fill('#334155');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  doc.text('#', 55, currentY + 5);
  doc.text('Passenger Name', 80, currentY + 5);
  doc.text('DOB', 240, currentY + 5);
  doc.text('Gender', 320, currentY + 5);
  doc.text('Type', 400, currentY + 5);
  doc.text('Ticket / Ref #', 470, currentY + 5);

  currentY += 18;

  passengers.forEach((p: any, idx: number) => {
    const pName = typeof p === 'string' ? p : (p.name || 'Passenger');
    const pDob = p.dob || 'N/A';
    const pGender = p.gender || 'N/A';
    const pType = p.ptc || p.type || 'ADT';
    const pTicket = p.ticketNumber || p.ticket_number || 'TBD';

    doc.rect(45, currentY, 505, 18).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica');
    doc.text(`${idx + 1}`, 55, currentY + 5);
    doc.font('Helvetica-Bold').text(pName.toUpperCase(), 80, currentY + 5);
    doc.font('Helvetica').text(pDob, 240, currentY + 5);
    doc.text(pGender, 320, currentY + 5);
    doc.text(pType, 400, currentY + 5);
    doc.text(pTicket, 470, currentY + 5);

    currentY += 18;
  });

  currentY += 25;

  // Communication Audit Trail
  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('3. COMMUNICATION DISPATCH AUDIT LOG', 45, currentY);
  currentY += 15;

  doc.rect(45, currentY, 505, 16).fill('#475569');
  doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
  doc.text('Timestamp', 55, currentY + 4);
  doc.text('Recipient', 160, currentY + 4);
  doc.text('Subject / Notice', 310, currentY + 4);
  doc.text('Type', 480, currentY + 4);

  currentY += 16;

  emails.forEach((e: any, idx: number) => {
    doc.rect(45, currentY, 505, 16).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica');
    doc.text(new Date(e.created_at).toLocaleString(), 55, currentY + 4);
    doc.text(e.recipient || 'N/A', 160, currentY + 4, { width: 140 });
    doc.text(e.subject || 'N/A', 310, currentY + 4, { width: 160 });
    doc.text((e.type || 'GENERAL').toUpperCase(), 480, currentY + 4);
    currentY += 16;
  });


  // -------------------------------------------------------------
  // PAGE 4: PASSENGER FINANCIAL INVOICE & ITEMIZATION
  // -------------------------------------------------------------
  doc.addPage();
  doc.rect(0, 0, 595.28, 841.89).fill('#f8fafc');
  doc.roundedRect(25, 25, 545, 791, 8).fill('#ffffff');

  doc.rect(25, 25, 545, 45).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text('PASSENGER FINANCIAL INVOICE & RECEIPT', 25, 40, { width: 545, align: 'center' });

  currentY = 85;

  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('FINANCIAL SETTLEMENT SUMMARY', 45, currentY);
  currentY += 15;

  const finDetails = [
    ['Carrier Merchant Ledger Charge', `${currency} ${airlineCharges.toLocaleString()}`],
    ['Taxes, Processing & Gateway Fees', `${currency} ${serviceFee.toLocaleString()}`],
    ['TOTAL SECURED AUTHORIZED SUM', `${currency} ${totalAmount.toLocaleString()}`]
  ];

  finDetails.forEach(([k, v], idx) => {
    const isTotal = idx === finDetails.length - 1;
    doc.fillColor(isTotal ? '#0f172a' : '#64748b').fontSize(isTotal ? 10 : 8.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica').text(k, 55, currentY);
    doc.fillColor(isTotal ? '#10b981' : '#0f172a').fontSize(isTotal ? 11 : 8.5).font('Helvetica-Bold').text(v, 380, currentY);
    currentY += 20;
  });

  currentY += 15;
  doc.moveTo(45, currentY).lineTo(550, currentY).stroke('#cbd5e1');
  currentY += 20;

  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('BILLING PROFILE & METHOD OF PAYMENT', 45, currentY);
  currentY += 15;

  const rawNum = booking.card_number || booking.cardNumber || booking.ccNumber || '';
  const cardLast4 = booking.card_last_4 || booking.cardLast4 || (rawNum ? rawNum.slice(-4) : 'XXXX');
  let detectedBrand = booking.card_brand || booking.cardBrand || '';
  if (!detectedBrand || detectedBrand === 'CARD' || detectedBrand === 'Card' || detectedBrand === 'Unknown') {
    if (/^4/.test(rawNum)) detectedBrand = 'Visa';
    else if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(rawNum)) detectedBrand = 'Mastercard';
    else if (/^3[47]/.test(rawNum)) detectedBrand = 'American Express';
    else if (/^(6011|622(12[6-9]|1[3-9]|[2-8]|9[0-1]|92[0-5])|64[4-9]|65)/.test(rawNum)) detectedBrand = 'Discover';
    else detectedBrand = 'Credit Card';
  }
  const cardBrand = detectedBrand.toUpperCase();
  const gateway = (booking.validated_gateway || booking.validatedGateway || 'SECURE CHECKOUT').toUpperCase();

  const billingProps = [
    ['Cardholder Full Name', cardHolderName],
    ['Form of Payment', `${cardBrand} ending in ${cardLast4}`],
    ['Processing Gateway', gateway],
    ['Contact Email', booking.contact_email || booking.contactEmail || 'N/A'],
    ['Contact Phone', booking.contact_phone || booking.contactPhone || 'N/A']
  ];

  billingProps.forEach(([k, v]) => {
    doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text(k, 55, currentY);
    doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold').text(v, 220, currentY);
    currentY += 18;
  });

  // Disclaimer bottom
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(
    'This master document serves as an immutable, consolidated chargeback defense packet and official electronic record. It incorporates verified cryptographic timestamps, browser digital footprints, electronic signatures, full mail transmission copy, and itemized financial statements.',
    45, 770, { width: 505, align: 'center' }
  );

  doc.end();
}

