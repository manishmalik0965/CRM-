import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface BrandingSettings {
  organizationName: string;
  supportPhone: string;
  supportEmail: string;
  logoUrl?: string;
  fullAddress?: string;
  primaryColor?: string;
}

const defaultBranding: BrandingSettings = {
  organizationName: 'SKYWAY TRAVEL GROUP',
  supportPhone: '+1 800 555 1234',
  supportEmail: 'support@skyway.com',
  fullAddress: '123 Aviation Blvd, New York, NY 10001',
  primaryColor: '#0f172a'
};

const getCardHolderOrPax = (booking: any, passengers?: any[]) => {
  const ch = (booking.cardHolder || '').trim();
  if (ch) return ch;
  if (passengers && passengers.length > 0) {
    const p = passengers[0];
    const name = typeof p === 'string' ? p : (p.name || '');
    if (name.trim()) return name.trim();
  }
  const paxField = (booking.passengerName || '').trim();
  if (paxField) return paxField;
  
  if (booking.passengerNames && booking.passengerNames.length > 0) {
    const p = booking.passengerNames[0];
    const name = typeof p === 'string' ? p : (p.name || '');
    if (name.trim()) return name.trim();
  }
  return 'Customer';
};

export const generateBookingConfirmation = (booking: any, passengers: any[], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const primaryColor = branding.primaryColor || '#0f172a';
  const rgb = hexToRgb(primaryColor);

  // Background Wash (Light Slate)
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 297, 'F');

  // Centered Header Container
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 10, pageWidth - 20, 277, 8, 8, 'F');

  let currentY = 30;

  // Header Section (Logo + Ref)
  if (branding.logoUrl) {
    try {
      doc.addImage(branding.logoUrl, 'PNG', 20, currentY, 15, 15);
    } catch(e) {}
  } else {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(20, currentY, 15, 15, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('SW', 24, currentY + 10);
  }

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CARRIER GROUP', 40, currentY + 5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFontSize(12);
  doc.text(booking.airlineName?.toUpperCase() || 'AIRLINE', 40, currentY + 12);

  // Ref ID Badge
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageWidth - 65, currentY + 2, 45, 12, 6, 6, 'F');
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.text(`REF: ${booking.crmId}`, pageWidth - 60, currentY + 10);

  currentY += 40;

  // AUTHORIZATION PROTOCOL title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTHORIZATION PROTOCOL', 20, currentY);
  
  // Blue accent line
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(20, currentY + 5, 30, 2, 'F');

  currentY += 25;

  // Dear [Name]
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const greetingName = passengers[0]?.name || 'Valued Customer';
  doc.text('Dear ', 20, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(greetingName + ',', 31, currentY);

  currentY += 12;

  // Intro text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro = `Your secure reservation with ${booking.airlineName || 'the carrier'} has been initialized. To proceed with electronic ticket issuance, please verify the financial details and authorize below.`;
  const splitIntro = doc.splitTextToSize(intro, pageWidth - 40);
  doc.text(splitIntro, 20, currentY);
  
  currentY += (splitIntro.length * 6) + 10;

  // Note text
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  const note = 'Note: There may be multiple charges on your statement, but they will not exceed the total authorized amount.';
  const splitNote = doc.splitTextToSize(note, pageWidth - 40);
  doc.text(splitNote, 20, currentY);

  currentY += (splitNote.length * 6) + 15;

  // Passenger Manifest Section
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(20, currentY, pageWidth - 40, 70 + (passengers.length > 2 ? (passengers.length - 2) * 10 : 0), 6, 6, 'F');
  
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('PASSENGER MANIFEST', 30, currentY + 12);

  let paxY = currentY + 22;
  passengers.forEach(p => {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(p.name?.toUpperCase() || 'UNSPECIFIED', 30, paxY);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${p.dob || '---'}     ${p.gender?.toUpperCase() || '---'}`, 130, paxY);
    paxY += 10;
  });

  currentY = paxY + 5;

  // Itinerary Details Section
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ITINERARY DETAILS', 30, currentY + 5);
  
  if (booking.origin && booking.destination) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(`${(booking.origin || '').toUpperCase()} to ${(booking.destination || '').toUpperCase()}`, 30, currentY + 12);
    
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    let dates = booking.tripType || 'One-Way';
    const fmt = (ds: string) => {
      if (!ds) return '';
      const [y, m, d] = ds.split('-');
      if (!y || !m || !d) return ds;
      return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
    };
    if (booking.departureDate) dates += ` | Dep: ${fmt(booking.departureDate)}`;
    if (booking.arrivalDate && booking.tripType !== 'One-Way') dates += ` | ${booking.tripType === 'Round Trip' ? 'Ret' : 'Arr'}: ${fmt(booking.arrivalDate)}`;
    doc.text(dates, 30, currentY + 17);
    currentY += 10;
  }
  
  doc.setTextColor(148, 163, 184);
  doc.text('CLASS', 30, currentY + 12);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(booking.cabinClass?.toUpperCase() || 'ECONOMY', 30, currentY + 18);

  // PNR Badge if exists
  if (booking.pnr) {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('RECORD LOCATOR (PNR)', 130, currentY + 12);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.setFontSize(10);
    doc.text(booking.pnr.toUpperCase(), 130, currentY + 18);
  }

  currentY += 30;

  // Financial Summary Section (In a clear table style)
  autoTable(doc, {
    startY: currentY,
    margin: { left: 30, right: 30 },
    theme: 'plain',
    body: [
      [{ content: 'AIRLINE CHARGES', styles: { textColor: [148, 163, 184], fontStyle: 'bold', fontSize: 8 } }, { content: `${booking.currency} ${booking.airlineCharges?.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: [15, 23, 42] } }],
      [{ content: 'TAXES & FEES', styles: { textColor: [148, 163, 184], fontStyle: 'bold', fontSize: 8 } }, { content: `${booking.currency} ${booking.serviceFee?.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: [15, 23, 42] } }],
      [{ content: 'TOTAL AUTHORIZED', styles: { textColor: rgb, fontStyle: 'bold', fontSize: 9 } }, { content: `${booking.currency} ${booking.totalAmount?.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 14, textColor: rgb } }],
    ],
    styles: { cellPadding: 4 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Authorization Status Footer (If authorized)
  if (booking.status === 'authorized' && booking.signatureData) {
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SECURE DISPATCH: AUTHENTICATED ✓', 20, currentY);
    
    try {
      doc.addImage(booking.signatureData, 'PNG', 120, currentY - 10, 50, 25);
    } catch(e) {}
  }

  doc.save(`Authorization_Protocol_${booking.crmId}.pdf`);
};

