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
      [{ content: 'SERVICE/TAXES', styles: { textColor: [148, 163, 184], fontStyle: 'bold', fontSize: 8 } }, { content: `${booking.currency} ${booking.serviceFee?.toLocaleString()}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: [15, 23, 42] } }],
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
      ['Customer Name', booking.cardHolder || 'N/A'],
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
    doc.text(`Signed digitally by ${booking.cardHolder} on ${new Date().toLocaleString()}`, 20, (doc as any).lastAutoTable.finalY + 60);
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
    b.cardHolder || '---',
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
  doc.text(booking.cardHolder || 'Customer', 20, 60);
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
    ['Professional Service Fee', `${booking.currency} ${booking.serviceFee?.toLocaleString()}`],
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
    doc.text(`Electronically signed by ${booking.cardHolder} on ${authDate}`, 20, footerY + 30);
    
    if (booking.authMetadata) {
       doc.text(`Verification Metadata: IP ${booking.authMetadata.ip} | Action: ${booking.authMetadata.action}`, 20, footerY + 35);
    }
  }

  doc.save(`Invoice_${booking.crmId}.pdf`);
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
