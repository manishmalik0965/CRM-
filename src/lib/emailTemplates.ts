export interface EmailBranding {
  organizationName: string;
  logoUrl?: string;
  primaryColor?: string;
  supportPhone?: string;
  supportEmail?: string;
  fullAddress?: string;
  customCss?: string;
  customFooterHtml?: string;
  emailTemplates?: {
    [key in EmailTemplateType]?: {
      title?: string;
      introText?: string;
    }
  };
}

export interface EmailData {
  crmId: string;
  airlineName: string;
  passengerName: string;
  totalAmount: number;
  currency: string;
  airlineDomain?: string;
  authLink?: string;
  airlineCharges?: number;
  serviceFee?: number;
  refundQuote?: number;
  airlineCredits?: number;
  origin?: string;
  destination?: string;
  multiCitySegments?: { origin: string, destination: string, departureDate: string }[];
  validatedGateway?: string;
  packageRichText?: string;
  branding?: EmailBranding;
  appUrl?: string;
  snapshotUrl?: string;
  passengers?: any[];
  contact?: any;
  pnr?: string;
  oldPnr?: string;
  modificationDetails?: string;
  authEmail?: string;
  authIp?: string;
  signatureUrl?: string;
  cabinClass?: string;
  tripType?: string;
  departureDate?: string;
  arrivalDate?: string;
  cardHolderName?: string;
  cardLast4?: string;
}

export type EmailTemplateType = 'auth' | 'confirmation' | 'refund' | 'cancel' | 'changes';