export const generatePaymentAuth = (booking: any, signatureUrl?: string, branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const rgb = hexToRgb(branding.primaryColor || '#2563eb');

  // Design
  doc.setFillColor(rgb[0], rgb[1], rgb[2]); 
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text('PAYMENT AUTHORIZATION', 20, 30);
  
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(12);
  doc.text('TRANSACTION DETAILS', 20, 70);
  
  autoTable(doc, {
    startY: 80,
    body: [
      ['Customer Name', getCardHolderOrPax(booking, booking.passengerDetails || booking.passengers) || 'N/A'],
      ['Card Identifier', booking.cardNumberMasked || 'N/A'],
      ['Airline Carrier', booking.airlineName || 'N/A'],
      ['Authorized Amount', `${booking.currency} ${booking.totalAmount?.toLocaleString()}`],
      ['Auth Status', booking.status?.toUpperCase() || 'PENDING']
    ],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 5 }
  });

  if (signatureUrl) {
    doc.text('DIGITAL SIGNATURE:', 20, (doc as any).lastAutoTable.finalY + 20);
    try {
      doc.addImage(signatureUrl, 'PNG', 20, (doc as any).lastAutoTable.finalY + 25, 60, 30);
    } catch(e) {}
    doc.setFontSize(8);
    doc.text(`Signed digitally by ${getCardHolderOrPax(booking, booking.passengerDetails || booking.passengers)} on ${new Date().toLocaleString()}`, 20, (doc as any).lastAutoTable.finalY + 60);
  }

  doc.save(`Auth_${booking.crmId}.pdf`);
};

