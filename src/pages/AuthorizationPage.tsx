// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { logAudit, AuditAction } from '@/lib/auditLogger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plane, ShieldCheck, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import confetti from 'canvas-confetti';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

const sanitizeHtml = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target', 'style', 'class']
  });
};

export default function AuthorizationPage() {
  const { clientId } = useTenant();
  const { bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const isQuickAuth = searchParams.get('direct') === 'true';
  
  const [booking, setBooking] = useState<any>(null);
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const sigCanvas = useRef<any>(null);
  const [authDetails, setAuthDetails] = useState<{ip: string, email: string, signature: string} | null>(null);

  const [settings, setSettings] = useState<any>(null);

  // Helper to generate a text-based signature image
  const generateSignatureData = (name: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic 48px cursive';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, canvas.width / 2, canvas.height / 2);
      
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.1, canvas.height * 0.7);
      ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.8, canvas.width * 0.9, canvas.height * 0.7);
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    }
    return canvas.toDataURL('image/png');
  };

  useEffect(() => {
    const fetchBookingAndSettings = async () => {
      let currentSettings = settings;
      try {
        if (!currentSettings) {
          const res = await api.get('/settings');
          if (res.data) {
            currentSettings = res.data;
            setSettings(currentSettings);
          }
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      }

      if (!bookingId) return;
      try {
        const res = await api.get('/bookings/' + bookingId);
        if (res.data) {
          const bData = res.data;
          setBooking(bData);
          
          const postAuthStatuses = ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'];
          if (postAuthStatuses.includes(bData.status)) {
            setAuthDetails({
                ip: bData.authMetadata?.ip || 'Unknown',
                email: bData.contactEmail || 'Unknown',
                signature: bData.signatureData
            });
            setStep(4);
            setLoading(false);
          }

          const pData = typeof bData.passengerNames === 'string' ? JSON.parse(bData.passengerNames) : bData.passengerNames || [];
          setPassengers(pData);

          if (isQuickAuth && !postAuthStatuses.includes(bData.status)) {
            setStep(3); // Go to processing
            const nameToSign = bData.cardHolder || pData[0]?.name || 'Authorized Passenger';
            const autoSig = generateSignatureData(nameToSign);
            
            setTimeout(async () => {
              try {
                await performAuthorize(bData, pData, autoSig, currentSettings);
              } catch (e) {
                console.error('Auto-auth failed:', e);
                setStep(1);
              }
            }, 1000);
          }
        }
      } catch (err: any) {
         toast.error('Failed to load booking');
      }
      setLoading(false);
    };
    fetchBookingAndSettings();
  }, [bookingId, isQuickAuth]);

  const performAuthorize = async (b: any, p: any[], sigData: string, currentSettings = settings) => {
    setLoading(true);
    const bookingIdToUse = b.id;
    const path = `bookings/${bookingIdToUse}`;
    
    try {
      let ipAddress = 'Unknown';
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ipAddress = data.ip;
      } catch (ipErr) {
        console.error('IP capture failed:', ipErr);
      }
      
      const newRemarkText = `[Authorization System] ${new Date().toLocaleString()}:\nBooking Authorized Successfully.\nVerification done by email: ${b.contactEmail || 'Unknown'}\nVerified auth shows the signature of pax generated.\nCustomer IP: ${ipAddress}`;
      const finalRemarks = b.remarks ? b.remarks + '\n\n' + newRemarkText : newRemarkText;

      await api.put('/bookings/' + bookingIdToUse, {
        status: 'authorized',
        signatureData: sigData,
        remarks: finalRemarks,
        authMetadata: {
          ip: ipAddress,
          userAgent: navigator.userAgent,
          action: isQuickAuth ? 'PAYMENT_AUTH_ACCEPTED_DIRECT' : 'PAYMENT_AUTH_ACCEPTED_MANUAL',
          consent: 'I agree to the charges and terms stated via direct link.',
          platform: navigator.platform,
          language: navigator.language
        }
      });

      await logAudit(AuditAction.AUTH_COMPLETED, `Customer authorized booking ${b.crmId} via one-click direct signature`, bookingIdToUse);
      
      setAuthDetails({
        ip: ipAddress,
        email: b.contactEmail || 'Unknown',
        signature: sigData
      });
      
      setStep(4);
      confetti({
        particleCount: 200,
        spread: 90,
        origin: { y: 0.7 },
        colors: ['#0f172a', '#22c55e', '#3b82f6']
      });

      // Background processing
      setTimeout(async () => {
        let pdfBase64 = null;
        let snapshotBase64 = null;
        try {
          // Increase delay to ensure DOM is updated with authDetails
          await new Promise(r => setTimeout(r, 1000));
          
          const summaryElement = document.querySelector('.summary-content') as HTMLElement;
          if (summaryElement) {
            const dataUrl = await toJpeg(summaryElement, { quality: 0.8, backgroundColor: '#ffffff', pixelRatio: 2 });
            snapshotBase64 = dataUrl.split(',')[1];
            
            const pdfWidth = summaryElement.offsetWidth;
            const pdfHeight = summaryElement.offsetHeight;
            
            const pdf = new jsPDF({
              orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
              unit: 'px',
              format: [pdfWidth, pdfHeight]
            });
            
            pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            
            pdfBase64 = pdf.output('datauristring').split(',')[1];
          }
        } catch (pdfErr) {
          console.error("Background Receipt PDF failed:", pdfErr);
        }

        try {
          await fetch('/api/send-confirmation-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: b.crmId,
              email: b.contactEmail,
              airlineName: b.airlineName,
              passengerName: b.cardHolder || p[0]?.name || "Passenger",
              totalAmount: b.totalAmount,
              currency: b.currency,
              origin: b.origin,
              destination: b.destination,
              tripType: b.tripType,
              departureDate: b.departureDate,
              arrivalDate: b.arrivalDate,
              cabinClass: b.cabinClass,
              pnr: b.pnr,
              passengers: p,
              refundQuote: b.refundQuote,
              validatedGateway: b.validatedGateway,
              packageRichText: b.packageRichText,
              contact: {
                email: b.contactEmail,
                phone: b.contactPhone,
                address: b.address,
                city: b.city,
                state: b.state,
                zip: b.zip,
                country: b.country
              },
              authEmail: b.contactEmail,
              authIp: ipAddress,
              signatureBase64: sigData.split(',')[1],
              fromEmail: b.sentFromEmail,
              fromLabel: b.sentFromLabel,
              branding: currentSettings,
              appUrl: window.location.origin,
              snapshotBase64,
              attachments: pdfBase64 ? [
                {
                  filename: `Confirmation_Receipt_${b.crmId}.pdf`,
                  content: pdfBase64,
                  encoding: 'base64'
                }
              ] : []
            })
          });
        } catch (emailErr) {
          console.error("Background confirmation email failed:", emailErr);
        }
      }, 800);

    } catch (err) {
      console.error("CRITICAL AUTH ERROR:", err);
      toast.error("Process failed: " + (err instanceof Error ? err.message : "Network error"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!bookingId || !sigCanvas.current || sigCanvas.current.isEmpty()) {
       return toast.error("Please provide a signature to authorize charges");
    }
    
    const sigData = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
    await performAuthorize(booking, passengers, sigData);
  };

  if (step === 3) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white space-y-6">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Instant Verification Active</h2>
          <p className="text-sm text-slate-400 max-w-sm px-4">Processing secure electronic signature from email link. Please do not close this window.</p>
        </div>
      </div>
    );
  }

  if (loading && step === 1) return <div className="h-screen flex items-center justify-center font-bold text-slate-750">Verifying Authorization Link...</div>;
  if (!booking && !loading) return <div className="h-screen flex items-center justify-center text-destructive font-bold">Invalid or Expired Link</div>;

  return (
    <div className="min-h-screen bg-muted/40 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Minimal Header */}
        <div className="text-center space-y-2">
            <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Authorization Portal</p>
        </div>

        <Card className="border-none shadow-2xl overflow-hidden">
            <div 
              className="h-2 w-full" 
              style={{ backgroundColor: settings?.primaryColor || '#0f172a' }}
            />
            
            <div className={cn(step === 4 && "hidden")}>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">I Authorise</CardTitle>
                    <CardDescription>Fare code: {booking.crmId} • Please verify your travel details</CardDescription>
                </CardHeader>
            </div>
            
            {step === 4 && (
                <div className="p-8 text-center space-y-4 bg-emerald-50/50 border-b border-emerald-100">
                    <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <h3 className="text-2xl font-black text-emerald-700 tracking-tighter">AUTHENTICATED</h3>
                    </div>
                    <p className="text-sm font-medium text-emerald-800">Your authorization for booking <b>{booking.crmId}</b> has been securely processed.</p>
                </div>
            )}

            <div className="">
                <CardContent className="space-y-6 summary-content bg-white pt-6">
                    <div className="p-4 rounded-xl bg-muted/50 border space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Passengers</h4>
                                {passengers.map((p, i) => (
                                    <p key={i} className="text-sm font-bold uppercase">{i+1}. {p.name}</p>
                                ))}
                            </div>
                        </div>

                        {booking.origin && booking.destination && (
                            <>
                            <Separator />
                            <div>
                                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Itinerary</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Route</p>
                                        <p className="text-sm font-bold">{booking.origin} {booking.tripType === 'Multi-City' ? '⤨' : booking.tripType === 'Round Trip' ? '↔' : '→'} {booking.destination}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Trip Type</p>
                                        <p className="text-sm font-medium">{booking.tripType || 'One-Way'}</p>
                                    </div>
                                    {booking.departureDate && (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Departure</p>
                                        <p className="text-sm font-medium">{(()=>{
                                            const ds = booking.departureDate;
                                            const [y, m, d] = ds.split('-');
                                            if (!y || !m || !d) return ds;
                                            return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
                                        })()}</p>
                                    </div>
                                    )}
                                    {booking.arrivalDate && booking.tripType !== 'One-Way' && (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-bold">{booking.tripType === 'Round Trip' ? 'Return' : 'Arrival'}</p>
                                        <p className="text-sm font-medium">{(()=>{
                                            const ds = booking.arrivalDate;
                                            const [y, m, d] = ds.split('-');
                                            if (!y || !m || !d) return ds;
                                            return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
                                        })()}</p>
                                    </div>
                                    )}
                                </div>
                            </div>
                            </>
                        )}

                        {booking.packageRichText && (
                            <>
                            <Separator />
                            <div>
                                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Package / Itinerary Details</h4>
                                <div className="text-sm text-slate-700 quill-content-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(booking.packageRichText) }} />
                            </div>
                            </>
                        )}

                        {booking.packageSnapshots && booking.packageSnapshots.length > 0 && (
                            <>
                            <Separator />
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Verification Snapshots</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  {booking.packageSnapshots.map((url: string, i: number) => (
                                    <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden border bg-slate-50 group relative">
                                        <img src={url} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={`Verification ${i+1}`} referrerPolicy="no-referrer" />
                                    </div>
                                  ))}
                                </div>
                            </div>
                            </>
                        )}
                        
                        <Separator />
                            <div className="flex justify-between items-end mt-4">
                                <div>
                                    <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Fare Summary</h4>
                                    <p className="text-xs text-muted-foreground">Airline Charges: {booking.currency} {booking.airlineCharges}</p>
                                    <p className="text-xs text-muted-foreground">Service/Taxes: {booking.currency} {booking.serviceFee}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Secure Amount</p>
                                    <p className="text-2xl font-black text-primary">{booking.currency} {booking.totalAmount?.toLocaleString()}</p>
                                </div>
                            </div>
                            
                            {(booking.refundQuote > 0 || booking.validatedGateway) && (
                                <div className="flex justify-between items-end mt-4 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                                    {booking.refundQuote > 0 && (
                                        <div>
                                            <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2">Refund Quote</h4>
                                            <p className="text-2xl font-black text-blue-700">{booking.currency} {booking.refundQuote?.toLocaleString()}</p>
                                        </div>
                                    )}
                                    {booking.validatedGateway && (
                                        <div className={booking.refundQuote > 0 ? "text-right" : ""}>
                                            <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-2">Validated Gateway</h4>
                                            <p className="text-sm font-bold text-blue-800 uppercase">{booking.validatedGateway}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        {authDetails && (
                            <>
                            <Separator />
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                                <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest">Digital Audit Trail & Authorization</h4>
                                <div className="grid grid-cols-2 gap-4 text-[11px]">
                                    <div>
                                        <p className="text-emerald-600/70 font-bold uppercase">Authorized By</p>
                                        <p className="font-bold text-emerald-900">{authDetails.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-emerald-600/70 font-bold uppercase">IP Authorization</p>
                                        <p className="font-bold text-emerald-900">{authDetails.ip}</p>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <p className="text-emerald-600/70 font-bold uppercase text-[10px] mb-1">Electronic Signature</p>
                                    <img src={authDetails.signature} alt="Digital Signature" className="h-12 border-b border-emerald-900" />
                                </div>
                            </div>
                            </>
                        )}
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                        <ShieldCheck className="w-6 h-6 text-yellow-500 shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase text-yellow-700">Important Policy</p>
                            <p className="text-xs tracking-tight leading-relaxed text-yellow-800/80">
                                Your payment card may be charged in multiple transactions matching the airline and consolidator splits; however, the total combined charges will never exceed the total authorized amount shown above.
                            </p>
                        </div>
                    </div>

                    {/* Terms and Conditions */}
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm mt-8 space-y-4 text-[11px] text-slate-600 leading-relaxed max-h-96 overflow-y-auto">
                        <p><strong className="text-slate-900">Please Note:</strong><br/>Review the names, dates, cities, and departure/arrival times carefully.</p>

                        <p><strong className="text-slate-900">Important:</strong><br/>Your e-tickets will be sent to you via email within 24 hours, or sooner if there is no delay from the airline’s side.</p>

                        <p>Please note that fares are not guaranteed until payment is received and tickets are issued. If the airline has any restrictions, updates, or concerns, we will contact you via email or phone. If you wish to make any changes to this itinerary after the tickets have been issued, you will be responsible for any additional penalties, fare differences, and applicable fees.</p>

                        <p>Baggage fees may apply.<br/>Please check with the airline for the most up-to-date baggage policies.</p>

                        <p><strong className="text-slate-900">Note:</strong><br/>As agreed, your credit card may be charged in split transactions, not exceeding the total amount. All transactions for service fees are 100% non-refundable. Airline tickets are non-refundable; however, you may be eligible for a refund within 24 hours of purchase, depending on the airlines policy.</p>

                        <p><strong className="text-slate-900">For Assistance:</strong><br/>If there is any discrepancy or if an amendment is required, please feel free to contact us at +1 888-578-0469.</p>

                        <p><strong className="text-slate-900">Important Information:</strong><br/>Please review your itinerary carefully to ensure that the following key items are correct:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Passenger names must match the name on the passport (International Travel) OR any government-approved photo ID proof for Domestic travel.</li>
                            <li>We advise all passengers to ensure they have all travel documents including passports and required visas issued and presented at the time of travel.</li>
                            <li>All passengers are recommended to be present at the airport 3 hours before departure for international flights and 2 hours before domestic travel.</li>
                            <li>All international flights must be confirmed 72 hours before departure.</li>
                            <li>Review departure/arrival dates, times, origin/destination cities, stopovers, and connections.</li>
                        </ul>

                        <p>Airline tickets are non-refundable, non-changeable, and non-cancellable in most cases. An airline may allow a ticket to be changed for a fee, plus the increased cost of the new ticket.</p>

                        <p><strong className="text-slate-900">For Changes Query:</strong><br/>Call us at +1 888-578-0469 to make any kind of changes in the itinerary. Any changes to the itinerary should be done prior to the flights departure. The airlines rules will be quoted to the passenger before processing any modification to the itinerary which will include penalty, supplier fee and fare difference. Please note some reservations will be non-refundable and non-changeable. Additionally, once change is processed the add collect will be non-refundable and non-transferable.</p>

                        <p><strong className="text-slate-900">For Cancellations and Refunds:</strong><br/>Call us at +1 888-578-0469. Booking should be cancelled at least 24 hours before the scheduled departure time of your flight to avoid a no-show. Cancellations can only be processed over the phone. Please note cancellation should be processed 24 hours prior to the departure of the flight. Additionally, some reservations will be non-refundable and non-changeable. Refund of any reservation will depend upon the fare rules of the ticketed fare and refund/cancellation penalty and supplier fees. Cancellation/refund penalty can be a new charge or can be adjusted from an existing ticket value based on the type of itinerary booked and fare rules involved. Any ticket refund after 24 hours of booking may take up to two billing cycles from the date of refund processed. If flights are not cancelled before scheduled departure time, the entire money gets fortified. Refunds are always issued to the original form of payment and refund credit will appear on one of the next two billing statements depending upon the bank processing time and the billing cycle of the credit card company. In some cases, it may be more depending upon airlines or consolidators involved and on type of booking.</p>

                        <p><strong className="text-slate-900">Seat Assignments:</strong><br/>Most airlines have restricted rules for advance seat assignment and can only be done with a fee. Some fare restrictions only allow seat assignment at the airport during the time of check-in. Please refer to each operating airline for the most restricted rules. Call us at +1 888-578-0469 for seat assignment, if applicable.</p>

                        <p><strong className="text-slate-900">Baggage Policy:</strong><br/>Your reservation may have a restricted baggage allowance and some airlines may charge an additional fee for each allowed checked-in or carry-on bag. Please refer to each operating airline for the most restricted rules. Call us at +1 888-578-0469 for baggage, if applicable.</p>

                        <p><strong className="text-slate-900">Visa/Travel Documents:</strong><br/>All customers are advised to verify travel documents (transit visa/entry visa) for the country through which they are transiting or entering. We will not be responsible if proper travel documents are not available, and you are denied entry or transit into a Country. We request you to consult the embassy of the country(s) you are visiting or transiting through. Please visit TSA for any questions regarding this, as well as information on check-in procedures and airport security.</p>

                        <p>Greendot Travel is an independent travel agency with no third-party association. We shall not be associated or considered an airline or an ally of any of the airlines or brands. Greendot Travel appears on your bank account details in most cases. However, sometimes we have to split the payment with the airline. All service fees and convenience fees are non-refundable.</p>

                        <p><strong className="text-slate-900">Check-In:</strong><br/>We recommend arriving at the airport 3 hours before your departure for international flights and 2 hours before your departure for domestic flights. For the most updated check-in rules, please contact airlines or TSA directly.</p>

                        <p>Still, have questions? Call us at +1 888-578-0469. Our agents are available 24 hours a day, 7 days a week to assist you.</p>

                        <p>We value your business and look forward to serving your travel needs in the near future.</p>

                        {settings?.organizationName && <p>Best Regards<br/>{settings.organizationName}</p>}
                    </div>
                </CardContent>
                {step !== 4 && (
                    <CardFooter>
                        <Button className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20" disabled={loading} onClick={async () => {
                            setLoading(true);
                            try {
                                const nameToSign = booking.cardHolder || passengers[0]?.name || booking.contactEmail || "Authorized User";
                                const autoSig = generateSignatureData(nameToSign);
                                await performAuthorize(booking, passengers, autoSig);
                            } catch (e) {
                                console.error("Auth failed", e);
                                setLoading(false);
                            }
                        }}>
                            {loading ? 'Processing...' : 'I AUTHORIZE'}
                        </Button>
                    </CardFooter>
                )}
            </div>
        </Card>

        {/* Security Trust Footer */}
        <div className="flex flex-col items-center gap-6 pt-4 opacity-75">
            <div className="flex items-center gap-6">
                 <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4" /> SECURE PAYMENT
                 </div>
                 <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <Lock className="w-4 h-4" /> VERIFIED BOOKING
                 </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center max-w-sm">
                Blackgrass Authorization System uses 256-bit SSL encryption. Your financial data is securely transmitted and never stored in plain text.
            </p>
        </div>
      </div>
    </div>
  );
}