export const generateEmailTemplate = (type: EmailTemplateType, data: EmailData) => {
  const { branding } = data;
  data.airlineName = (data.airlineName || 'Airline').toUpperCase();
  data.passengerName = (data.passengerName || 'Passenger').toUpperCase();
  data.cardHolderName = (data.cardHolderName || data.passengerName || 'VALUED CUSTOMER').toUpperCase();
  data.pnr = data.pnr ? data.pnr.toUpperCase() : '';
  data.oldPnr = data.oldPnr ? data.oldPnr.toUpperCase() : '';
  data.crmId = data.crmId ? data.crmId.toUpperCase() : '';
  
  const orgName = branding?.organizationName || 'SKYWAY TRAVEL GROUP';
  const logoUrl = branding?.logoUrl || '';
  
  // Theme coloring
  const colors = {
    auth: { primary: '#2563eb', secondary: '#1e40af', bgTitle: '#2563eb', textTitle: 'Official Authorization Transmission' },
    confirmation: { primary: '#059669', secondary: '#047857', bgTitle: '#059669', textTitle: 'Authentication Securely Completed' },
    refund: { primary: '#e11d48', secondary: '#be123c', bgTitle: '#e11d48', textTitle: 'Refund Authorization Required' },
    cancel: { primary: '#ea580c', secondary: '#c2410c', bgTitle: '#ea580c', textTitle: 'Cancellation & Rebook Required' },
    changes: { primary: '#0284c7', secondary: '#0369a1', bgTitle: '#0284c7', textTitle: 'Changes Authorization Required' },
  };
  const theme = colors[type] || colors.auth;

  const airlineLogo = data.airlineDomain 
    ? (data.airlineDomain.startsWith('cid:') ? data.airlineDomain : `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${data.airlineDomain}&size=256`)
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.airlineName || 'A')}&background=${theme.primary.replace('#', '')}&color=fff&size=256&bold=true`;

  const jsonLdTypes: Record<EmailTemplateType, string> = {
    auth: 'ReservationPending',
    confirmation: 'ReservationConfirmed',
    refund: 'ReservationCancelled',
    cancel: 'ReservationCancelled',
    changes: 'ReservationPending'
  };

  const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "http://schema.org",
      "@type": "FlightReservation",
      "reservationNumber": "${data.pnr || data.crmId}",
      "reservationStatus": "http://schema.org/${jsonLdTypes[type]}",
      "underName": {
        "@type": "Person",
        "name": "${data.passengerName || 'Passenger'}"
      },
      "reservationFor": {
        "@type": "Flight",
        "flightNumber": "FLIGHT",
        "provider": {
          "@type": "Airline",
          "name": "${data.airlineName}"
        },
        "departureAirport": {
          "@type": "Airport",
          "iataCode": "${data.origin || 'ORIGIN'}",
          "name": "${data.origin || 'Origin'}"
        },
        "arrivalAirport": {
          "@type": "Airport",
          "iataCode": "${data.destination || 'DEST'}",
          "name": "${data.destination || 'Destination'}"
        },
        "departureTime": "${data.departureDate ? new Date(data.departureDate).toISOString() : new Date().toISOString()}"
      }
    }
    </script>
  `;

  const processTags = (text: string) => {
    return text
      .replace(/\{\{passengerName\}\}/g, data.passengerName || 'Passenger')
      .replace(/\{\{totalAmount\}\}/g, data.totalAmount?.toLocaleString() || '0')
      .replace(/\{\{currency\}\}/g, data.currency || 'USD')
      .replace(/\{\{airlineName\}\}/g, data.airlineName || 'Airline')
      .replace(/\{\{pnr\}\}/g, data.pnr || data.crmId || 'PENDING')
      .replace(/\{\{validatedGateway\}\}/g, data.validatedGateway ? ` via <strong>${data.validatedGateway}</strong>` : '');
  };

  const customTemplate = branding?.emailTemplates?.[type];
  if (customTemplate?.title) {
    theme.textTitle = customTemplate.title;
  }

  let systemIntro = "";
  let priceBreakdown = "";
  const bgHighlight = `background-color: ${theme.primary}15; color: ${theme.primary}; padding: 0 4px; border-radius: 4px; font-weight: bold; font-family: monospace;`;
  const spanWrap = (text: string) => `<span style="${bgHighlight}">${text}</span>`;
  
  const cchName = `<strong>${data.cardHolderName || data.passengerName || 'Valued Customer'}</strong>`;
  const cchDigits = spanWrap(data.cardLast4 || 'XXXX');
  const airlineHtml = `<strong>${data.airlineName}</strong>`;
  // The pnr inside the text body
  const pnrHtml = spanWrap(data.pnr || data.crmId || '');
  const amountHtml = spanWrap(`${data.currency} ${(data.totalAmount || 0).toLocaleString()}`);
  const gatewayHtml = data.validatedGateway ? ` via <strong>${data.validatedGateway}</strong>` : '';

  const greeting = `Dear ${cchName},<br/><br/>Greetings of the Day!<br/><br/>`;
  
  const getSignatureText = (reason: string) => `<br/><br/>As per our telephonic conversation, I ${cchName}, authorize ${airlineHtml} and Airline Desk Services to process the above-mentioned charges under the respective merchants to charge my card ending in ${cchDigits} for the ${reason} on the itinerary below with ${airlineHtml}.<br/><br/>This payment authorization is for the amount indicated above and is valid for one-time use only.<br/><br/>I certify that I ${cchName} am an authorized user of this card and will not dispute the payment with my credit/debit card company or bank.<br/><br/>`;
  
  const footerText = `Your digital authorization has been successfully recorded and processed. Total secure amount: ${amountHtml}.`;

  if (type === 'auth') {
    systemIntro = `${greeting}Your secure reservation has been initialized.${getSignatureText('reservation')}${footerText}`;
  } else if (type === 'confirmation') {
    systemIntro = `We are pleased to confirm that your digital authorization for ${airlineHtml} (PNR: ${pnrHtml}) has been successfully recorded and processed. Your electronic tickets are now being finalized.`;
  } else if (type === 'refund') {
    systemIntro = `${greeting}Your booking (${pnrHtml}) has been processed for a refund. To finalize the transfer of funds back to your original payment method and process the associated refund issuance fee${gatewayHtml}, your explicit authorization is required.${getSignatureText('refund issuance')}${footerText}`;
  } else if (type === 'cancel') {
     priceBreakdown = `
       <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 25px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff;">
          <thead>
            <tr>
              <th colspan="2" style="background-color: ${theme.primary}10; padding: 15px; font-size: 14px; font-weight: bold; color: ${theme.secondary}; text-align: left; border-bottom: 2px solid ${theme.primary};">Cancellation & Rebooking Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Airline</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.airlineName}</td>
            </tr>
            ${data.oldPnr ? `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Old PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #ef4444; font-size: 14px; font-weight: bold; text-align: right; text-decoration: line-through;">${data.pnr || data.crmId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">New PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #10b981; font-size: 14px; font-weight: bold; text-align: right;">${data.oldPnr}</td>
            </tr>` : `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #10b981; font-size: 14px; font-weight: bold; text-align: right;">${data.pnr || data.crmId}</td>
            </tr>`}
            ${data.modificationDetails ? `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Modification Details</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.modificationDetails}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Airline Cost</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.currency} ${(data.airlineCharges || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Cancellation Fee</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.currency} ${(data.serviceFee || 0).toLocaleString()}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 15px; color: #0f172a; font-size: 13px; font-weight: bold; text-transform: uppercase;">Total Secured Sum</td>
              <td style="padding: 15px; color: ${theme.primary}; font-size: 16px; font-weight: 900; text-align: right;">${data.currency} ${(data.totalAmount || 0).toLocaleString()}</td>
            </tr>
          </tbody>
       </table>
     `;
  } else if (type === 'changes') {
    systemIntro = `${greeting}We have successfully processed the requested changes to your booking (${pnrHtml})${gatewayHtml}. Your updated itinerary details are enclosed. Please provide your authorization below to confirm the modifications and any associated fare adjustments.${getSignatureText('booking modifications and fare difference')}${footerText}`;
  }

  let introTextHtml = `
    <p style="font-size: 15px; color: #64748b; line-height: 1.7;">
      ${systemIntro}
    </p>
  `;

  if (customTemplate?.introText && customTemplate.introText.trim() !== '') {
    const processedCustomText = processTags(customTemplate.introText);
    introTextHtml += `
      <p style="font-size: 15px; color: #64748b; line-height: 1.7; margin-top: 15px;">
         ${processedCustomText.replace(/\n/g, '<br/>')}
      </p>
    `;
  }


  if (type === 'auth') {
     priceBreakdown = `
       <table class="price-table">
          <tr><td class="label">Airline Cost</td><td class="value">${data.currency} ${data.airlineCharges?.toLocaleString() || '0.00'}</td></tr>
          <tr><td class="label">Service Fee</td><td class="value">${data.currency} ${data.serviceFee?.toLocaleString() || '0.00'}</td></tr>
          <tr class="total-row"><td class="label" style="border-bottom: none; color: #0f172a; font-weight: 900;">Total Secured Sum</td><td class="value" style="color: ${theme.primary}; font-size: 22px; border-bottom: none; font-weight: 900;">${data.currency} ${(data.totalAmount || 0).toLocaleString()}</td></tr>
       </table>
     `;
  } else if (type === 'refund') {
     priceBreakdown = `
       <table class="price-table">
          <tr><td class="label">Airline Cost</td><td class="value">${data.currency} ${data.airlineCharges?.toLocaleString() || '0.00'}</td></tr>
          <tr><td class="label">Refund Issuance Fee</td><td class="value">${data.currency} ${data.serviceFee?.toLocaleString() || '0.00'}</td></tr>
          <tr class="total-row"><td class="label" style="border-bottom: none; color: #0f172a; font-weight: 900;">Total Refund Quote</td><td class="value" style="color: ${theme.primary}; font-size: 22px; border-bottom: none; font-weight: 900;">${data.currency} ${(data.refundQuote || 0).toLocaleString()}</td></tr>
          ${data.airlineCredits ? `<tr><td class="label" style="border-top: 1px dashed #cbd5e1; border-bottom: none; padding-top: 15px; color: #059669;">Airline Credits</td><td class="value" style="border-top: 1px dashed #cbd5e1; border-bottom: none; padding-top: 15px; color: #059669;">${data.currency} ${(data.airlineCredits || 0).toLocaleString()}</td></tr>` : ''}
       </table>
     `;
  } else if (type === 'cancel') {
     priceBreakdown = `
       <table class="price-table">
          <tr><td class="label">Airline Cost</td><td class="value">${data.currency} ${data.airlineCharges?.toLocaleString() || '0.00'}</td></tr>
          <tr><td class="label">Cancellation Fee</td><td class="value">${data.currency} ${data.serviceFee?.toLocaleString() || '0.00'}</td></tr>
          <tr class="total-row"><td class="label" style="border-bottom: none; color: #0f172a; font-weight: 900;">Total Secured Sum</td><td class="value" style="color: ${theme.primary}; font-size: 22px; border-bottom: none; font-weight: 900;">${data.currency} ${(data.totalAmount || 0).toLocaleString()}</td></tr>
       </table>
       <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 25px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff;">
          <thead>
            <tr>
              <th colspan="2" style="background-color: ${theme.primary}10; padding: 15px; font-size: 14px; font-weight: bold; color: ${theme.secondary}; text-align: left; border-bottom: 2px solid ${theme.primary}; font-family: sans-serif;">Modification Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; font-family: sans-serif;">Old PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #ef4444; font-size: 14px; font-weight: bold; text-align: right; text-decoration: line-through; font-family: sans-serif;">${data.oldPnr || '[N/A]'}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; font-family: sans-serif;">New PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #10b981; font-size: 14px; font-weight: bold; text-align: right; font-family: sans-serif;">${data.pnr || '[N/A]'}</td>
            </tr>
            ${data.modificationDetails ? `
            <tr>
              <td style="padding: 12px 15px; border-bottom: none; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase; font-family: sans-serif;">Modification Details</td>
              <td style="padding: 12px 15px; border-bottom: none; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right; font-family: sans-serif;">${data.modificationDetails}</td>
            </tr>` : ''}
          </tbody>
       </table>
     `;
  } else if (type === 'changes') {
     priceBreakdown = `
       <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 25px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff;">
          <thead>
            <tr>
              <th colspan="2" style="background-color: ${theme.primary}10; padding: 15px; font-size: 14px; font-weight: bold; color: ${theme.secondary}; text-align: left; border-bottom: 2px solid ${theme.primary};">Modification Summary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Airline</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.airlineName}</td>
            </tr>
            ${data.oldPnr ? `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Old PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #ef4444; font-size: 14px; font-weight: bold; text-align: right; text-decoration: line-through;">${data.pnr || data.crmId}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">New PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #10b981; font-size: 14px; font-weight: bold; text-align: right;">${data.oldPnr}</td>
            </tr>` : `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">PNR</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #10b981; font-size: 14px; font-weight: bold; text-align: right;">${data.pnr || data.crmId}</td>
            </tr>`}
            ${data.modificationDetails ? `
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Modification Details</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.modificationDetails}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Rebooking Difference Fee</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.currency} ${(data.airlineCharges || 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Changes Fee</td>
              <td style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right;">${data.currency} ${(data.serviceFee || 0).toLocaleString()}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 15px; color: #0f172a; font-size: 13px; font-weight: bold; text-transform: uppercase;">Fare Difference</td>
              <td style="padding: 15px; color: ${theme.primary}; font-size: 16px; font-weight: 900; text-align: right;">${data.currency} ${(data.totalAmount || 0).toLocaleString()}</td>
            </tr>
          </tbody>
       </table>
     `;
  } else if (type === 'confirmation') {
     priceBreakdown = `
       <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 25px; border-radius: 12px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Transaction Receipt</h3>
          <div style="display: table; width: 100%; font-size: 14px; margin-bottom: 8px;">
             <div style="display: table-cell; color: #64748b;">Carrier:</div>
             <div style="display: table-cell; text-align: right; font-weight: 700;">${data.airlineName}</div>
          </div>
          <div style="display: table; width: 100%; font-size: 14px; margin-bottom: 8px;">
             <div style="display: table-cell; color: #64748b;">Total Amount:</div>
             <div style="display: table-cell; text-align: right; font-weight: 700; color: ${theme.primary};">${data.currency} ${(data.totalAmount || 0).toLocaleString()}</div>
          </div>
          <div style="display: table; width: 100%; font-size: 14px;">
             <div style="display: table-cell; color: #64748b;">Status:</div>
             <div style="display: table-cell; text-align: right; font-weight: 700; color: ${theme.primary};">AUTHENTICATED</div>
          </div>
       </div>
     `;
  }

  let auditTrail = "";
  if (type === 'confirmation' && (data.authEmail || data.authIp || data.signatureUrl)) {
    auditTrail = `
      <div style="background: ${theme.primary}10; border: 1px solid ${theme.primary}30; border-radius: 12px; padding: 20px; margin: 25px 0;">
        <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: ${theme.secondary}; margin: 0 0 15px 0; border-bottom: 1px solid ${theme.primary}30; padding-bottom: 10px;">Audit Trail & Device Authorization</p>
        <table style="width: 100%; border-collapse: collapse;">
          ${data.authEmail ? `<tr><td style="padding: 5px 0; color: ${theme.secondary}; font-size: 12px; font-weight: 600;">Authorized By:</td><td style="padding: 5px 0; color: ${theme.secondary}; font-size: 12px; font-weight: 800; text-align: right;">${data.authEmail}</td></tr>` : ''}
          ${data.authIp ? `<tr><td style="padding: 5px 0; color: ${theme.secondary}; font-size: 12px; font-weight: 600;">Digital IP Token:</td><td style="padding: 5px 0; color: ${theme.secondary}; font-size: 12px; font-weight: 800; text-align: right;">${data.authIp}</td></tr>` : ''}
          ${data.signatureUrl ? `<tr><td style="padding: 15px 0 5px 0; color: ${theme.secondary}; font-size: 12px; font-weight: 600; vertical-align: top;">Digital Signature:</td><td style="padding: 15px 0 5px 0; text-align: right;"><img src="${data.signatureUrl}" style="max-width: 150px; border-bottom: 2px solid ${theme.primary};" /></td></tr>` : ''}
        </table>
      </div>
    `;
  }

  let buttonArea = "";
  if (type !== 'confirmation') {
    const buttonText = type === 'auth' ? 'I Authorise' : (type === 'refund' ? 'Authorize Refund' : (type === 'cancel' ? 'Authorize Cancel & Rebook' : 'Authorize Changes'));
    buttonArea = `
      <div style="text-align: center; margin: 40px 0;">
        <a href="${data.authLink}${data.authLink?.includes('?') ? '&' : '?'}direct=true" class="button" style="background-color: ${theme.primary}; box-shadow: 0 4px 6px -1px ${theme.primary}40;">${buttonText}</a>
        <p style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 15px;">Secure one-click verification protocol</p>
      </div>
    `;
  } else {
    buttonArea = `<p style="font-size: 13px; color: #64748b; line-height: 1.6;">Our team is performing final verification. You will receive your flight vouchers and electronic tickets in a separate transmission shortly. Thank you for your cooperation.</p>`;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      ${jsonLd}
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #ffffff; }
        .container { max-width: 100%; width: 100%; margin: 0; padding: 20px; overflow: hidden; background-color: white; box-sizing: border-box; }
        .content { max-width: 100%; width: 100%; margin: 0 auto; }
        .content img { max-width: 100%; height: auto; }
        .footer { background-color: #ffffff; padding: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; max-width: 100%; width: 100%; margin: 0 auto; box-sizing: border-box; }
        .button { display: inline-block; padding: 16px 32px; color: white !important; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 15px; margin: 25px 0; text-transform: uppercase; letter-spacing: 0.05em; }
        .price-table { width: 100%; border-collapse: collapse; margin: 25px 0; background: #fcfcfc; border-radius: 16px; overflow: hidden; border: 1px solid #f1f5f9; }
        .price-table td { padding: 18px 25px; border-bottom: 1px solid #f1f5f9; }
        .price-table .label { font-weight: 700; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        .price-table .value { text-align: right; font-weight: 800; color: #0f172a; font-size: 15px; font-family: 'JetBrains Mono', 'Courier New', monospace; }
        .total-row { font-size: 20px; background-color: #f8fafc; border-top: 2px solid #e2e8f0; }
        .package-details { margin-top: 30px; padding: 25px; border-radius: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; font-size: 14px; color: #475569; }
        .package-details img, .quill-content-preview img { max-width: 100%; height: auto; }
        ${branding?.customCss || ''}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <div style="text-align: center; margin-bottom: 40px; background: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
            <img src="${airlineLogo}" style="width: 80px; height: 80px; border-radius: 18px; object-fit: contain; border: 1px solid #f1f5f9; background: #fff; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);" />
            <h2 style="margin: 0; font-size: 24px; color: #0f172a; text-transform: uppercase; font-weight: 900; letter-spacing: -0.02em;">${data.airlineName}</h2>
            ${(data.origin || data.destination) ? `
              <div style="margin-top: 12px; font-size: 16px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
                <span style="background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; display: inline-block;">${(data.origin || 'TBD').toUpperCase()}</span>
                <span style="color: #94a3b8; font-size: 18px; margin: 0 10px; font-weight: normal; vertical-align: middle;">&rarr;</span>
                <span style="background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; display: inline-block;">${(data.destination || 'TBD').toUpperCase()}</span>
              </div>
            ` : ''}
          </div>

          ${type !== 'auth' ? `<p style="font-size: 16px; margin-top: 0; color: #0f172a;">Dear <strong>${data.passengerName}</strong>,</p>` : ''}
          ${introTextHtml}
          
          ${(data.pnr || data.cabinClass || data.origin || data.destination || (data.multiCitySegments && data.multiCitySegments.length > 0) || data.packageRichText || data.snapshotUrl) ? `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin: 0 0 15px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Itinerary Overview</p>
            <table style="width: 100%; border-collapse: collapse;">
              ${data.oldPnr ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">Old PNR:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right; text-decoration: line-through;">${data.pnr}</td></tr><tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">New PNR:</td><td style="padding: 5px 0; color: #10b981; font-size: 13px; font-weight: 800; text-align: right;">${data.oldPnr}</td></tr>` : (data.pnr ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">PNR:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right;">${data.pnr}</td></tr>` : '')}
              ${data.cabinClass ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">Cabin Class:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right;">${data.cabinClass}</td></tr>` : ''}
              ${(data.tripType === 'Multi-City' && data.multiCitySegments) ? 
                data.multiCitySegments.map((segment, index) => 
                  `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600; border-top: 1px dashed #e2e8f0;">Segment ${index + 1}:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right; border-top: 1px dashed #e2e8f0;">${(segment.origin || 'TBD').toUpperCase()} &rarr; ${(segment.destination || 'TBD').toUpperCase()}<br/><span style="font-size: 11px; font-weight: 600; color: #64748b;">${segment.departureDate}</span></td></tr>`
                ).join('')
               : `
                ${(data.origin || data.destination) ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">Routing:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right;">${(data.origin || 'TBD').toUpperCase()} &rarr; ${(data.destination || 'TBD').toUpperCase()}</td></tr>` : ''}
                ${data.departureDate ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">Departure Date:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right;">${data.departureDate}</td></tr>` : ''}
                ${(data.arrivalDate && data.tripType !== 'One-Way') ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600;">${data.tripType === 'Round Trip' ? 'Return Date' : 'Arrival Date'}:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right;">${data.arrivalDate}</td></tr>` : ''}
               `}
              ${data.tripType ? `<tr><td style="padding: 5px 0; color: #64748b; font-size: 13px; font-weight: 600; border-top: 1px dashed #e2e8f0;">Trip Type:</td><td style="padding: 5px 0; color: #0f172a; font-size: 13px; font-weight: 800; text-align: right; border-top: 1px dashed #e2e8f0;">${data.tripType}</td></tr>` : ''}
            </table>

            ${(data.packageRichText) ? `
            <div style="margin-top: 25px;">
              <div style="line-height:1.6; text-align: left; font-size: 14px; color: #475569;">
                ${processTags(data.packageRichText)}
              </div>
            </div>
            ` : ''}

            ${data.snapshotUrl ? `
            <div style="margin-top: 25px; text-align: center;">
              <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; text-align: left;">Booking Snapshot</p>
              <img src="${data.snapshotUrl}" alt="Booking Summary Snapshot" style="width: 100%; max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; display: block;" />
            </div>
            ` : ''}
          </div>
          ` : ''}

          ${(data.passengers && data.passengers.length > 0) ? `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
            <p style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin: 0 0 15px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Passenger Details</p>
            ${data.passengers.map(p => `
              <div style="margin-bottom: 10px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px;">
                <div style="font-weight: 800; color: #0f172a; font-size: 14px; text-transform: uppercase;">${p.name || ''}</div>
                <div style="color: #64748b; font-size: 12px; margin-top: 4px;">
                  DOB: ${p.dob || 'N/A'} &nbsp;|&nbsp; Gender: ${p.gender || 'N/A'} &nbsp;|&nbsp; Type: <span style="font-weight: 800; color: #334155;">${p.ptc || 'Adult'}</span>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${priceBreakdown}

          ${auditTrail}

          ${buttonArea}
          
          ${type !== 'confirmation' ? `<p style="font-size: 12px; color: #94a3b8; margin-top: 40px; font-style: italic; text-align: center; line-height: 1.5;">This transmission is digitally signed and encrypted. Processing is subject to carrier availability. <br/> PNR: ${data.pnr || data.crmId} &nbsp;|&nbsp; Trace ID: ${data.crmId}</p>` : `<p style="font-size: 12px; color: #94a3b8; margin-top: 40px; font-style: italic; text-align: center; line-height: 1.5;">Trace ID: ${data.crmId}</p>`}
          
          <div style="font-size: 10px; color: #64748b; line-height: 1.5; margin-top: 40px; text-align: left; background: #fff; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <strong>Please Note:</strong><br/>
            Review the names, dates, cities, and departure/arrival times carefully.<br/><br/>
            
            <strong>Important:</strong><br/>
            Your e-tickets will be sent to you via email within 24 hours, or sooner if there is no delay from the airline’s side.<br/><br/>
            
            Please note that fares are not guaranteed until payment is received and tickets are issued. If the airline has any restrictions, updates, or concerns, we will contact you via email or phone. If you wish to make any changes to this itinerary after the tickets have been issued, you will be responsible for any additional penalties, fare differences, and applicable fees.<br/><br/>
            
            Baggage fees may apply.<br/>
            Please check with the airline for the most up-to-date baggage policies.<br/><br/>
            
            <strong>Note:</strong><br/>
            As agreed, your credit card may be charged in split transactions, not exceeding the total amount. All transactions for service fees are 100% non-refundable. Airline tickets are non-refundable; however, you may be eligible for a refund within 24 hours of purchase, depending on the airlines policy.<br/><br/>
            
            <strong>For Assistance:</strong><br/>
            If there is any discrepancy or if an amendment is required, please feel free to contact us at +1 888-578-0469.<br/><br/>
            
            <strong>Important Information:</strong><br/>
            Please review your itinerary carefully to ensure that the following key items are correct:<br/><br/>
            
            · Passenger names must match the name on the passport (International Travel) OR any government-approved photo ID proof for Domestic travel.<br/>
            · We advise all passengers to ensure they have all travel documents including passports and required visas issued and presented at the time of travel.<br/>
            · All passengers are recommended to be present at the airport 3 hours before departure for international flights and 2 hours before domestic travel.<br/>
            · All international flights must be confirmed 72 hours before departure.<br/>
            · Review departure/arrival dates, times, origin/destination cities, stopovers, and connections.<br/><br/>
            
            Airline tickets are non-refundable, non-changeable, and non-cancellable in most cases. An airline may allow a ticket to be changed for a fee, plus the increased cost of the new ticket.<br/><br/>
            
            <strong>For Changes Query:</strong><br/>
            Call us at +1 888-578-0469 to make any kind of changes in the itinerary. Any changes to the itinerary should be done prior to the flights departure. The airlines rules will be quoted to the passenger before processing any modification to the itinerary which will include penalty, supplier fee and fare difference. Please note some reservations will be non-refundable and non-changeable. Additionally, once change is processed the add collect will be non-refundable and non-transferable.<br/><br/>
            
            <strong>For Cancellations and Refunds:</strong><br/>
            Call us at +1 888-578-0469. Booking should be cancelled at least 24 hours before the scheduled departure time of your flight to avoid a no-show. Cancellations can only be processed over the phone. Please note cancellation should be processed 24 hours prior to the departure of the flight. Additionally, some reservations will be non-refundable and non-changeable. Refund of any reservation will depend upon the fare rules of the ticketed fare and refund/cancellation penalty and supplier fees. Cancellation/refund penalty can be a new charge or can be adjusted from an existing ticket value based on the type of itinerary booked and fare rules involved. Any ticket refund after 24 hours of booking may take up to two billing cycles from the date of refund processed. If flights are not cancelled before scheduled departure time, the entire money gets fortified. Refunds are always issued to the original form of payment and refund credit will appear on one of the next two billing statements depending upon the bank processing time and the billing cycle of the credit card company. In some cases, it may be more depending upon airlines or consolidators involved and on type of booking.<br/><br/>
            
            <strong>Seat Assignments:</strong><br/>
            Most airlines have restricted rules for advance seat assignment and can only be done with a fee. Some fare restrictions only allow seat assignment at the airport during the time of check-in. Please refer to each operating airline for the most restricted rules. Call us at +1 888-578-0469 for seat assignment, if applicable.<br/><br/>
            
            <strong>Baggage Policy:</strong><br/>
            Your reservation may have a restricted baggage allowance and some airlines may charge an additional fee for each allowed checked-in or carry-on bag. Please refer to each operating airline for the most restricted rules. Call us at +1 888-578-0469 for baggage, if applicable.<br/><br/>
            
            <strong>Visa/Travel Documents:</strong><br/>
            All customers are advised to verify travel documents (transit visa/entry visa) for the country through which they are transiting or entering. We will not be responsible if proper travel documents are not available, and you are denied entry or transit into a Country. We request you to consult the embassy of the country(s) you are visiting or transiting through. Please visit TSA for any questions regarding this, as well as information on check-in procedures and airport security.<br/><br/>
            
            Greendot Travel is an independent travel agency with no third-party association. We shall not be associated or considered an airline or an ally of any of the airlines or brands. Greendot Travel appears on your bank account details in most cases. However, sometimes we have to split the payment with the airline. All service fees and convenience fees are non-refundable.<br/><br/>
            
            <strong>Check-In:</strong><br/>
            We recommend arriving at the airport 3 hours before your departure for international flights and 2 hours before your departure for domestic flights. For the most updated check-in rules, please contact airlines or TSA directly.<br/><br/>
            
            Still, have questions? Call us at +1 888-578-0469. Our agents are available 24 hours a day, 7 days a week to assist you.<br/><br/>
            
            We value your business and look forward to serving your travel needs in the near future.<br/><br/>
            
            Best Regards<br/>
            Reservation Desk
          </div>

        </div>
      </div>
    </body>
    </html>
  `;
};

// Backwards compatibility exports for existing codebase logic
export const generateAuthEmail = (data: EmailData) => generateEmailTemplate('auth', data);
export const generateConfirmationEmail = (data: EmailData) => generateEmailTemplate('confirmation', data);
export const generateRefundEmail = (data: EmailData) => generateEmailTemplate('refund', data);
export const generateCancelEmail = (data: EmailData) => generateEmailTemplate('cancel', data);
export const generateChangesEmail = (data: EmailData) => generateEmailTemplate('changes', data);

export const generateTenantInvitationEmail = (tenantEmail: string, tempPassword?: string, appUrl?: string, orgName?: string, logoUrl?: string) => {
  const cleanedAppUrl = (appUrl || '').replace(/\/$/, '');
  let resolvedLogo = logoUrl;
  if (!resolvedLogo) {
    resolvedLogo = `${cleanedAppUrl}/logo.png`;
  } else if (!resolvedLogo.startsWith('http') && !resolvedLogo.startsWith('data:')) {
    resolvedLogo = `${cleanedAppUrl}${resolvedLogo.startsWith('/') ? '' : '/'}${resolvedLogo}`;
  }

  const resolvedOrgName = orgName || 'SKY CRM';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Welcome to ${resolvedOrgName}</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:AllowPNG/>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
      <style>
        :root {
          color-scheme: light dark;
          supported-color-schemes: light dark;
        }
        body {
          margin: 0;
          padding: 0;
          width: 100% !important;
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
          background-color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #334155;
        }
        img {
          outline: none;
          text-decoration: none;
          -ms-interpolation-mode: bicubic;
          border: none;
        }
        table {
          border-collapse: collapse;
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
        }
        a {
          color: #0284c7;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .btn-primary:hover {
          background-color: #0369a1 !important;
        }
        .btn-secondary:hover {
          background-color: #f1f5f9 !important;
        }
      </style>
    </head>
    <body style="background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; width: 100% !important;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; width: 100%;" bgcolor="#f8fafc">
        <tr>
          <td align="center" style="padding: 40px 16px;">
            <!--[if mso]>
            <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
            <tr>
            <td align="center" valign="top" width="600">
            <![endif]-->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);" bgcolor="#ffffff">
              
              <!-- Content Body -->
              <tr>
                <td style="padding: 40px 32px;">
                  
                  <!-- Header Logo & Branding -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 32px;">
                    <tr>
                      <td align="center">
                        <img src="${resolvedLogo}" alt="${resolvedOrgName} Logo" width="140" style="display: block; width: 140px; max-width: 140px; height: auto; border-radius: 18px; margin-bottom: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.06);" />
                        <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.25;">Welcome to ${resolvedOrgName}</h1>
                        <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.5; font-weight: 500;">Your workspace has been successfully created and is ready to use.</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Account Details Card -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; margin-bottom: 32px;" bgcolor="#f8fafc">
                    <tr>
                      <td style="padding: 24px;">
                        <h3 style="margin: 0 0 16px 0; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Account Information</h3>
                        
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                          <!-- Organization -->
                          <tr>
                            <td style="padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
                              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Organization Name</span>
                              <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${orgName || 'SKY CRM Workspace'}</span>
                            </td>
                          </tr>
                          <!-- Email -->
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Tenant Email</span>
                              <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${tenantEmail}</span>
                            </td>
                          </tr>
                          <!-- Password -->
                          ${tempPassword ? `
                          <tr>
                            <td style="padding-top: 12px;">
                              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Temporary Password</span>
                              <code style="font-family: 'JetBrains Mono', Consolas, Menlo, monospace; font-size: 15px; font-weight: 700; color: #0369a1; background-color: #f0f9ff; padding: 4px 8px; border-radius: 6px; border: 1px solid #e0f2fe; display: inline-block; word-break: break-all;">${tempPassword}</code>
                            </td>
                          </tr>
                          ` : ''}
                        </table>

                      </td>
                    </tr>
                  </table>

                  <!-- Primary CTA Button -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 40px;">
                    <tr>
                      <td align="center">
                        <a href="${cleanedAppUrl}/login" class="btn-primary" style="display: inline-block; background-color: #0284c7; color: #ffffff !important; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: -0.01em; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2); text-decoration: none;">Access CRM Dashboard</a>
                      </td>
                    </tr>
                  </table>

                  <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 32px 0;">

                  <!-- Getting Started Steps -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 32px;">
                    <tr>
                      <td>
                        <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em;">Getting Started Checklist</h2>
                        
                        <table cellpadding="0" cellspacing="0" border="0" width="100%">
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Change Password:</strong> Set your custom secure password upon your first dashboard session.
                            </td>
                          </tr>
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Configure SMTP Settings:</strong> Setup an SMTP sender profile to allow SKY CRM to dispatch correspondence under your brand.
                            </td>
                          </tr>
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Upload Company Logo:</strong> Brand user interfaces with your custom business trademark.
                            </td>
                          </tr>
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Customize Branding:</strong> Align primary layout shades, headers, templates, and booking parameters.
                            </td>
                          </tr>
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Invite Team Members:</strong> Onboard agents, booking managers, and administrative users to collaborate.
                            </td>
                          </tr>
                          <tr>
                            <td valign="top" style="padding-bottom: 12px; width: 28px;">
                              <span style="color: #0284c7; font-weight: bold; font-size: 16px;">✓</span>
                            </td>
                            <td style="padding-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.4;">
                              <strong style="color: #0f172a;">Website Integration:</strong> Deploy the client bridge portal directly live on your server.
                            </td>
                          </tr>
                        </table>

                      </td>
                    </tr>
                  </table>

                  <!-- Web Integration Section -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; margin-bottom: 32px;" bgcolor="#f8fafc">
                    <tr>
                      <td style="padding: 20px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #0f172a;">Website Integration</h4>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #475569; line-height: 1.5;">To serve client portal flows natively on your own customized address, download the bridge file integration and publish it on your hosting root structure.</p>
                        <a href="${cleanedAppUrl}/?downloadBridge=true" class="btn-secondary" style="display: inline-block; background-color: #ffffff; color: #0284c7 !important; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 13px; text-decoration: none; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">Download Website Integration File</a>
                      </td>
                    </tr>
                  </table>

                  <!-- Security Warning -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 32px;">
                    <tr>
                      <td>
                        <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; font-style: italic;">
                          * For security purposes, we recommend updating your temporary password immediately after your first login.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Support Section -->
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f9ff; border-radius: 12px;" bgcolor="#f0f9ff">
                    <tr>
                      <td style="padding: 20px; text-align: center;">
                        <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #0353a1;">Need Help?</h4>
                        <p style="margin: 0; font-size: 13px; color: #0369a1;">Our technical team is standing by to assist with setup. Reach out anytime at <a href="mailto:support@app.itconflict.xyz" style="color: #0353a1; font-weight: bold; text-decoration: underline;">support@app.itconflict.xyz</a></p>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding: 30px; background-color: #f8fafc; border-top: 1px solid #f1f5f9;" bgcolor="#f8fafc">
                  <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #475569;">© SKY CRM</p>
                  <p style="margin: 0; font-size: 11px; color: #94a3b8;">All rights reserved. Dedicated to accelerating your customer success operations.</p>
                </td>
              </tr>

            </table>
            <!--[if mso]>
            </td>
            </tr>
            </table>
            <![endif]-->
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

export const generateLoginNotificationEmail = (tenantEmail: string, ipAddress: string, userAgent: string) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 100%; width: 100%; box-sizing: border-box; margin: 30px auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; background-color: white; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
        .header { background-color: #f59e0b; padding: 25px; text-align: center; color: white; }
        .content { padding: 40px; text-align: center; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <p style="font-size: 16px; color: #475569;">A successful login was detected for your account (<strong>${tenantEmail}</strong>).</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; margin: 25px 0; text-align: left;">
            <p style="margin: 0 0 10px 0; font-size: 13px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 0 0 10px 0; font-size: 13px;"><strong>IP Address:</strong> ${ipAddress || 'Unknown'}</p>
            <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Device:</strong> ${userAgent || 'Unknown'}</p>
          </div>
          <p style="font-size: 13px; color: #94a3b8;">If this was you, you can safely ignore this email. If you did not authorize this login, please contact system administration immediately and secure your account.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Secure Auth CRM System</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