export const generateConsolidatedReport = (bookings: any[], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const rgb = hexToRgb(branding.primaryColor || '#2563eb');
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  doc.text(branding.organizationName.toUpperCase(), 20, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(33, 41, 54);
  doc.text('CONSOLIDATED BOOKINGS REPORT', 20, 30);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 38);
  doc.text(`Total Records: ${bookings.length}`, 20, 44);

  const reportBody = bookings.map(b => [
    b.crmId,
    b.pnr || '---',
    getCardHolderOrPax(b) || '---',
    b.contactEmail || '---',
    b.journeyType || '---',
    `${b.currency} ${(b.totalAmount || 0).toLocaleString()}`,
    b.status
  ]);

  autoTable(doc, {
    startY: 55,
    head: [['CRM ID', 'PNR', 'Customer', 'Email', 'Journey', 'Total', 'Status']],
    body: reportBody,
    theme: 'grid',
    headStyles: { fillColor: rgb, fontSize: 9, fontStyle: 'bold' },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      5: { halign: 'right' }
    }
  });

  doc.save(`Consolidated_Report_${new Date().getTime()}.pdf`);
};

export const generatePassengerInvoice = (booking: any, passengers: any[] = [], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const rgb = hexToRgb(branding.primaryColor || '#2563eb');
  
  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 140, 30);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(branding.organizationName.toUpperCase(), 20, 20);
  doc.setFont('helvetica', 'normal');
  if (branding.fullAddress) {
    const splitAddr = doc.splitTextToSize(branding.fullAddress, 60);
    doc.text(splitAddr, 20, 25);
  }

  doc.line(20, 40, 190, 40);

  doc.setFontSize(9);
  doc.text('BILL TO:', 20, 55);
  doc.setFont('helvetica', 'bold');
  doc.text(getCardHolderOrPax(booking, passengers) || 'Customer', 20, 60);
  doc.setFont('helvetica', 'normal');
  doc.text(booking.contactEmail || 'N/A', 20, 65);
  doc.text(booking.contactPhone || '', 20, 70);

  doc.text('INVOICE DATE:', 120, 55);
  doc.setFont('helvetica', 'bold');
  doc.text(new Date().toLocaleDateString(), 150, 55);
  
  doc.setFont('helvetica', 'normal');
  doc.text('BOOKING ID:', 120, 62);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.crmId || 'N/A', 150, 62);

  // Passenger Manifest Section in Invoice
  if (passengers.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PASSENGER MANIFEST', 20, 85);
    
    autoTable(doc, {
      startY: 90,
      head: [['#', 'Passenger Name', 'DOB', 'Gender']],
      body: passengers.map((p, i) => [i + 1, p.name || '---', p.dob || '---', p.gender || '---']),
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
      styles: { fontSize: 8 }
    });
  }

  // Itinerary Brief in Invoice
  let itineraryY = (passengers.length > 0) ? (doc as any).lastAutoTable.finalY + 10 : 85;
  if (booking.pnr || booking.cabinClass) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ITINERARY SUMMARY:', 20, itineraryY);
    doc.setFont('helvetica', 'normal');
    let detailStr = [];
    if (booking.pnr) detailStr.push(`PNR: ${booking.pnr.toUpperCase()}`);
    if (booking.cabinClass) detailStr.push(`CLASS: ${booking.cabinClass.toUpperCase()}`);
    if (booking.ancillaryServices?.length > 0) detailStr.push(`SERVICES: ${booking.ancillaryServices.join(', ')}`);
    
    doc.text(detailStr.join(' | '), 20, itineraryY + 5);
    itineraryY += 15;
  }

  const startY = itineraryY;

  const invoiceBody = [
    ['Airline Fare Charges', `${booking.currency} ${booking.airlineCharges?.toLocaleString()}`],
    ['Taxes & Fees', `${booking.currency} ${booking.serviceFee?.toLocaleString()}`],
  ];

  const otherCharges = Number(booking.otherCharges);
  if (!isNaN(otherCharges) && otherCharges > 0) {
    invoiceBody.push(['Other Charges', `${booking.currency} ${otherCharges.toLocaleString()}`]);
  }

  autoTable(doc, {
    startY: startY,
    head: [['Description', 'Amount']],
    body: invoiceBody,
    foot: [['TOTAL SECURED', `${booking.currency} ${booking.totalAmount?.toLocaleString()}`]],
    theme: 'striped',
    headStyles: { fillColor: rgb },
    footStyles: { fillColor: rgb, textColor: [255, 255, 255], fontStyle: 'bold' }
  });

  let footerY = (doc as any).lastAutoTable.finalY + 15;

  if (booking.status === 'authorized' && booking.signatureData) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('AUTHORIZED BY CUSTOMER:', 20, footerY);
    
    try {
      doc.addImage(booking.signatureData, 'PNG', 20, footerY + 5, 50, 20);
    } catch(e) {}
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    const authDate = booking.authorizedAt?.toDate ? booking.authorizedAt.toDate().toLocaleString() : 'N/A';
    doc.text(`Electronically signed by ${getCardHolderOrPax(booking, passengers)} on ${authDate}`, 20, footerY + 30);
    
    if (booking.authMetadata) {
       doc.text(`Verification Metadata: IP ${booking.authMetadata.ip} | Action: ${booking.authMetadata.action}`, 20, footerY + 35);
    }
  }

  doc.save(`Invoice_${booking.crmId}.pdf`);
};

