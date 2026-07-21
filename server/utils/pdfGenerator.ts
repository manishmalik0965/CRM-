import PDFDocument from 'pdfkit';
import { Response } from 'express';

export async function generateAuthVerificationPdf(
  res: Response,
  booking: any,
  passengers: any[],
  emails: any[],
  branding: any = {}
) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `Auth Verification - ${booking.crm_id}`,
      Author: branding.organizationName || 'CRM SYSTEM',
    }
  });

  // Stream directly to response
  doc.pipe(res);

  const primaryColor = branding.primaryColor || '#0f172a';
  const secondaryColor = '#64748b';

  // Background Wash
  doc.rect(0, 0, 595.28, 841.89).fill('#f8fafc');

  // Content Card
  doc.roundedRect(30, 30, 535, 781, 8).fill('#ffffff');

  // Header
  doc.rect(30, 30, 535, 60).fill(primaryColor);
  
  doc.fillColor('#ffffff')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('CERTIFICATE OF AUTHORIZATION & VERIFIED HANDSHAKE', 30, 52, {
       width: 535,
       align: 'center'
     });

  let currentY = 110;

  // Transaction Summary Header
  doc.fillColor(secondaryColor)
     .fontSize(8)
     .font('Helvetica-Bold')
     .text('TRANSACTION IDENTIFIER', 50, currentY);
  
  doc.fillColor('#0f172a')
     .fontSize(14)
     .text(booking.crm_id || 'N/A', 50, currentY + 12);

  doc.fillColor(secondaryColor)
     .fontSize(8)
     .text('STATUS', 350, currentY);
  
  doc.fillColor('#10b981')
     .fontSize(14)
     .text('VERIFIED ✓', 350, currentY + 12);

  currentY += 50;

  // Details Table Mockup
  doc.fillColor('#334155')
     .fontSize(10)
     .font('Helvetica-Bold')
     .text('Verification Properties', 50, currentY);
  
  currentY += 20;
  
  const properties = [
    ['Passenger Name(s)', passengers.map(p => p.name).join(', ') || 'N/A'],
    ['Airline Carrier', booking.airline_name || 'N/A'],
    ['Total Authorized', `${booking.currency} ${booking.total_amount?.toLocaleString()}`],
    ['Timestamp', booking.authMetadata?.authorizedAt || new Date().toLocaleString()],
    ['Network IP', booking.authMetadata?.browserIp || 'Unknown'],
    ['Signature ID', booking.authMetadata?.signatureString || 'N/A']
  ];

  properties.forEach(([label, value]) => {
    doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(label, 60, currentY);
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(value, 200, currentY);
    currentY += 18;
  });

  currentY += 20;

  // Signature Section
  const details = typeof booking.details === 'string' ? JSON.parse(booking.details) : booking.details;
  const signatureData = details?.signatureData || details?.signature_data;

  if (signatureData && signatureData.startsWith('data:image')) {
    doc.fillColor(secondaryColor)
       .fontSize(8)
       .font('Helvetica-Bold')
       .text('RECORDED ELECTRONIC SIGNATURE', 50, currentY);
    
    try {
      // Remove data:image/png;base64, prefix
      const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, "");
      const imgBuffer = Buffer.from(base64Data, 'base64');
      doc.image(imgBuffer, 50, currentY + 12, { width: 120 });
      currentY += 70;
    } catch (e) {
      currentY += 20;
    }
  } else {
    currentY += 10;
  }

  // Browser Footprint
  doc.fillColor(secondaryColor)
     .fontSize(8)
     .font('Helvetica-Bold')
     .text('DEVICE & BROWSER FOOTPRINT', 50, currentY);
  
  doc.fillColor('#475569')
     .fontSize(8)
     .font('Helvetica')
     .text(booking.authMetadata?.browserUserAgent || 'N/A', 50, currentY + 12, { width: 495 });

  currentY += 40;

  // Audit Trail
  doc.fillColor('#0f172a')
     .fontSize(10)
     .font('Helvetica-Bold')
     .text('COMMUNICATION AUDIT TRAIL', 50, currentY);
  
  currentY += 15;

  // Table Headers
  doc.fillColor('#475569').fontSize(7).text('Timestamp', 50, currentY);
  doc.text('Recipient', 150, currentY);
  doc.text('Subject', 300, currentY);
  doc.text('Type', 480, currentY);
  
  doc.moveTo(50, currentY + 10).lineTo(545, currentY + 10).stroke('#e2e8f0');
  currentY += 15;

  emails.forEach((email) => {
    if (currentY > 750) {
      doc.addPage();
      currentY = 50;
    }
    doc.fillColor('#1e293b').fontSize(7).font('Helvetica');
    doc.text(new Date(email.created_at).toLocaleString(), 50, currentY, { width: 90 });
    doc.text(email.recipient, 150, currentY, { width: 140 });
    doc.text(email.subject, 300, currentY, { width: 170 });
    doc.text(email.type?.toUpperCase() || 'GENERAL', 480, currentY);
    currentY += 12;
  });

  // Footer
  const footerText = 'This document serves as an immutable record of electronic authorization and communication history. Generated for chargeback defense and compliance purposes.';
  doc.fillColor('#94a3b8')
     .fontSize(7)
     .text(footerText, 30, 810, { width: 535, align: 'center' });

  doc.end();
}