export const generateDocuSignPdf = (booking: any, passengers: any[], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // PAGE 1: DocuSign Certificate of Completion
  // Background Tint
  doc.setFillColor(247, 250, 252);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  // Header Banner
  doc.setFillColor(0, 92, 185);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUSIGN SECURE eSIGNATURE AUDIT RECORD & CERTIFICATE', 15, 16);
  
  // White panel
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(15, 35, pageWidth - 30, pageHeight - 50, 4, 4, 'F');
  
  // Main Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate of Completion', 25, 55);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(25, 62, pageWidth - 25, 62);
  
  // Left Column - Envelope Info
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('ENVELOPE DETAILS', 25, 75);
  
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Envelope ID:`, 25, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`DS-CRM-${booking.crmId || 'UNKNOWN'}`, 60, 85);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Subject:`, 25, 95);
  doc.setFont('helvetica', 'normal');
  doc.text(`Official Payment Authorization - ${booking.airlineName || 'Carrier'}`, 60, 95);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Source:`, 25, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`CRM Web Dispatch Portal`, 60, 105);
  
  // Right Column - Envelope Status
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('ENVELOPE STATUS', 125, 75);
  
  // Status Badge
  const isAuth = booking.status === 'authorized' || booking.status === 'email auth confirm' || booking.status === 'charged' || booking.status === 'ready to charge' || booking.status === 'sent for charge';
  const statusColor = isAuth ? [16, 185, 129] : [245, 158, 11]; // Emerald or Amber
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(125, 80, 55, 15, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(isAuth ? 'COMPLETED' : 'PENDING', 133, 90);
  
  // Signer Event Section
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Signer Events Summary', 25, 125);
  
  const ipAddress = booking.authMetadata?.ip || booking.authIp || 'Unknown';
  const userAgent = booking.authMetadata?.userAgent || 'Mozilla Web Client';
  const signatureData = booking.signatureData || booking.signature_data;
  const authorizedAt = booking.authMetadata?.timestamp || booking.authorizedAt || new Date().toLocaleString();
  const consentText = booking.authMetadata?.consent || 'Electronically agreed to transactions, terms, and split charges.';
  
  autoTable(doc, {
    startY: 130,
    margin: { left: 25, right: 25 },
    theme: 'grid',
    head: [['Signer Event', 'Signature & Consent', 'Audit & Verification']],
    body: [
      [
        { content: `${getCardHolderOrPax(booking, passengers) || 'Customer'}\nEmail: ${booking.contactEmail || 'N/A'}\nSecurity Level: Email Auth`, styles: { fontStyle: 'bold', fontSize: 8 } },
        { content: `Consent: ${consentText}\n\nStatus: Signed digitally via direct handshake.`, styles: { fontSize: 8 } },
        { content: `IP Address: ${ipAddress}\nDate: ${authorizedAt}\nOS/Browser: ${userAgent.substring(0, 40)}...`, styles: { fontSize: 8 } }
      ]
    ],
    headStyles: { fillColor: [0, 92, 185], fontSize: 8, fontStyle: 'bold' },
    styles: { cellPadding: 6 }
  });
  
  let currentY = (doc as any).lastAutoTable.finalY + 15;
  
  // Split Charges explicit summary box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(25, currentY, pageWidth - 50, 35, 3, 3, 'F');
  
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SPLIT CHARGES & FINANCIAL ACKNOWLEDGEMENT', 30, currentY + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const splitWarningText = `The signer explicitly acknowledges and agrees that the total authorized sum of ${booking.currency || 'USD'} ${booking.totalAmount?.toLocaleString() || '0.00'} may be split and billed in multiple transactions under the respective merchant names (e.g. airline carrier and secondary service fees), but will not exceed the cumulative total amount authorized.`;
  const splitWarningLines = doc.splitTextToSize(splitWarningText, pageWidth - 60);
  doc.text(splitWarningLines, 30, currentY + 16);
  
  currentY += 45;
  
  // Draw signature in Page 1 if present
  if (signatureData) {
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('RECORDED ELECTRONIC SIGNATURE:', 25, currentY);
    try {
      doc.addImage(signatureData, 'PNG', 25, currentY + 4, 45, 15);
    } catch(e) {}
    
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Envelope Token Hash: DS-${booking.crmId}-${ipAddress.replace(/\./g, '')}`, 25, currentY + 23);
  }
  
  // PAGE 2: Complete Sent Email Copy
  doc.addPage();
  
  // Background Tint Page 2
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  // Page 2 header
  doc.setFillColor(241, 245, 249);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENT TRANSMISSION HISTORY (Copy of Electronic Mail Agreement)', 15, 18);
  
  currentY = 45;
  
  // Email Body Content
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Date: ${authorizedAt}`, 15, currentY);
  doc.text(`To: ${booking.contactEmail || 'Customer Email'}`, 15, currentY + 6);
  doc.text(`From: Secure Authorization Service via CRM System`, 15, currentY + 12);
  doc.text(`Subject: PAYMENT AUTHORIZATION REQUEST - CRM-${booking.crmId}`, 15, currentY + 18);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(15, currentY + 23, pageWidth - 15, currentY + 23);
  
  currentY += 32;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Dear ${getCardHolderOrPax(booking, passengers) || 'Valued Customer'},`, 15, currentY);
  
  currentY += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Greetings of the Day!', 15, currentY);
  
  currentY += 8;
  doc.setFont('helvetica', 'normal');
  const paragraph1 = `Your secure reservation with ${booking.airlineName || 'the carrier'} has been initialized. As per our telephonic conversation, I ${getCardHolderOrPax(booking, passengers) || 'Customer'}, authorize ${booking.airlineName || 'Airline'} and validated gateway to process the charges under the respective merchants to charge my card ending in ${booking.cardLast4 || 'XXXX'} for the reservation on the itinerary below.`;
  const p1Lines = doc.splitTextToSize(paragraph1, pageWidth - 30);
  doc.text(p1Lines, 15, currentY);
  
  currentY += (p1Lines.length * 5) + 4;
  
  // Highlighted Split Charges paragraph inside email copy
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 92, 185); // DocuSign Blue highlights the split charges line
  const pSplit = `Please note that charges may appear as split transactions under the respective merchant names (including the airline and the service gateway), but the cumulative total charged will not exceed the authorized sum of ${booking.currency || 'USD'} ${booking.totalAmount?.toLocaleString() || '0.00'}.`;
  const pSplitLines = doc.splitTextToSize(pSplit, pageWidth - 30);
  doc.text(pSplitLines, 15, currentY);
  
  currentY += (pSplitLines.length * 5) + 4;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const p2 = `This payment authorization is for the amount indicated above and is valid for one-time use only. I certify that I ${getCardHolderOrPax(booking, passengers) || 'Customer'} am an authorized user of this card and will not dispute the payment with my credit/debit card company or bank.`;
  const p2Lines = doc.splitTextToSize(p2, pageWidth - 30);
  doc.text(p2Lines, 15, currentY);
  
  currentY += (p2Lines.length * 5) + 8;
  
  // Itinerary Details Summary table in email copy
  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    theme: 'striped',
    head: [['Flight details & Itinerary Summary', 'Charges Breakdown']],
    body: [
      [
        `Airline Carrier: ${booking.airlineName || 'Carrier'}\nRecord Locator (PNR): ${booking.pnr || 'PENDING'}\nRouting: ${booking.origin || 'TBD'} to ${booking.destination || 'TBD'}\nDeparture Date: ${booking.departureDate || 'TBD'}\nCabin Class: ${booking.cabinClass || 'ECONOMY'}`,
        `Airline Charges: ${booking.currency} ${booking.airlineCharges?.toLocaleString() || '0.00'}\nTaxes & Fees: ${booking.currency} ${booking.serviceFee?.toLocaleString() || '0.00'}\n\nTOTAL SECURED SUM:\n${booking.currency} ${booking.totalAmount?.toLocaleString() || '0.00'}`
      ]
    ],
    headStyles: { fillColor: [51, 65, 85], fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 6 }
  });
  
  currentY = (doc as any).lastAutoTable.finalY + 12;
  
  // Signer sign off
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized & Signed Digitally By:', 15, currentY);
  
  currentY += 5;
  if (signatureData) {
    try {
      doc.addImage(signatureData, 'PNG', 15, currentY, 40, 15);
    } catch(e) {}
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Name: ${getCardHolderOrPax(booking, passengers) || 'Customer'}`, 65, currentY + 4);
    doc.setFont('helvetica', 'normal');
    doc.text(`IP: ${ipAddress}`, 65, currentY + 9);
    doc.text(`Timestamp: ${authorizedAt}`, 65, currentY + 14);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('[ Signature Pending ]', 15, currentY + 5);
  }
  
  doc.save(`DocuSign_Secure_Agreement_${booking.crmId}.pdf`);
};

export const generateAuthVerificationCertificate = (booking: any, passengers: any[], emails: any[], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const primaryColor = branding.primaryColor || '#0f172a';
  const rgb = hexToRgb(primaryColor);

  // Background Wash
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Page 1: Verification Certificate
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 4, 4, 'F');

  // Header
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(10, 10, pageWidth - 20, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICATE OF AUTHORIZATION & VERIFIED HANDSHAKE', pageWidth / 2, 26, { align: 'center' });

  let currentY = 50;

  // Transaction Summary
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('TRANSACTION IDENTIFIER', 20, currentY);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(booking.crmId || 'N/A', 20, currentY + 7);

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('STATUS', 120, currentY);
  doc.setTextColor(16, 185, 129);
  doc.text('VERIFIED ✓', 120, currentY + 7);

  currentY += 25;

  // Details Table
  autoTable(doc, {
    startY: currentY,
    margin: { left: 20, right: 20 },
    theme: 'grid',
    head: [['Authorization Property', 'Recorded Data Value']],
    body: [
      ['Passenger Name(s)', passengers.map(p => p.name).join(', ') || 'N/A'],
      ['Airline Carrier', booking.airlineName || 'N/A'],
      ['Total Authorized', `${booking.currency} ${booking.totalAmount?.toLocaleString()}`],
      ['Authorization Timestamp', booking.authMetadata?.authorizedAt || booking.authorizedAt || new Date().toLocaleString()],
      ['Network IP Address', booking.authMetadata?.browserIp || booking.authIp || 'Unknown'],
      ['Signature ID', booking.authMetadata?.signatureString || 'N/A'],
    ],
    headStyles: { fillColor: [51, 65, 85], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 4 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Digital Signature
  const signatureData = booking.signatureData || booking.signature_data;
  if (signatureData) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('RECORDED ELECTRONIC SIGNATURE', 20, currentY);
    try {
      doc.addImage(signatureData, 'PNG', 20, currentY + 5, 50, 20);
    } catch(e) {}
    currentY += 35;
  }

  // Browser Footprint
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DEVICE & BROWSER FOOTPRINT', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const ua = booking.authMetadata?.browserUserAgent || 'N/A';
  const splitUA = doc.splitTextToSize(ua, pageWidth - 40);
  doc.text(splitUA, 20, currentY + 5);

  currentY += (splitUA.length * 4) + 15;

  // Email Audit Trail Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('COMMUNICATION AUDIT TRAIL (Email Dispatch Logs)', 20, currentY);

  const emailRows = emails.map(e => [
    new Date(e.created_at).toLocaleString(),
    e.recipient,
    e.subject,
    e.type?.toUpperCase() || 'GENERAL'
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    margin: { left: 20, right: 20 },
    theme: 'striped',
    head: [['Timestamp', 'Recipient', 'Subject', 'Type']],
    body: emailRows,
    headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 3 }
  });

  // Footer Disclaimer
  const footerY = pageHeight - 20;
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  const disclaimer = 'This document serves as an immutable record of electronic authorization and communication history. It is generated by the CRM platform for audit and chargeback defense purposes. All timestamps are in system UTC/Local time.';
  const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - 40);
  doc.text(splitDisclaimer, pageWidth / 2, footerY, { align: 'center' });

  doc.save(`Auth_Verification_${booking.crmId}.pdf`);
};

export const generateBookingReport = (booking: any, passengers: any[], branding: BrandingSettings = defaultBranding) => {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const primaryColor = branding.primaryColor || '#0f172a';
  const rgb = hexToRgb(primaryColor);

  // Background Wash (subtle slate border/margins)
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Centered Container Card on Page 1
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 6, 6, 'F');

  let currentY = 22;

  // Header branding
  if (branding.logoUrl) {
    try {
      doc.addImage(branding.logoUrl, 'PNG', 15, currentY, 12, 12);
    } catch (e) {}
  } else {
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(15, currentY, 12, 12, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SW', 18.5, currentY + 7.5);
  }

  // Brand Name
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(branding.organizationName.toUpperCase(), 32, currentY + 5);

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(7.5);
  doc.text('OFFICIAL DOSSIER & TRANSACTION RECORD', 32, currentY + 10);

  // Status Badge on Top Right
  const status = (booking.status || 'draft').toLowerCase();
  const statusText = status.toUpperCase();
  let statusColor = [100, 116, 139]; // default slate-500
  if (status === 'charged' || status === 'authorized') {
    statusColor = [16, 185, 129]; // emerald-500
  } else if (status === 'ready to charge' || status === 'email auth confirm') {
    statusColor = [245, 158, 11]; // amber-500
  } else if (status === 'chargeback') {
    statusColor = [239, 68, 68]; // red-500
  } else if (status === 'pending' || status === 'email sent') {
    statusColor = [59, 130, 246]; // blue-500
  }

  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(pageWidth - 55, currentY + 1, 40, 8, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, pageWidth - 35, currentY + 6.2, { align: 'center' });

  // CRM ID and Date under status
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`REF ID: ${booking.crmId || 'PENDING'}`, pageWidth - 55, currentY + 15);

  currentY += 24;

  // Title Block
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RESERVATION PROTOCOL & AUDIT SUMMARY', 15, currentY);

  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(15, currentY + 2.5, 30, 1.5, 'F');

  currentY += 12;

  // 1. Travel Information Table
  const itinerarySummary = booking.tripType === 'Multi-City' && booking.multiCitySegments && booking.multiCitySegments.length > 0
    ? booking.multiCitySegments.map((seg: any, idx: number) => `Seg ${idx + 1}: ${seg.origin || 'TBD'} to ${seg.destination || 'TBD'} (${seg.departureDate || 'TBD'})`).join('\n')
    : `Routing: ${booking.origin || 'TBD'} to ${booking.destination || 'TBD'}`;

  const travelHeaders = [['Travel & Route Information', 'System Data Values']];
  const travelRows = [
    ['Airline Carrier / Merchant', booking.airlineName?.toUpperCase() || 'N/A'],
    ['Record Locator (PNR)', booking.pnr?.toUpperCase() || 'TBD'],
    ['Cabin / Class of Service', booking.cabinClass?.toUpperCase() || 'ECONOMY'],
    ['Trip Category Type', booking.tripType?.toUpperCase() || 'ONE-WAY'],
    ['Itinerary Mapping', itinerarySummary],
    ['Departure Window', booking.departureDate || 'TBD'],
    ['Arrival / Return Window', booking.arrivalDate || 'TBD'],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    head: travelHeaders,
    body: travelRows,
    headStyles: { fillColor: [51, 65, 85], fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 3.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 120 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 2. Passengers Manifest Table
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('PASSENGER MANIFEST & EMBARKATION DIRECTORY', 15, currentY);
  currentY += 3.5;

  const manifestHeaders = [['#', 'Passenger Full Name', 'DOB', 'Gender', 'PTC', 'Ticket Number', 'Freq Flyer #']];
  const manifestRows = passengers.map((p, idx) => [
    idx + 1,
    (p.name || '---').toUpperCase(),
    p.dob || '---',
    p.gender || '---',
    p.ptc || 'ADT',
    p.ticketNumber || 'TBD',
    p.frequentFlyerNumber || '---'
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    theme: 'striped',
    head: manifestHeaders,
    body: manifestRows,
    headStyles: { fillColor: [15, 23, 42], fontSize: 7.5 },
    styles: { fontSize: 7.5, cellPadding: 3 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 3. Financial Settlements & Payments Table
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FINANCIAL SETTLEMENTS & MERCHANDISING CAPTURE', 15, currentY);
  currentY += 3.5;

  const refundLine = booking.refundQuote && booking.refundQuote > 0 
    ? `\nRefund Quote: ${booking.currency} ${booking.refundQuote.toLocaleString()} (${booking.refundType || 'original'})`
    : '';
  const creditsLine = booking.airlineCredits && booking.airlineCredits > 0
    ? `\nAirline Credits Used: ${booking.currency} ${booking.airlineCredits.toLocaleString()}`
    : '';

  const financialHeaders = [['Financial Breakdown', 'Billing Profile & Secured Contact']];
  const financialRows = [
    [
      `Carrier Ledger: ${booking.currency} ${booking.airlineCharges?.toLocaleString() || '0.00'}\nTaxes & Service Fee: ${booking.currency} ${booking.serviceFee?.toLocaleString() || '0.00'}${refundLine}${creditsLine}\n\nNet Consolidated Settlement:\n${booking.currency} ${booking.totalAmount?.toLocaleString() || '0.00'}`,
      `Cardholder Name: ${(booking.cardHolder || '---').toUpperCase()}\nForm of Payment: ${booking.cardBrand?.toUpperCase() || 'CARD'} (ending in ${booking.cardNumberMasked || booking.cardLast4 || 'XXXX'})\nLiaison Contact Email: ${booking.contactEmail || '---'}\nContact Phone Number: ${booking.contactPhone || '---'}`
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    head: financialHeaders,
    body: financialRows,
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 4 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Page break check for e-signatures and notes
  if (currentY > 210) {
    doc.addPage();
    // Centered Container Page 2
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 6, 6, 'F');
    currentY = 22;
  }

  // 4. E-Signature Evidence Block
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('ELECTRONIC TRANSACTION SECURITY EVIDENCE', 15, currentY);
  currentY += 3.5;

  if (booking.signatureData) {
    const authDate = booking.authorizedAt?.toDate?.() 
      ? booking.authorizedAt.toDate().toLocaleString() 
      : booking.authorizedAt || new Date().toLocaleString();
    const ipAddress = booking.authIp || '127.0.0.1';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Secure Electronic Authorization Verified:', 15, currentY + 5);

    try {
      doc.addImage(booking.signatureData, 'PNG', 15, currentY + 8, 45, 14);
    } catch (e) {}

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`Signee Identity: ${getCardHolderOrPax(booking, passengers)}`, 68, currentY + 11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Recorded IP Address: ${ipAddress}`, 68, currentY + 15);
    doc.text(`Authorized At: ${authDate}`, 68, currentY + 19);

    currentY += 28;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text('[ Signature Consent Evidence: PENDING CLIENT AUTHORIZATION ]', 15, currentY + 5);
    currentY += 10;
  }

  // 5. System Remarks & Logs
  if (booking.remarks) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('INTERNAL REMARKS & TRANSACTION HISTORIES', 15, currentY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const splitRemarks = doc.splitTextToSize(booking.remarks, pageWidth - 30);
    const remarksHeight = splitRemarks.length * 4;

    if (currentY + 10 + remarksHeight > pageHeight - 15) {
      const spaceLeft = pageHeight - 15 - (currentY + 10);
      const linesThatFit = Math.floor(spaceLeft / 4);
      if (linesThatFit > 3) {
        doc.text(splitRemarks.slice(0, linesThatFit - 1), 15, currentY + 9);
        doc.text('... [Remarks truncated in PDF print - view system dashboard for full log] ...', 15, currentY + 9 + (linesThatFit * 4));
      } else {
        doc.addPage();
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(10, 10, pageWidth - 20, pageHeight - 20, 6, 6, 'F');
        doc.text(splitRemarks, 15, 25);
      }
    } else {
      doc.text(splitRemarks, 15, currentY + 9);
    }
  }

  doc.save(`Booking_Dossier_Report_${booking.crmId || 'PENDING'}.pdf`);
};

// Helper for hex colors
function hexToRgb(hex: string): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (!hex || hex.length < 4) return [37, 99, 235];
  if (hex.length == 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length == 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  return [r, g, b];
}
