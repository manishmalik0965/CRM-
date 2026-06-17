// @ts-nocheck
import React, { useState, useEffect, ClipboardEvent, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toJpeg, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import ReactQuill from 'react-quill-new';
import DOMPurify from 'dompurify';


const sanitizeHtml = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target']
  });
};
import 'react-quill-new/dist/quill.snow.css';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useTenant, getDbPath } from '@/lib/tenant';
import { logAudit, AuditAction } from '@/lib/auditLogger';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { Plane, Trash2, Plus, UserPlus, Clipboard, CreditCard, DollarSign, Contact, ListChecks, Mail, FileText, ChevronRight, AlertCircle, Info, Calendar, Shield, Save, Lock, Search, Download, Check, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { generateAuthEmail, generateCancelEmail, generateChangesEmail, generateRefundEmail } from '@/lib/emailTemplates';
import { generateBookingConfirmation } from '@/lib/pdfGenerator';


// We removed static airport data as per user instructions
// using Google Flights API dynamically via server side


const detectBrand = (number: string) => {
  if (!number) return 'Unknown';
  if (number.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'American Express';
  if (/^6(?:011|5)/.test(number)) return 'Discover';
  return 'Unknown';
};

const AIRLINE_DOMAINS: Record<string, string> = {
  'delta': 'delta.com', 'united': 'united.com', 'american': 'aa.com',
  'jetblue': 'jetblue.com', 'southwest': 'southwest.com', 'alaska': 'alaskaair.com',
  'spirit': 'spirit.com', 'frontier': 'flyfrontier.com', 'british airways': 'britishairways.com',
  'british': 'britishairways.com', 'lufthansa': 'lufthansa.com', 'air france': 'airfrance.com',
  'france': 'airfrance.com', 'klm': 'klm.com', 'emirates': 'emirates.com', 'qatar': 'qatarairways.com',
  'etihad': 'etihad.com', 'singapore airlines': 'singaporeair.com', 'singapore': 'singaporeair.com',
  'cathay': 'cathaypacific.com', 'ana': 'ana.co.jp', 'jal': 'jal.co.jp', 'qantas': 'qantas.com',
  'air canada': 'aircanada.com', 'canada': 'aircanada.com', 'westjet': 'westjet.com',
  'aeromexico': 'aeromexico.com', 'latam': 'latam.com', 'avianca': 'avianca.com',
  'copa': 'copaair.com', 'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com',
  'wizz': 'wizzair.com', 'indigo': 'goindigo.in', 'air india': 'airindia.in',
  'india': 'airindia.in', 'spicejet': 'spicejet.com', 'aer lingus': 'aerlingus.com',
  'finnair': 'finnair.com', 'sas': 'flysas.com', 'norwegian': 'norwegian.com',
  'iberia': 'iberia.com', 'tap': 'flytap.com', 'turkish airlines': 'turkishairlines.com',
  'turkish': 'turkishairlines.com', 'carnival': 'carnival.com', 'royal caribbean': 'royalcaribbean.com', 
  'norwegian cruise': 'ncl.com', 'princess cruises': 'princess.com',
  'celebrity cruises': 'celebritycruises.com', 'msc': 'msccruisesusa.com',
  'disney cruise': 'disneycruise.disney.go.com', 'holland america': 'hollandamerica.com',
  'marriott': 'marriott.com', 'hilton': 'hilton.com', 'hyatt': 'hyatt.com',
  'ihg': 'ihg.com', 'wyndham': 'wyndhamhotels.com', 'best western': 'bestwestern.com',
  'choice hotels': 'choicehotels.com', 'radisson': 'radissonhotels.com',
  'booking.com': 'booking.com', 'expedia': 'expedia.com', 'agoda': 'agoda.com',
  'hotels.com': 'hotels.com', 'airbnb': 'airbnb.com'
};

const deriveDomainFromName = (name: string): string => {
  if (!name) return '';
  const cleanName = name.toLowerCase().trim();
  for (const [key, domain] of Object.entries(AIRLINE_DOMAINS)) {
    if (cleanName.includes(key)) return domain;
  }
  // Trim off common words to leaves the core brand name
  const core = cleanName
    .replace(/\s*(airlines|airways|air|cruises|hotels|group|resorts|intl|international)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (core.length > 1) {
    return `${core}.com`;
  }
  return '';
};

export default function CreateBooking({ profile }: { profile: any }) {
  const { clientId } = useTenant();
  const navigate = useNavigate();
  const { id } = useParams();

  if (profile?.role !== 'Agent' && !id) {
    return (
      <div className="p-12 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center flex-col gap-3 min-h-[400px] mt-10">
        <div className="w-12 h-12 bg-red-50 dark:bg-red-900/10 rounded-2xl flex items-center justify-center text-red-500 mb-2">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Access Restricted</h3>
        <p className="text-xs text-slate-500 max-w-sm leading-relaxed">Only Agents are authorized to create or initialize bookings. All other system roles have view/edit permissions only for existing active bookings.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/')} className="mt-4 uppercase tracking-widest text-[10px] font-bold">Go To Dashboard</Button>
      </div>
    );
  }
  
  const isPrivileged = ['Admin', 'Manager', 'HOD', 'Superadmin'].includes(profile?.role || '');
  const isManager = isPrivileged;
  const canViewCC = isPrivileged || !id;
  const canEditSensitive = isPrivileged || !id;

  const [activeTab, setActiveTab] = useState('personal');
  const [loading, setLoading] = useState(false);
  const [emailTemplateType, setEmailTemplateType] = useState('auth');
  const [settings, setSettings] = useState<any>(null);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [addingNewCard, setAddingNewCard] = useState(false);

  const handlePriceChange = (field: string, value: string) => {
    const newPricing = { ...pricing, [field]: value };
    const a = parseFloat(newPricing.airline as string) || 0;
    const s = parseFloat(newPricing.service as string) || 0;
    
    newPricing.total = Number((a + s).toFixed(2));
    if (field === 'refundQuote') {
      newPricing.refundQuote = parseFloat(value) || 0;
    } else if (field === 'airlineCredits') {
      newPricing.airlineCredits = parseFloat(value) || 0;
    }
    setPricing(newPricing as any);
  };

  const handleCCNumberChange = (e: any) => {
    let val = e.target.value.replace(/\D/g, '');
    const brand = detectBrand(val);
    const maxDigits = brand === 'American Express' ? 15 : 16;
    if (val.length > maxDigits) val = val.slice(0, maxDigits);
    
    let formatted = val;
    if (val.length > 0) {
      if (brand === 'American Express') {
        const parts = [];
        if (val.length > 0) parts.push(val.slice(0, 4));
        if (val.length > 4) parts.push(val.slice(4, 10));
        if (val.length > 10) parts.push(val.slice(10, 15));
        formatted = parts.join(' ');
      } else {
        formatted = val.match(/.{1,4}/g)?.join(' ') || val;
      }
    }
    
    let cleanCvv = payment.cvv;
    const limit = brand === 'American Express' ? 4 : 3;
    if (cleanCvv.length > limit) {
      cleanCvv = cleanCvv.slice(0, limit);
    }
    setPayment({...payment, ccNumber: formatted, cvv: cleanCvv});
  };

  const handleExpiryChange = (e: any) => {
    let val = e.target.value;
    let clean = val.replace(/\D/g, '');
    
    // Auto lead zero if digit is 2-9
    if (clean.length === 1 && ['2', '3', '4', '5', '6', '7', '8', '9'].includes(clean)) {
      clean = '0' + clean;
    }
    
    if (clean.length > 4) clean = clean.slice(0, 4);
    
    let formatted = clean;
    if (clean.length > 2) {
      formatted = clean.slice(0, 2) + '/' + clean.slice(2);
    }
    setPayment({...payment, expiry: formatted});
  };

  const handleCvvChange = (e: any) => {
    let val = e.target.value.replace(/\D/g, '');
    const isAmex = detectBrand(payment.ccNumber) === 'American Express';
    const limit = isAmex ? 4 : 3;
    if (val.length > limit) val = val.slice(0, limit);
    setPayment({...payment, cvv: val});
  };


  const addPassenger = () => {
    setPassengers([...passengers, { id: Date.now() + Math.random().toString(), name: '', dob: '', gender: 'Male', ptc: 'ADT', ticketNumber: '', frequentFlyerNumber: '' }]);
  };

  const removePassenger = (id: string) => {
    setPassengers(passengers.filter(p => p.id !== id));
  };

  const updatePassenger = (id: string, field: string, value: string) => {
    const formattedValue = (field === 'name' || field === 'ticketNumber' || field === 'frequentFlyerNumber') ? value.toUpperCase() : value;
    setPassengers(passengers.map(p => p.id === id ? { ...p, [field]: formattedValue } : p));
  };

  const [crmId, setCrmId] = useState('');
  const [airlineName, setAirlineName] = useState('');
  const [airlineDomain, setAirlineDomain] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [pnr, setPnr] = useState('');
  const [oldPnr, setOldPnr] = useState('');
  const [modificationDetails, setModificationDetails] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [tripType, setTripType] = useState('One-Way');
  const [departureDate, setDepartureDate] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [multiCitySegments, setMultiCitySegments] = useState<any[]>([]);
  const [cabinClass, setCabinClass] = useState('Economy');
  const [passengers, setPassengers] = useState<any[]>([{ id: 'init-1', name: '', dob: '', gender: 'Male', ptc: 'ADT', ticketNumber: '', frequentFlyerNumber: '' }]);
  const [contact, setContact] = useState({ email: '', phone: '', address: '', city: '', state: '', zip: '', country: '' });
  const [payment, setPayment] = useState({ ccName: '', ccNumber: '', expiry: '', cvv: '' });
  const [pricing, setPricing] = useState({ total: 0, airline: 0, service: 0, currency: 'USD', refundQuote: 0, airlineCredits: 0, refundType: 'original' as 'original' | 'credit' });
  const [ancillaryServices, setAncillaryServices] = useState<any[]>([]);
  const [packageRichText, setPackageRichText] = useState('');
  const [validatedGateway, setValidatedGateway] = useState('');
  const [remarks, setRemarks] = useState('');
  const [newRemark, setNewRemark] = useState('');
  const [bookingStatus, setBookingStatus] = useState('draft');
  const [logoError, setLogoError] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Airport search state
  const [originSearch, setOriginSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  const [showOriginResults, setShowOriginResults] = useState(false);
  const [showDestResults, setShowDestResults] = useState(false);
  
  const [filteredOriginAirports, setFilteredOriginAirports] = useState<any[]>([]);
  const [filteredDestAirports, setFilteredDestAirports] = useState<any[]>([]);

  useEffect(() => {
    if (originSearch.length >= 2) {
      const delay = setTimeout(async () => {
        try {
          const res = await fetch(`/api/flights/airports?q=${originSearch}`);
          if (res.ok) {
            const data = await res.json();
            setFilteredOriginAirports(data.results || []);
          }
        } catch(e) {}
      }, 300);
      return () => clearTimeout(delay);
    } else {
      setFilteredOriginAirports([]);
    }
  }, [originSearch]);

  useEffect(() => {
    if (destSearch.length >= 2) {
      const delay = setTimeout(async () => {
        try {
          const res = await fetch(`/api/flights/airports?q=${destSearch}`);
          if (res.ok) {
            const data = await res.json();
            setFilteredDestAirports(data.results || []);
          }
        } catch(e) {}
      }, 300);
      return () => clearTimeout(delay);
    } else {
      setFilteredDestAirports([]);
    }
  }, [destSearch]);

  useEffect(() => {
    if (airlineName) {
      setAirlineDomain(deriveDomainFromName(airlineName));
    }
  }, [airlineName]);

  useEffect(() => {
    setLogoError(false);
  }, [airlineDomain]);

  useEffect(() => {
    api.get('/settings').then(res => setSettings(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (id) {
      setLoading(true);
      api.get('/bookings/' + id).then(res => {
        const d = res.data;
        setCrmId(d.crmId || '');
        setAirlineName(d.airlineName || '');
        setAirlineDomain(d.airlineDomain || '');
        setCreatorName(d.agentName || d.creatorName || '');
        setSignatureData(d.signatureData || null);
        setPnr(d.pnr || '');
        setOldPnr(d.oldPnr || '');
        setModificationDetails(d.modificationDetails || '');
        setOrigin(d.origin || '');
        setOriginSearch(d.origin || '');
        setDestination(d.destination || '');
        setDestSearch(d.destination || '');
        setTripType(d.tripType || 'One-Way');
        setDepartureDate(d.departureDate || '');
        setArrivalDate(d.arrivalDate || '');
        setMultiCitySegments(d.multiCitySegments || []);
        setCabinClass(d.cabinClass || 'Economy');
        if (d.passengerDetails && d.passengerDetails.length > 0) {
            setPassengers(d.passengerDetails);
        } else if (d.passengerNames && d.passengerNames.length > 0) {
            setPassengers(d.passengerNames.map((n: any) => typeof n === 'string' ? { id: Date.now() + Math.random().toString(), name: n, dob: '', gender: 'Male', ptc: 'ADT', ticketNumber: '', frequentFlyerNumber: '' } : { dob: '', gender: 'Male', ptc: 'ADT', ticketNumber: '', frequentFlyerNumber: '', ...n, id: n.id || Date.now() + Math.random().toString() }));
        }
        setContact({
            email: d.contactEmail || '',
            phone: d.contactPhone || '',
            address: d.address || '',
            city: d.city || '',
            state: d.state || '',
            zip: d.zip || '',
            country: d.country || ''
        });
        setPayment({
            ccName: d.cardHolder || '',
            ccNumber: d.cardNumber || '',
            expiry: d.expiry || '',
            cvv: d.cvv || ''
        });
        setPricing({
            total: d.totalAmount || 0,
            airline: d.airlineCharges || 0,
            service: d.serviceFee || 0,
            currency: d.currency || 'USD',
            refundQuote: d.refundQuote || 0,
            airlineCredits: d.airlineCredits || 0,
            refundType: d.refundType || 'original'
        });
        setAncillaryServices(d.ancillaryServices || []);
        setPackageRichText(d.packageRichText || '');
        setValidatedGateway(d.validatedGateway || '');
        setRemarks(d.remarks || '');
        setBookingStatus(d.status || 'draft');
        setEmailTemplateType(d.emailTemplateType || 'auth');
      }).catch(console.error).finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    const a = parseFloat(pricing.airline as any) || 0;
    const s = parseFloat(pricing.service as any) || 0;
    const expectedTotal = Number((a + s).toFixed(2));
    if (pricing.total !== expectedTotal) {
      setPricing(prev => ({
        ...prev,
        total: expectedTotal
      }));
    }
  }, [pricing.airline, pricing.service, pricing.total]);

  const handleCopyRawHtml = async () => {
    let snapshotBase64 = null;
    if (previewRef.current && packageRichText && document.querySelector('.summary-content')) {
      try {
        const el = document.querySelector('.summary-content') as HTMLElement;
        const dataUrl = await toJpeg(el, { quality: 0.6, backgroundColor: '#ffffff', pixelRatio: 1.5 });
        snapshotBase64 = dataUrl;
      } catch (e) {
        console.error("Snapshot error:", e);
      }
    }
    
    const emailData = {
      bookingId: id || 'Preview',
      crmId: crmId || 'SW-PREVIEW',
      pnr,
      oldPnr,
      modificationDetails,
      airlineName,
      airlineDomain,
      passengerName: payment.ccName || passengers[0]?.name || 'Valued Customer',
      cardHolderName: payment.ccName || passengers[0]?.name || 'Valued Customer',
      cardLast4: payment.ccNumber ? payment.ccNumber.slice(-4) : '',
      origin,
      destination,
      totalAmount: pricing.total,
      currency: pricing.currency,
      tripType,
      departureDate,
      arrivalDate,
      multiCitySegments: tripType === 'Multi-City' ? multiCitySegments : [],
      cabinClass,
      passengers,
      contact,
      validatedGateway,
      packageRichText,
      snapshotUrl: snapshotBase64 || undefined,
      branding: settings,
      authLink: window.location.origin + '/authorize/' + (id || 'preview'),
      refundQuote: pricing.refundQuote || 0,
      airlineCredits: pricing.airlineCredits || 0,
      refundType: pricing.refundType || 'original'
    };
    
    let html = '';
    if (emailTemplateType === 'refund') html = generateRefundEmail(emailData);
    else if (emailTemplateType === 'cancel') html = generateCancelEmail(emailData);
    else if (emailTemplateType === 'changes') html = generateChangesEmail(emailData);
    else html = generateAuthEmail(emailData);
    
    navigator.clipboard.writeText(html);
    toast.success('Raw Email HTML copied to clipboard');
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) return;
    
    // Set UI to loading if possible, though it's quick
    const toastId = toast.loading('Generating PDF...');
    
    try {
      const el = previewRef.current;
      const scrollContainer = el.querySelector('.overflow-auto') as HTMLElement;
      
      const originalStyle = {
        height: el.style.height,
        maxHeight: el.style.maxHeight,
        overflow: el.style.overflow
      };
      
      const scrollStyle = scrollContainer ? {
        overflow: scrollContainer.style.overflow,
        height: scrollContainer.style.height,
        maxHeight: scrollContainer.style.maxHeight
      } : null;

      // Expand for capture
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      if (scrollContainer) {
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.height = 'auto';
        scrollContainer.style.maxHeight = 'none';
      }

      const dataUrl = await toJpeg(el, { quality: 0.6, backgroundColor: '#ffffff', pixelRatio: 1.5, skipFonts: true });
      
      // Restore styles
      el.style.height = originalStyle.height;
      el.style.maxHeight = originalStyle.maxHeight;
      el.style.overflow = originalStyle.overflow;
      if (scrollContainer && scrollStyle) {
        scrollContainer.style.overflow = scrollStyle.overflow;
        scrollContainer.style.height = scrollStyle.height;
        scrollContainer.style.maxHeight = scrollStyle.maxHeight;
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      const filename = `${emailTemplateType === 'auth' ? 'Confirmation' : emailTemplateType === 'changes' ? 'Changes_Invoice' : emailTemplateType === 'refund' ? 'Refund_Invoice' : 'Cancellation_Invoice'}_${pnr || id || 'Draft'}.pdf`;
      pdf.save(filename);
      toast.dismiss(toastId);
      toast.success('PDF downloaded successfully');
    } catch (err) {
      console.error("PDF download failed:", err);
      toast.dismiss(toastId);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadStructuredReport = () => {
    try {
      const branding = settings ? {
        organizationName: settings.organizationName,
        supportPhone: settings.supportPhone,
        supportEmail: settings.supportEmail,
        logoUrl: settings.logoUrl,
        fullAddress: settings.fullAddress,
        primaryColor: settings.primaryColor
      } : undefined;

      const bookingObj = {
        crmId: crmId || id || 'Draft',
        airlineName: airlineName || 'Unknown Airline',
        pnr: pnr || '---',
        origin: origin || '---',
        destination: destination || '---',
        tripType: tripType || 'One-Way',
        departureDate: departureDate || '---',
        arrivalDate: arrivalDate || '---',
        cabinClass: cabinClass || 'Economy',
        currency: pricing.currency || 'USD',
        airlineCharges: pricing.airline || 0,
        serviceFee: pricing.service || 0,
        totalAmount: pricing.total || 0,
        status: bookingStatus || 'pending',
        signatureData: signatureData,
        cardHolder: payment.ccName || contact.email || 'Valued Customer',
        contactEmail: contact.email,
        contactPhone: contact.phone,
      };

      generateBookingConfirmation(bookingObj, passengers, branding);
      toast.success('Structured PDF report downloaded successfully');
    } catch (err) {
      console.error("Structured report generation failed:", err);
      toast.error('Failed to generate structured PDF report');
    }
  };

  const handleFinalize = async () => {
    if (!airlineName) { toast.error('Carrier name is required'); return; }
    if (!contact.email) { toast.error('Customer email is required'); return; }

    setLoading(true);
    try {
      const existingSnap = id ? await api.get('/bookings/' + id) : null;
      const currentStatus = existingSnap?.data?.status;
      
      const finalRemarks = newRemark ? (remarks ? remarks + '\n\n' : '') + `[${profile?.username || profile?.email || 'System'}] ${new Date().toLocaleString()}:\n${newRemark}` : remarks;
      const finalizedCrmId = id ? existingSnap?.data?.crmId : `SW-${Math.floor(100000 + Math.random() * 900000)}`;
      const finalStatus = (currentStatus === 'verified' || currentStatus === 'email auth confirm' || currentStatus === 'authorized') ? currentStatus : 'pending';

      const bookingData: any = {
        airlineName, pnr, origin, destination, cabinClass, tripType, departureDate, arrivalDate,
        multiCitySegments: tripType === 'Multi-City' ? multiCitySegments : [],
        ancillaryServices, remarks: finalRemarks, status: finalStatus,
        agentId: profile?.id, agentEmail: profile?.email || profile?.email, agentName: profile?.displayName || profile?.username || 'Unknown',
        airlineDomain,
      };

      if (canEditSensitive) {
        bookingData.crmId = finalizedCrmId;
        bookingData.contactEmail = contact.email;
        bookingData.contactPhone = contact.phone;
        bookingData.address = contact.address;
        bookingData.city = contact.city;
        bookingData.state = contact.state;
        bookingData.zip = contact.zip;
        bookingData.country = contact.country;
        bookingData.airlineCharges = pricing.airline;
        bookingData.serviceFee = pricing.service;
        bookingData.totalAmount = pricing.total;
        bookingData.currency = pricing.currency;
        bookingData.refundQuote = pricing.refundQuote || 0;
        bookingData.airlineCredits = pricing.airlineCredits || 0;
        bookingData.refundType = pricing.refundType || 'original';
        bookingData.packageRichText = packageRichText;
        bookingData.oldPackageRichText = existingSnap?.data?.packageRichText || '';
        bookingData.validatedGateway = validatedGateway;
        bookingData.passengerNames = passengers.map((p: any) => { try { return typeof p === 'string' ? p : p.name; } catch(e) { return ''; }});
        bookingData.passengerDetails = passengers;
      }

      if (canEditSensitive || addingNewCard) {
        bookingData.cardHolder = payment.ccName;
        bookingData.cardNumber = payment.ccNumber;
        bookingData.cardNumberMasked = payment.ccNumber ? payment.ccNumber.slice(-4) : '';
        bookingData.expiry = payment.expiry;
        bookingData.cvv = payment.cvv;
        bookingData.cardBrand = detectBrand(payment.ccNumber);
      }

      let bId = id;
      if (id) {
        await api.put('/bookings/' + id, bookingData);
        await logAudit(AuditAction.BOOKING_EDITED, `Booking ${finalizedCrmId} updated`, id);
        setRemarks(finalRemarks); setNewRemark(''); toast.success('Manifest synchronization complete');
        setCreatedBookingId(id); setShowConfirmSend(true);
      } else {
        const res = await api.post('/bookings', { ...bookingData, crmId: finalizedCrmId });
        bId = res.data.id;
        await logAudit(AuditAction.BOOKING_CREATED, `New booking ${finalizedCrmId} created`, bId);
        setCreatedBookingId(bId as string); setShowConfirmSend(true);
      }
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveBooking = async (status: string) => {
    setLoading(true);
    try {
      const existingSnap = id ? await api.get('/bookings/' + id) : null;
      const currentStatus = existingSnap?.data?.status;

      let finalStatus = status;
      if (status === 'draft' || status === 'pending') {
        finalStatus = (currentStatus === 'verified' || currentStatus === 'email auth confirm' || currentStatus === 'authorized') ? currentStatus : status;
      }

      const finalRemarks = newRemark ? (remarks ? remarks + '\n\n' : '') + `[${profile?.username || profile?.email || 'System'}] ${new Date().toLocaleString()}:\n${newRemark}` : remarks;

      const dataToSave: any = {
        airlineName: (airlineName || '').toUpperCase(), status: finalStatus, remarks: finalRemarks, pnr: (pnr || '').toUpperCase(), oldPnr: (oldPnr || '').toUpperCase(), modificationDetails: (modificationDetails || '').toUpperCase(),
        origin: (originSearch.trim() ? originSearch.toUpperCase() : origin || '').toUpperCase(),
        destination: (destSearch.trim() ? destSearch.toUpperCase() : destination || '').toUpperCase(),
        cabinClass, tripType, departureDate, arrivalDate,
        multiCitySegments: tripType === 'Multi-City' ? multiCitySegments.map((s: any) => ({
          ...s,
          origin: (s.origin || '').toUpperCase(),
          destination: (s.destination || '').toUpperCase()
        })) : [],
        emailTemplateType, ancillaryServices, packageRichText,
        oldPackageRichText: existingSnap?.data?.packageRichText || '',
        validatedGateway: (validatedGateway || '').toUpperCase(), agentId: profile?.id, agentEmail: profile?.email || profile?.email, agentName: profile?.displayName || profile?.username || 'Unknown',
        airlineDomain,
      };

      if (canEditSensitive) {
        dataToSave.contactEmail = contact.email;
        dataToSave.contactPhone = contact.phone;
        dataToSave.address = (contact.address || '').toUpperCase();
        dataToSave.city = (contact.city || '').toUpperCase();
        dataToSave.state = (contact.state || '').toUpperCase();
        dataToSave.zip = (contact.zip || '').toUpperCase();
        dataToSave.country = (contact.country || '').toUpperCase();
        dataToSave.airlineCharges = pricing.airline;
        dataToSave.serviceFee = pricing.service;
        dataToSave.totalAmount = pricing.total;
        dataToSave.currency = pricing.currency;
        dataToSave.refundQuote = pricing.refundQuote || 0;
        dataToSave.airlineCredits = pricing.airlineCredits || 0;
        dataToSave.refundType = pricing.refundType || 'original';
        dataToSave.passengerNames = passengers.map((p: any) => { try { return (typeof p === 'string' ? p : p.name || '').toUpperCase(); } catch(e) { return ''; }});
        dataToSave.passengerDetails = passengers.map((p: any) => ({
          ...p,
          name: (p.name || '').toUpperCase(),
          ticketNumber: (p.ticketNumber || '').toUpperCase()
        }));
      }

      if (canEditSensitive || addingNewCard) {
        dataToSave.cardHolder = (payment.ccName || '').toUpperCase();
        dataToSave.cardNumber = payment.ccNumber;
        dataToSave.cardNumberMasked = payment.ccNumber ? payment.ccNumber.slice(-4) : '';
        dataToSave.expiry = payment.expiry;
        dataToSave.cvv = payment.cvv;
        dataToSave.cardBrand = detectBrand(payment.ccNumber);
      }

      setRemarks(finalRemarks); setNewRemark('');
      const finalizedCrmId = id ? existingSnap?.data?.crmId : `SW-${Math.floor(100000 + Math.random() * 900000)}`;
      
      let bookingId = id;
      if (id) {
        await api.put('/bookings/' + id, { ...dataToSave, crmId: finalizedCrmId });
        await logAudit(status === 'draft' ? AuditAction.DRAFT_SAVED : AuditAction.BOOKING_EDITED, `Booking ${finalizedCrmId} updated.`, id);
        toast.success(status === 'draft' ? 'Booking saved to drafts' : 'Booking initialized');
      } else {
        const res = await api.post('/bookings', { ...dataToSave, crmId: finalizedCrmId });
        bookingId = res.data.id;
        await logAudit(status === 'draft' ? AuditAction.DRAFT_SAVED : AuditAction.BOOKING_CREATED, `New booking.`, bookingId);
        toast.success(status === 'draft' ? 'Booking saved to drafts' : 'Booking initialized');
        navigate(`/bookings/edit/${bookingId}`);
      }
    } catch (err: any) {
      toast.error('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const saveRemarksOnly = async () => {
    if (!id) {
      toast.error('Booking has not been created yet. Save as draft or initialize the booking first.');
      return;
    }
    setLoading(true);
    try {
      const finalRemarks = newRemark.trim() ? (remarks ? remarks + '\n\n' : '') + `[${profile?.username || profile?.email || 'System'}] ${new Date().toLocaleString()}:\n${newRemark.trim()}` : remarks;

      // Prepare request body where details contains remarks. Put handles nesting of details via ...details in the api route.
      await api.put('/bookings/' + id, {
        remarks: finalRemarks
      });

      await logAudit(AuditAction.BOOKING_EDITED, `Booking remarks updated.`, id);

      setRemarks(finalRemarks);
      setNewRemark('');
      toast.success('Remark added and saved successfully');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save remark: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeSend = async () => {
      setShowConfirmSend(false);
      if (!createdBookingId) return;

      const smtpProfile = settings?.smtpProfiles?.[selectedProfileIndex];

      let pdfBase64 = null;
      let snapshotBase64 = null;
      let snapshotUrl = null;
      
      if (previewRef.current) {
        try {
          const el = previewRef.current;
          const scrollContainer = el.querySelector(".overflow-auto");
          const originalStyle = { height: el.style.height, maxHeight: el.style.maxHeight, overflow: el.style.overflow };
          const scrollStyle = scrollContainer ? { overflow: (scrollContainer as any).style.overflow, height: (scrollContainer as any).style.height, maxHeight: (scrollContainer as any).style.maxHeight } : null;

          el.style.height = 'auto'; el.style.maxHeight = 'none'; el.style.overflow = 'visible';
          if (scrollContainer) { (scrollContainer as any).style.overflow = 'visible'; (scrollContainer as any).style.height = 'auto'; (scrollContainer as any).style.maxHeight = 'none'; }

          const dataUrl = await toJpeg(el, { quality: 0.6, backgroundColor: '#ffffff', pixelRatio: 1.5, skipFonts: true });

          if (dataUrl) {
            try {
              const upRes = await fetch('/api/upload-snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64: dataUrl })
              });
              if (upRes.ok) {
                const uploadData = await upRes.json();
                snapshotUrl = uploadData.relativeUrl || uploadData.url;
              }
            } catch (upErr) {}
          }
          
          el.style.height = originalStyle.height; el.style.maxHeight = originalStyle.maxHeight; el.style.overflow = originalStyle.overflow;
          if (scrollContainer && scrollStyle) { (scrollContainer as any).style.overflow = scrollStyle.overflow; (scrollContainer as any).style.height = scrollStyle.height; (scrollContainer as any).style.maxHeight = scrollStyle.maxHeight; }

          snapshotBase64 = dataUrl.split(',')[1];
          const pdf = new jsPDF('p', 'mm', 'a4');
          const imgProps = pdf.getImageProperties(dataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          let heightLeft = pdfHeight; let position = 0;
          pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight); heightLeft -= pageHeight;
          while (heightLeft > 0) { position -= pageHeight; pdf.addPage(); pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, pdfHeight); heightLeft -= pageHeight; }
          pdfBase64 = pdf.output('datauristring').split(',')[1];
        } catch (pdfErr) {}
      }

      try {
        const endpoints: any = { 'auth': '/api/send-auth-email', 'refund': '/api/send-refund-email', 'cancel': '/api/send-cancel-email', 'changes': '/api/send-changes-email' };
        const selectedEndpoint = endpoints[emailTemplateType] || '/api/send-auth-email';

        await fetch(selectedEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: createdBookingId, crmId: crmId, email: contact.email, airlineName: (airlineName || '').toUpperCase(), airlineDomain,
            passengerName: (payment.ccName || passengers[0]?.name || 'Passenger').toUpperCase(),
            totalAmount: pricing.total, currency: pricing.currency, airlineCharges: pricing.airline, serviceFee: pricing.service, refundQuote: pricing.refundQuote || 0, airlineCredits: pricing.airlineCredits || 0,
            refundType: pricing.refundType || 'original',
            origin: (origin || '').toUpperCase(), destination: (destination || '').toUpperCase(), tripType, departureDate, arrivalDate, 
            multiCitySegments: (tripType === 'Multi-City' ? multiCitySegments : []).map((seg: any) => ({
              ...seg,
              origin: (seg.origin || '').toUpperCase(),
              destination: (seg.destination || '').toUpperCase()
            })), 
            cabinClass, pnr: (pnr || '').toUpperCase(), oldPnr: (oldPnr || '').toUpperCase(), modificationDetails: (modificationDetails || '').toUpperCase(), 
            passengers: passengers.map((p: any) => ({ ...p, name: (p.name || '').toUpperCase(), ticketNumber: (p.ticketNumber || '').toUpperCase() })), 
            contact: {
              ...contact,
              address: (contact.address || '').toUpperCase(),
              city: (contact.city || '').toUpperCase(),
              state: (contact.state || '').toUpperCase(),
              zip: (contact.zip || '').toUpperCase(),
              country: (contact.country || '').toUpperCase()
            }, 
            validatedGateway: (validatedGateway || '').toUpperCase(),
            cardHolderName: (payment.ccName || passengers[0]?.name || 'Valued Customer').toUpperCase(), 
            cardLast4: payment.ccNumber ? payment.ccNumber.slice(-4) : '', 
            cardBrand: detectBrand(payment.ccNumber) || '',
            packageRichText, appUrl: window.location.origin, fromEmail: smtpProfile?.email, fromLabel: smtpProfile?.label, branding: settings, snapshotBase64, snapshotUrl,
            oldPackageRichText: '', attachments: []
          })
        });
        await api.put('/bookings/' + createdBookingId, { status: 'email sent' });
        setBookingStatus('email sent');
        await logAudit(AuditAction.EMAIL_SENT, `${emailTemplateType.toUpperCase()} email sent`, createdBookingId);
        toast.success(`${emailTemplateType.toUpperCase()} email sent successfully`);
        navigate('/bookings');
      } catch (emailErr) {
        toast.error('Email Relay Failed');
      }
  };



  const previewHtmlData = {
      bookingId: id || 'Preview',
      crmId: crmId || 'SW-PREVIEW',
      pnr: (pnr || '[PNR]').toUpperCase(),
      oldPnr: (oldPnr || '').toUpperCase(),
      modificationDetails: (modificationDetails || '').toUpperCase(),
      airlineName: (airlineName || 'Airline Name').toUpperCase(),
      airlineDomain: airlineDomain,
      passengerName: (passengers[0]?.name || 'Passenger').toUpperCase(),
      totalAmount: pricing.total || 0,
      airlineCharges: pricing.airline || 0,
      serviceFee: pricing.service || 0,
      currency: pricing.currency || 'USD',
      origin: (origin || 'ORI').toUpperCase(),
      destination: (destination || 'DES').toUpperCase(),
      tripType,
      departureDate,
      arrivalDate,
      cabinClass: cabinClass || 'Economy',
      passengers: passengers.map((p: any) => ({ ...p, name: (p.name || '').toUpperCase(), ticketNumber: (p.ticketNumber || '').toUpperCase() })),
      contact: {
        ...contact,
        address: (contact.address || '').toUpperCase(),
        city: (contact.city || '').toUpperCase(),
        state: (contact.state || '').toUpperCase(),
        zip: (contact.zip || '').toUpperCase(),
        country: (contact.country || '').toUpperCase()
      },
      validatedGateway: (validatedGateway || '').toUpperCase(),
      cardHolderName: (payment.ccName || passengers[0]?.name || 'Valued Customer').toUpperCase(),
      cardLast4: payment.ccNumber ? payment.ccNumber.slice(-4) : '',
      cardBrand: detectBrand(payment.ccNumber) || '',
      packageRichText: isHtmlMode ? sanitizeHtml(packageRichText) : packageRichText,
      snapshotUrl: undefined,
      branding: settings,
      authLink: window.location.origin + '/authorize/' + (id || 'preview'),
      refundQuote: pricing.refundQuote || 0,
      airlineCredits: pricing.airlineCredits || 0,
      refundType: pricing.refundType || 'original',
      isPreview: true
  };

  let previewHtml = '';
  if (emailTemplateType === 'refund') previewHtml = generateRefundEmail(previewHtmlData);
  else if (emailTemplateType === 'cancel') previewHtml = generateCancelEmail(previewHtmlData);
  else if (emailTemplateType === 'changes') previewHtml = generateChangesEmail(previewHtmlData);
  else previewHtml = generateAuthEmail(previewHtmlData);

  return (
    <>
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {airlineDomain && !logoError ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1.5 shadow-sm overflow-hidden animate-in zoom-in duration-500">
               <img 
                 src={`/api/proxy-logo?domain=${airlineDomain}`} 
                 alt="Header Logo"
                 className="w-full h-full object-contain"
                 crossOrigin="anonymous"
                 onError={() => setLogoError(true)}
               />
            </div>
          ) : (
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
              <Plane className="w-6 h-6" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 italic">
                {airlineName ? `${airlineName.toUpperCase()} ENROLLMENT` : 'CREATE NEW BOOKING'}
              </h1>
              {id && creatorName && (
                <Badge variant="outline" className="text-[10px] uppercase font-black tracking-widest text-blue-600 bg-blue-50 border-blue-200 ml-2">
                  Created By: {creatorName}
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Prepare travel records and secure payment authorization</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {id && isManager && (
            <select 
              value={bookingStatus}
              onChange={(e) => {
                setBookingStatus(e.target.value);
                saveBooking(e.target.value);
              }}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest rounded-lg outline-none cursor-pointer hover:border-blue-500 text-slate-700 dark:text-slate-300 h-9"
            >
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="email sent">Email Sent</option>
              <option value="email auth confirm">Email Auth Confirm</option>
              <option value="ready to charge">Ready to Charge</option>
              <option value="charged">Charged</option>
              <option value="chargeback">Chargeback</option>
            </select>
          )}

          {id && profile?.role === 'Agent' && (
            <select 
              value={bookingStatus}
              onChange={(e) => {
                setBookingStatus(e.target.value);
                saveBooking(e.target.value);
              }}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest rounded-lg outline-none cursor-pointer hover:border-blue-500 text-slate-700 dark:text-slate-300 h-9"
            >
              <option value={bookingStatus} disabled>Status: {bookingStatus}</option>
              <option value="ready to charge">Ready to Charge</option>
            </select>
          )}
          
          <select 
            value={emailTemplateType}
            onChange={(e) => setEmailTemplateType(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest rounded-lg outline-none cursor-pointer hover:border-blue-500 text-slate-700 dark:text-slate-300 h-9"
          >
            <option value="auth">New Booking Email</option>
            <option value="refund">Refund Email</option>
            <option value="cancel">Cancel & Rebook Email</option>
            <option value="changes">Changes Email</option>
          </select>

          <Button variant="outline" className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded text-slate-600 dark:text-slate-300 h-9" onClick={() => saveBooking('draft')} disabled={loading}>
            Save Draft
          </Button>

          {id && (
            <Button className="px-4 py-1.5 bg-blue-600 text-sm font-medium rounded text-white shadow-lg shadow-blue-600/20 h-9 hover:bg-blue-700 transition-all active:scale-95" onClick={handleFinalize} disabled={loading}>
              Send Auth Email
            </Button>
          )}
        </div>
      </div>

      {/* Visual Reservation Stage Progress Stepper */}
      {(() => {
        const s = bookingStatus?.toLowerCase() || 'draft';
        let curStep = 0;
        if (['draft'].includes(s)) {
          curStep = 0;
        } else if (['pending', 'email sent'].includes(s)) {
          curStep = 1;
        } else if (['email auth confirm', 'authorized', 'ready to charge'].includes(s)) {
          curStep = 2;
        } else if (['charged', 'chargeback'].includes(s)) {
          curStep = 3;
        }

        const stages = [
          { label: 'Initiated', desc: 'Draft established', icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/45 border-blue-200 dark:border-blue-800' },
          { label: 'Sent to Client', desc: 'Awaiting signature', icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/45 border-amber-200 dark:border-amber-800' },
          { label: 'Authorized', desc: 'Verified core signature', icon: Shield, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-200 dark:border-emerald-800' },
          { label: s === 'chargeback' ? 'Disputed' : 'Settle Completed', desc: s === 'chargeback' ? 'Payment Chargeback' : 'Verified funds charged', icon: s === 'chargeback' ? AlertCircle : CheckCircle2, color: s === 'chargeback' ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400', bg: s === 'chargeback' ? 'bg-red-50 dark:bg-red-950/45 border-red-200 dark:border-red-800' : 'bg-indigo-50 dark:bg-indigo-950/45 border-indigo-200 dark:border-indigo-800' },
        ];

        return (
          <div className="bg-slate-50/50 dark:bg-slate-800/10 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-stretch justify-between gap-4 relative">
              {stages.map((stage, i) => {
                const Icon = stage.icon;
                const isCompleted = i < curStep;
                const isActive = i === curStep;

                return (
                  <React.Fragment key={i}>
                    {/* Step Card / Element */}
                    <div className="flex-1 flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 relative z-10 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
                      {/* Left: Indicator Icon */}
                      <div className="relative shrink-0">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all duration-500 shadow-xs",
                          isCompleted ? "bg-emerald-500 border-emerald-500 text-white" :
                          isActive ? cn(stage.bg, "border-2 animate-pulse scale-105") :
                          "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-400"
                        )}>
                          {isCompleted ? (
                            <Check className="w-4 h-4 text-white stroke-[3.5]" />
                          ) : (
                            <Icon className={cn("w-4 h-4", isActive ? stage.color : "text-slate-400 dark:text-slate-500")} />
                          )}
                        </div>
                        {isActive && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                          </span>
                        )}
                      </div>

                      {/* Right: Titles */}
                      <div className="flex flex-col text-left">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest leading-none mb-1 transition-colors duration-300",
                          isCompleted ? "text-emerald-600 dark:text-emerald-400" :
                          isActive ? stage.color : "text-slate-400 dark:text-slate-600"
                        )}>
                          {stage.label}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider leading-none">
                          {stage.desc}
                        </span>
                      </div>
                    </div>

                    {/* Desktop Connector Line of Stepper */}
                    {i < stages.length - 1 && (
                      <div className="hidden md:block flex-1 max-w-[20px] lg:max-w-[40px] self-center h-0.5 relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                        <div className={cn(
                          "absolute top-0 left-0 h-full transition-all duration-700 bg-emerald-500",
                          isCompleted ? "w-full" : "w-0"
                        )} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 -mt-2">
        {/* Form Sections */}
        <div className="lg:col-span-7 space-y-6 w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex border-b border-slate-200 gap-8 mb-6 overflow-x-auto pb-px scrollbar-hide">
              {['personal', 'contact', 'package', 'financials', 'remarks'].filter(t => t !== 'remarks' || id).map((tab) => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "pb-3 text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap",
                    activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {tab === 'personal' ? 'Pax Details' : 
                   tab === 'package' ? 'Package' :
                   tab === 'financials' ? 'Financials' :
                   tab === 'remarks' ? 'Remarks' : 
                   tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm min-h-[460px] flex flex-col relative overflow-hidden transition-colors">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Plane className="w-32 h-32 text-slate-900 dark:text-slate-100" />
                </div>
             <TabsContent value="personal" className="space-y-6 m-0 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    Passenger Manifest ({passengers.length})
                  </h3>
                  {canEditSensitive && (
                    <Button 
                      type="button" 
                      variant="ghost"
                      onClick={(e) => { e.preventDefault(); addPassenger(); }} 
                      className="text-xs font-black text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 h-8 rounded-lg uppercase tracking-wider"
                    >
                      <Plus className="w-3 h-3 mr-1.5" />
                      Add Passenger
                    </Button>
                  )}
                </div>
                
                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {passengers.map((p, i) => (
                    <div key={p.id} className="p-6 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 relative group animate-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Passenger #{i + 1}</span>
                        {(passengers.length > 1 && canEditSensitive) && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removePassenger(p.id)}
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                        <div className="xl:col-span-6">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Passenger Full Name</label>
                          <input 
                            type="text" 
                            placeholder="JONATHAN HARRISON" 
                            value={p.name} 
                            onChange={(e) => updatePassenger(p.id, 'name', e.target.value)}
                            readOnly={!canEditSensitive}
                            className={cn(
                                "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase font-bold",
                                !canEditSensitive && "bg-slate-50 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed"
                            )}
                          />
                        </div>
                        <div className="xl:col-span-3">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Gender</label>
                          <select 
                            value={p.gender} 
                            onChange={(e) => updatePassenger(p.id, 'gender', e.target.value)}
                            disabled={!canEditSensitive}
                            className={cn(
                              "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold cursor-pointer",
                              !canEditSensitive && "bg-slate-50 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed"
                            )}
                          >
                            <option value="Male">MALE</option>
                            <option value="Female">FEMALE</option>
                            <option value="Other">OTHER</option>
                          </select>
                        </div>
                        <div className="xl:col-span-3">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Passenger Type</label>
                          <select 
                            value={p.ptc === 'Adult' ? 'ADT' : (p.ptc || 'ADT')} 
                            onChange={(e) => updatePassenger(p.id, 'ptc', e.target.value)}
                            disabled={!canEditSensitive}
                            className={cn(
                              "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold cursor-pointer",
                              !canEditSensitive && "bg-slate-50 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed"
                            )}
                          >
                            <option value="ADT">Adult</option>
                            <option value="CHD">Child (CHD)</option>
                            <option value="INF">Infant (INF)</option>
                            <option value="UNMR">Unaccompanied Minor (UNMR)</option>
                          </select>
                        </div>

                        {/* Next line of Passenger full name */}
                        <div className="xl:col-span-6">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Date of Birth</label>
                          <input 
                            type="date" 
                            value={p.dob} 
                            onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                            onChange={(e) => updatePassenger(p.id, 'dob', e.target.value)}
                            readOnly={!canEditSensitive}
                            className={cn(
                              "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-bold",
                              !canEditSensitive && "bg-slate-50 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed"
                            )}
                          />
                        </div>
                        <div className="xl:col-span-6">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Frequent Flyer Number</label>
                          <input 
                            type="text" 
                            placeholder="E.G. AA12903" 
                            value={p.frequentFlyerNumber || ''} 
                            onChange={(e) => updatePassenger(p.id, 'frequentFlyerNumber', e.target.value)}
                            readOnly={!canEditSensitive}
                            className={cn(
                                "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase font-bold",
                                !canEditSensitive && "bg-slate-50 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {passengers.length < 5 && canEditSensitive && (
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={addPassenger}
                    className="w-full h-12 border-dashed border-2 border-slate-200 dark:border-slate-800 text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50 rounded-2xl transition-all font-bold uppercase tracking-[0.2em] text-[10px]"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Enroll Additional Passenger
                  </Button>
                )}

                <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-colors bg-white dark:bg-slate-900/50">
                  <table className="w-full border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 transition-colors">
                      <tr>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">#</th>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Passenger Manifest Details</th>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">DOB</th>
                        <th className="text-right p-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passengers.map((p, i) => (
                        <tr key={p.id} className="border-t border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="p-4 text-xs text-slate-400 dark:text-slate-500 font-mono italic">{i + 1}</td>
                          <td className="p-4 text-xs font-bold text-slate-800 dark:text-slate-100 tracking-tight uppercase">
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {p.name || 'UNSPECIFIED'} 
                              <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-black text-[9px] text-slate-500">
                                {(p.ptc === 'ADT' || p.ptc === 'Adult') ? 'Adult' : (p.ptc === 'CHD' ? 'Child (CHD)' : (p.ptc === 'INF' ? 'Infant (INF)' : (p.ptc === 'UNMR' ? 'Unaccompanied Minor (UNMR)' : p.ptc || 'Adult')))}
                              </span>
                              {p.frequentFlyerNumber && (
                                <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/30 rounded font-bold text-[9px]">FF: {p.frequentFlyerNumber}</span>
                              )}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-slate-500 dark:text-slate-400 font-medium">{p.dob || '---'}</td>
                          <td className="p-4 text-xs text-right">
                             <div className="flex items-center justify-end gap-2">
                               <span className={cn("inline-block w-2 h-2 rounded-full", p.name ? "bg-emerald-500" : "bg-red-400")} />
                               <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{p.name ? 'Verified' : 'Incomplete'}</span>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-6 m-0 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="email@example.com" 
                      value={contact.email} 
                      onChange={(e) => setContact({...contact, email: e.target.value})}
                      readOnly={!!id}
                      className={cn(
                        "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all",
                        id && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                      )}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                    <input 
                      type="tel" 
                      placeholder="+1 234 567 890" 
                      value={contact.phone} 
                      onChange={(e) => setContact({...contact, phone: e.target.value})}
                      readOnly={!canEditSensitive}
                      className={cn(
                        "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all",
                        !canEditSensitive && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                      )}
                    />
                  </div>
                </div>
                <div>
                   <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Street Address</label>
                   <input 
                      type="text" 
                      placeholder="123 Travel Lane" 
                      value={contact.address} 
                      onChange={(e) => setContact({...contact, address: e.target.value.toUpperCase()})}
                      readOnly={!!id}
                      className={cn(
                        "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all uppercase font-medium",
                        id && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                      )}
                    />
                </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">City</label>
                       <input 
                        type="text" 
                        value={contact.city} 
                        onChange={(e) => setContact({...contact, city: e.target.value.toUpperCase()})}
                        readOnly={!!id}
                        className={cn(
                          "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-bold uppercase",
                          id && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">State / Prov</label>
                      <input 
                        type="text" 
                        value={contact.state} 
                        onChange={(e) => setContact({...contact, state: e.target.value.toUpperCase()})}
                        readOnly={!!id}
                        className={cn(
                          "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-bold uppercase",
                          id && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                        )}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Zip Code</label>
                      <input 
                        type="text" 
                        value={contact.zip} 
                        onChange={(e) => setContact({...contact, zip: e.target.value.toUpperCase()})}
                        readOnly={!!id}
                        className={cn(
                          "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-bold uppercase",
                          id && "bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Resident Country</label>
                    <select 
                      value={contact.country}
                      onChange={(e) => setContact({...contact, country: e.target.value})}
                      disabled={!!id}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-all font-medium appearance-none disabled:opacity-70 disabled:bg-slate-50 disabled:dark:bg-slate-800/50"
                    >
                      <option value="United States">UNITED STATES</option>
                      <option value="United Kingdom">UNITED KINGDOM</option>
                      <option value="Canada">CANADA</option>
                      <option value="Australia">AUSTRALIA</option>
                      <option value="Germany">GERMANY</option>
                      <option value="France">FRANCE</option>
                      <option value="India">INDIA</option>
                      <option value="United Arab Emirates">UNITED ARAB EMIRATES</option>
                      <option value="Other">OTHER</option>
                    </select>
                  </div>
              </TabsContent>

              <TabsContent value="package" className="space-y-8 m-0 animate-in slide-in-from-right-4 duration-300">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                     <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600">
                        <Plane className="w-5 h-5" />
                     </div>
                     <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Itinerary Details</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Specify route and carrier credentials</p>
                     </div>
                  </div>

                  <div className={`grid grid-cols-1 md:grid-cols-${tripType === 'One-Way' ? '2' : '3'} gap-6`}>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Trip Type</label>
                        <select 
                          value={tripType}
                          onChange={(e) => setTripType(e.target.value)}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 appearance-none focus:border-blue-500 transition-all font-medium"
                        >
                            <option value="One-Way">One-Way</option>
                            <option value="Round Trip">Round Trip</option>
                            <option value="Multi-City">Multi-City</option>
                        </select>
                    </div>
                    {tripType !== 'Multi-City' && (
                      <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Departure Date</label>
                            <input 
                              type="date"
                              value={departureDate}
                              onChange={(e) => setDepartureDate(e.target.value)}
                              onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-3 text-base h-12 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all font-medium [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        {tripType === 'Round Trip' && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                              Return Date
                            </label>
                            <input 
                              type="date"
                              value={arrivalDate}
                              onChange={(e) => setArrivalDate(e.target.value)}
                              onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                              min={departureDate}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-3 text-base h-12 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all font-medium [color-scheme:light] dark:[color-scheme:dark]"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {tripType === 'Multi-City' ? (
                    <div className="space-y-4 pt-2">
                       <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Flight Segments</label>
                       {multiCitySegments.map((segment, index) => (
                         <div key={segment.id} className="flex gap-4 items-center">
                           <div className="flex-1">
                             <input 
                               type="date" 
                               value={segment.departureDate} 
                               onClick={(e) => { try { e.currentTarget.showPicker(); } catch(err) {} }}
                               onChange={(e) => {
                                 const updated = [...multiCitySegments];
                                 updated[index].departureDate = e.target.value;
                                 setMultiCitySegments(updated);
                               }}
                               className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-3 h-12 text-base focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                             />
                           </div>
                           <div className="flex-[1.5]">
                             <input 
                               type="text" 
                               placeholder="Origin (e.g. LHR)" 
                               value={segment.origin} 
                               onChange={(e) => {
                                 const updated = [...multiCitySegments];
                                 updated[index].origin = e.target.value.toUpperCase();
                                 setMultiCitySegments(updated);
                               }}
                               className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-xs uppercase focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none"
                             />
                           </div>
                           <div className="flex-[1.5]">
                             <input 
                               type="text" 
                               placeholder="Destination (e.g. JFK)" 
                               value={segment.destination} 
                               onChange={(e) => {
                                 const updated = [...multiCitySegments];
                                 updated[index].destination = e.target.value.toUpperCase();
                                 setMultiCitySegments(updated);
                               }}
                               className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-xs uppercase focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 outline-none"
                             />
                           </div>
                           <Button 
                             type="button"
                             variant="ghost" 
                             size="icon" 
                             className="h-8 w-8 text-red-500 hover:bg-red-50"
                             onClick={() => setMultiCitySegments(multiCitySegments.filter(s => s.id !== segment.id))}
                           >
                              <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>
                       ))}
                       <Button 
                         type="button"
                         variant="outline" 
                         size="sm" 
                         onClick={() => setMultiCitySegments([...multiCitySegments, { id: Date.now() + Math.random(), origin: '', destination: '', departureDate: '' }])}
                         className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600"
                       >
                         <Plus className="w-3 h-3" /> Add Segment
                       </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                    <div className="relative">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Origin Airport</label>
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="LHR - London Heathrow" 
                          value={originSearch}
                          onChange={(e) => {
                            setOriginSearch(e.target.value);
                            setShowOriginResults(true);
                          }}
                          onFocus={() => setShowOriginResults(true)}
                          onBlur={() => setTimeout(() => setShowOriginResults(false), 200)}
                          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all uppercase font-medium"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      </div>
                      
                      {showOriginResults && (originSearch || origin) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          {filteredOriginAirports.map(a => (
                            <button 
                              key={a.iata} 
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between group"
                              onClick={() => {
                                setOrigin(a.iata);
                                setOriginSearch(a.iata);
                                setShowOriginResults(false);
                              }}
                            >
                               <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">{a.iata}</span>
                                 <span className="text-[10px] text-slate-400 font-bold uppercase">{a.name}</span>
                               </div>
                               <ChevronRight className="w-3 h-3 text-slate-200 group-hover:text-blue-500 transition-all" />
                            </button>
                          ))}
                          {filteredOriginAirports.length === 0 && (
                            <div className="px-4 py-3 text-[10px] text-slate-400 italic">No exact matches. Using: {originSearch.toUpperCase()}</div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="relative">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Destination Airport</label>
                      <div className="relative group">
                        <input 
                          type="text" 
                          placeholder="JFK - New York" 
                          value={destSearch}
                          onChange={(e) => {
                            setDestSearch(e.target.value);
                            setShowDestResults(true);
                          }}
                          onFocus={() => setShowDestResults(true)}
                          onBlur={() => setTimeout(() => setShowDestResults(false), 200)}
                          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all uppercase font-medium"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
                      </div>

                      {showDestResults && (destSearch || destination) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          {filteredDestAirports.map(a => (
                            <button 
                              key={a.iata} 
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between group"
                              onClick={() => {
                                setDestination(a.iata);
                                setDestSearch(a.iata);
                                setShowDestResults(false);
                              }}
                            >
                               <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">{a.iata}</span>
                                 <span className="text-[10px] text-slate-400 font-bold uppercase">{a.name}</span>
                               </div>
                               <ChevronRight className="w-3 h-3 text-slate-200 group-hover:text-blue-500 transition-all" />
                            </button>
                          ))}
                          {filteredDestAirports.length === 0 && (
                            <div className="px-4 py-3 text-[10px] text-slate-400 italic">No exact matches. Using: {destSearch.toUpperCase()}</div>
                          )}
                        </div>
                      )}
                    </div>
                   </div>
                  )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Cabin Class</label>
                          <select 
                            value={cabinClass}
                            onChange={(e) => setCabinClass(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 appearance-none focus:border-blue-500 transition-all font-medium"
                          >
                              <option value="Economy">Economy</option>
                              <option value="Premium Economy">Premium Economy</option>
                              <option value="Business Class">Business Class</option>
                              <option value="First Class">First Class</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                            {emailTemplateType === 'changes' || emailTemplateType === 'cancel' ? 'Old PNR' : 'Carrier PNR'}
                          </label>
                          <input 
                            type="text" 
                            placeholder="ABCDEF"
                            value={pnr}
                            onChange={(e) => setPnr(e.target.value.toUpperCase())}
                            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all uppercase font-bold"
                          />
                      </div>
                    </div>
                    
                    {(emailTemplateType === 'changes' || emailTemplateType === 'cancel') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">New PNR (if modified)</label>
                            <input 
                              type="text" 
                              placeholder="XYZ123"
                              value={oldPnr}
                              onChange={(e) => setOldPnr(e.target.value.toUpperCase())}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all uppercase font-bold"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Modification Details (e.g. Seat Upgrade)</label>
                            <input 
                              type="text" 
                              placeholder="Upgraded to Economy Plus / Change of Date"
                              value={modificationDetails}
                              onChange={(e) => setModificationDetails(e.target.value.toUpperCase())}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all font-bold uppercase"
                            />
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator className="bg-slate-100 dark:bg-slate-800" />

                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center text-purple-600">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Snapshot Manifest</h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Paste screenshots directly into the editor</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={cn("text-[10px] font-black uppercase tracking-widest h-8", isHtmlMode ? "bg-slate-100 dark:bg-slate-800" : "")}
                          onClick={() => {
                            if (isHtmlMode) {
                              setPackageRichText(sanitizeHtml(packageRichText));
                            }
                            setIsHtmlMode(!isHtmlMode);
                          }}
                        >
                          {isHtmlMode ? 'View Visual' : 'Paste Source Code'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-[10px] font-black uppercase tracking-widest h-8 text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 flex items-center gap-2"
                          onClick={() => {
                            navigator.clipboard.writeText(packageRichText);
                            toast.success('HTML Source Code copied to clipboard');
                          }}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Copy Source Code
                        </Button>
                      </div>
                    </div>
                  
                  <div className="rich-text-editor-container h-[260px] relative mt-4">
                    {isHtmlMode ? (
                      <Textarea 
                        value={packageRichText}
                        onChange={(e) => setPackageRichText(e.target.value)}
                        placeholder="Paste HTML source code here..."
                        className="w-full h-[200px] font-mono text-xs p-4 bg-slate-900 text-slate-100 rounded-xl resize-none border-slate-800 focus:ring-0"
                      />
                    ) : (
                      <div className="h-[200px] relative group border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <ReactQuill 
                          theme="snow"
                          value={packageRichText}
                          onChange={setPackageRichText}
                          placeholder="Paste verification snapshots and flight details here..."
                          className="h-full bg-white dark:bg-slate-900/50 transition-all font-medium text-sm"
                          modules={{
                            toolbar: [
                              [{ 'header': [1, 2, 3, false] }],
                              ['bold', 'italic', 'underline', 'strike'],
                              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                              ['link', 'image', 'clean'],
                              [{ 'color': [] }, { 'background': [] }],
                              [{ 'align': [] }]
                            ],
                          }}
                        />
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex items-center gap-2 pointer-events-none z-20">
                       <Badge className="bg-slate-900/50 text-[8px] font-bold">RICH TEXT ACTIVE</Badge>
                       <Badge className="bg-blue-600/80 text-[8px] font-bold">{isHtmlMode ? 'SOURCE MODE' : 'SNAPSHOTS ENABLED'}</Badge>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="financials" className="space-y-8 m-0 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Operating Airline</label>
                    <div className="relative flex items-center">
                      {airlineDomain && !logoError && (
                        <div className="absolute left-3 w-6 h-6 bg-white dark:bg-slate-900 rounded-md border border-slate-100 dark:border-slate-800 flex items-center justify-center p-0.5 z-10">
                          <img 
                            src={`/api/proxy-logo?domain=${airlineDomain}`} 
                            alt="Logo"
                            crossOrigin="anonymous"
                            className="w-full h-full object-contain"
                            onError={() => setLogoError(true)}
                          />
                        </div>
                      )}
                      <input 
                        type="text" 
                        placeholder="DELTA AIRLINES" 
                        value={airlineName} 
                        onChange={(e) => { setAirlineName(e.target.value.toUpperCase()); setLogoError(false); }}
                        className={cn(
                          "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg py-2.5 text-sm focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-500 outline-none transition-all font-bold tracking-tight uppercase",
                          airlineDomain && !logoError ? "pl-11" : "px-4"
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Currency Code</label>
                    <select 
                        value={pricing.currency} 
                        onChange={(e) => setPricing({...pricing, currency: e.target.value})}
                        disabled={!!id}
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none appearance-none focus:border-blue-500 transition-all font-bold disabled:opacity-70"
                    >
                        <option value="USD">USD - US Dollar</option>
                        <option value="GBP">GBP - British Pound</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="INR">INR - Indian Rupee</option>
                        <option value="AED">AED - Emirati Dirham</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                     <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600">
                        <DollarSign className="w-5 h-5" />
                     </div>
                     <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Financial Breakdown</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Configure fare splits and payment gateway</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                          {emailTemplateType === 'changes' ? 'Rebooking Difference Fee' : 'Airline Cost'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{pricing.currency}</span>
                          <input 
                            type="number" 
                            value={pricing.airline || ''} 
                            onChange={(e) => handlePriceChange('airline', e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none font-bold focus:border-blue-500 transition-all shadow-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                          {emailTemplateType === 'cancel' ? 'Cancellation Fee' :
                           emailTemplateType === 'changes' ? 'Changes Fee' :
                           emailTemplateType === 'refund' ? 'Refund Issuance Fee' : 'Service Fee'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-black">{pricing.currency}</span>
                          <input 
                            type="number" 
                            value={pricing.service || ''} 
                            onChange={(e) => handlePriceChange('service', e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none font-bold focus:border-blue-500 transition-all shadow-sm"
                          />
                        </div>
                      </div>
                      {emailTemplateType === 'refund' && (
                        <>
                          <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">Refund Type</label>
                            <select
                              value={pricing.refundType || 'original'}
                              onChange={(e) => setPricing({ ...pricing, refundType: e.target.value as 'original' | 'credit' })}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-4 py-2.5 text-sm outline-none font-bold focus:border-blue-500 transition-all shadow-sm"
                            >
                              <option value="original">Refund To Original Payment Method</option>
                              <option value="credit">Airline Credit</option>
                            </select>
                          </div>
                          {pricing.refundType !== 'credit' ? (
                            <div>
                              <label className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-1.5 block">Total Refund Quote</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-black">{pricing.currency}</span>
                                <input 
                                  type="number" 
                                  value={pricing.refundQuote || ''} 
                                  onChange={(e) => handlePriceChange('refundQuote', e.target.value)}
                                  className="w-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/20 text-slate-900 dark:text-slate-100 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none font-bold focus:border-emerald-500 transition-all shadow-sm"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-1.5 block">Airline Credits</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-black">PTS</span>
                                <input 
                                  type="number" 
                                  value={pricing.airlineCredits || ''} 
                                  onChange={(e) => handlePriceChange('airlineCredits', e.target.value)}
                                  className="w-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/20 text-slate-900 dark:text-slate-100 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none font-bold focus:border-emerald-500 transition-all shadow-sm"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="bg-slate-900 dark:bg-black rounded-3xl p-8 flex flex-col justify-between text-white relative overflow-hidden ring-1 ring-white/10">
                       <div className="absolute top-0 right-0 p-4 opacity-10">
                          <DollarSign className="w-20 h-20" />
                       </div>
                       <div>
                           <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">
                             {emailTemplateType === 'refund' ? 'Total Refund Charges' :
                              emailTemplateType === 'changes' ? 'Total Fare Difference' : 'Total Authorization Sum'}
                           </p>
                          <div className="flex items-baseline gap-2">
                             <span className="text-xl font-bold opacity-40">{pricing.currency}</span>
                             <span className="text-5xl font-black tracking-tight">{pricing.total.toLocaleString()}</span>
                          </div>
                       </div>
                       
                       <div className="mt-6 space-y-4 pt-6 border-t border-white/10">
                          <div>
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Validated Gateway</label>
                            <input 
                              type="text" 
                              placeholder="AMEX CONNECT / STRIPE"
                              value={validatedGateway}
                              onChange={(e) => setValidatedGateway(e.target.value.toUpperCase())}
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs font-black text-blue-400 outline-none focus:ring-1 focus:ring-blue-500/50 uppercase tracking-widest"
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                            <span>Splits Active</span>
                            <span className="text-blue-400">Ready for dispatch</span>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-100 dark:bg-slate-800" />

                <div className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600">
                        <CreditCard className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Card Credentials</h3>
                  </div>

                  {!(canViewCC || addingNewCard) ? (
                     <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center flex-col gap-3">
                       <Lock className="w-6 h-6 text-slate-400" />
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Card Details Hidden<br/>Manager privileges required to view or modify</span>
                       <Button 
                         type="button" 
                         variant="outline" 
                         size="sm" 
                         className="text-[10px] font-black uppercase tracking-widest text-indigo-700 h-8 hover:bg-slate-100"
                         onClick={() => {
                           setPayment({ ccName: '', ccNumber: '', expiry: '', cvv: '' });
                           setAddingNewCard(true);
                           toast.info("Enter details for the new card.");
                         }}
                       >
                         Add Card
                       </Button>
                     </div>
                  ) : (
                  <div className="space-y-4">
                    <Input 
                      placeholder="CARD HOLDER NAME" 
                      value={payment.ccName}
                      onChange={(e) => setPayment({...payment, ccName: e.target.value.replace(/[^a-zA-Z\s]/g, '').toUpperCase()})}
                      className="bg-slate-50/50 border-slate-200 dark:border-slate-800 font-bold tracking-widest text-xs h-11 uppercase"
                    />
                    <Input 
                      placeholder="CARD NUMBER" 
                      value={payment.ccNumber}
                      onChange={handleCCNumberChange}
                      className="bg-slate-50/50 border-slate-200 dark:border-slate-800 font-mono tracking-[0.2em] text-xs h-11"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        type="text"
                        placeholder="EXPIRY MM/YY" 
                        value={payment.expiry}
                        maxLength={5}
                        onChange={handleExpiryChange}
                        className="bg-slate-50/50 border-slate-200 dark:border-slate-800 font-mono tracking-widest text-xs h-11"
                      />
                      <Input 
                        placeholder="SECURITY CVV" 
                        value={payment.cvv}
                        onChange={handleCvvChange}
                        className="bg-slate-50/50 border-slate-200 dark:border-slate-800 font-mono tracking-widest text-xs h-11"
                      />
                    </div>
                  </div>
                  )}

                  <div className="pt-4 flex items-center justify-between">
                     <div className="flex gap-2">
                       {['Visa', 'Mastercard', 'American Express'].map(b => (
                         <div key={b} className={cn(
                           "px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-all",
                           detectBrand(payment.ccNumber) === b ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 text-slate-300 border-slate-100 opacity-50"
                         )}>
                           {b === 'American Express' ? 'AMEX' : b.toUpperCase()}
                         </div>
                       ))}
                     </div>
                     <Badge variant="outline" className="text-[8px] border-emerald-200 text-emerald-600 font-black uppercase tracking-widest">3D Secure Ready</Badge>
                  </div>
                </div>
              </TabsContent>

              {id && (
                <TabsContent value="remarks" className="space-y-6 m-0 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                              <ListChecks className="w-5 h-5" />
                          </div>
                          <div>
                              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Internal Booking Remarks</h3>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Audit notes, special handling, and state updates</p>
                          </div>
                        </div>
                        <Button 
                          type="button"
                          disabled={loading || !newRemark.trim()}
                          onClick={(e) => { 
                            e.preventDefault(); 
                            saveRemarksOnly(); 
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest h-9 px-4 rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                        >
                          {loading ? (
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                              <Save className="w-3.5 h-3.5" />
                          )}
                          {loading ? 'Saving...' : 'Save Remark'}
                        </Button>
                      </div>
                      <div className="p-8 bg-slate-50/50 dark:bg-slate-800/30 rounded-3xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">New remark</label>
                            <div className="flex gap-2">
                               <Button 
                                 variant="ghost" 
                                 className="h-6 text-[8px] font-black uppercase tracking-[0.1em] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 border border-blue-100"
                                 onClick={() => setNewRemark("✅ [EMAIL_VERIFIED] Pax responded via email confirming itinerary and identity.")}
                               >
                                 Verified Email
                               </Button>
                               <Button 
                                 variant="ghost" 
                                 className="h-6 text-[8px] font-black uppercase tracking-[0.1em] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 border border-emerald-100"
                                 onClick={() => setNewRemark("🛡️ [AUTH_VERIFIED] Customer has completed the digital authorization successfully. Ready for ticketing.")}
                               >
                                 Verified Auth
                               </Button>
                               <Button 
                                 variant="ghost" 
                                 className="h-6 text-[8px] font-black uppercase tracking-[0.1em] text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 border border-purple-100"
                                 onClick={() => setNewRemark("💬 [TEAM_COMMENT] Sales: \nFraud: \nTicketing: \n---")}
                               >
                                 Team Comments
                               </Button>
                            </div>
                          </div>
                          <Textarea 
                            placeholder="Add a new internal note here... (Press Enter to save, Shift+Enter for new line)"
                            value={newRemark}
                            onChange={(e) => setNewRemark(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!loading && newRemark.trim()) {
                                  saveRemarksOnly();
                                }
                              }
                            }}
                            className="min-h-[120px] bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-sm font-medium p-6 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-inner mb-4"
                          />

                          <div className="flex justify-end mb-6">
                            <Button 
                              type="button"
                              disabled={loading || !newRemark.trim()}
                              onClick={(e) => { 
                                e.preventDefault(); 
                                saveRemarksOnly(); 
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest h-10 px-6 rounded-xl shadow-lg shadow-emerald-100 dark:shadow-none transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                            >
                              {loading ? (
                                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                  <Save className="w-3.5 h-3.5" />
                              )}
                              {loading ? 'Saving...' : 'Save Remark'}
                            </Button>
                          </div>
                          
                          {remarks && (
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Remark History</label>
                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 max-h-[400px] overflow-y-auto space-y-4">
                                    {remarks.split('\n\n').reverse().map((r, idx) => (
                                       <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-50 dark:border-slate-700 relative group">
                                           <div className="absolute top-4 left-0 w-1 h-3 bg-emerald-500 rounded-r-full"></div>
                                           <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 whitespace-pre-wrap block leading-relaxed">{r}</span>
                                       </div>
                                    ))}
                                </div>
                            </div>
                          )}

                          {signatureData && (
                            <div className="space-y-4 mt-6">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Authorized Pax Signature</label>
                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 flex items-center justify-center">
                                    <img src={signatureData} alt="Passenger Signature" className="max-h-32 object-contain filter dark:invert" />
                                </div>
                            </div>
                          )}
                      </div>
                    </div>
                </TabsContent>
              )}
              
              {/* Dynamic Footer Trace */}
              <div className="mt-auto pt-8 border-t border-slate-50">
                <div className="bg-slate-50/50 px-6 py-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-8 items-center">
                    <div className="flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { navigator.clipboard.writeText(crmId || 'SW-PREVIEW'); toast.success('Trace ID copied'); }}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction Trace ID</span>
                        <span className="text-xs font-bold text-slate-800 font-mono">{crmId || 'SW-PREVIEW'}</span>
                    </div>
                    <div className="flex flex-col gap-1 pl-8 border-l border-slate-200">
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Validated Gateway</span>
                         <span className="text-xs font-black text-blue-600 uppercase tracking-wider">{airlineName || 'SKYWAY CENTRAL'}</span>
                    </div>
                </div>
              </div>
            </div>
          </Tabs>
        </div>

        {/* Floating Preview Module */}
        <div className="lg:col-span-5 flex flex-col gap-6 w-full">
          <div className="flex items-center gap-3 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] hidden sm:block">Live Visualization Bridge</span>
            <div className="h-px flex-1 bg-slate-200" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyRawHtml}
              className="h-8 px-3 ml-2 text-[10px] font-black uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-blue-200 dark:border-blue-800"
            >
              <FileText className="w-3 h-3 mr-2" /> HTML
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="h-8 px-3 text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 animate-fade-in"
              title="Generate a screen capture rendering PDF"
            >
              <Download className="w-3 h-3 mr-2" /> PDF Screen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadStructuredReport}
              className="h-8 px-3 ml-2 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white dark:text-slate-100 border-0 shadow-sm"
              title="Generate a structured transactional PDF report"
            >
              <FileText className="w-3 h-3 mr-2" /> Report PDF
            </Button>
          </div>

          <div className="flex-1 bg-slate-200/50 rounded-3xl p-8 shadow-inner overflow-hidden border-[12px] border-white relative group cursor-crosshair">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent pointer-events-none" />
            
            {/* Real-time Email Component */}
            <div ref={previewRef} className="bg-white dark:bg-slate-900 h-[800px] w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden transform group-hover:scale-[1.015] transition-all duration-700 ease-out border border-slate-100 dark:border-slate-800 relative">
               <iframe srcDoc={previewHtml} className="absolute inset-0 w-full h-full border-0 bg-white" sandbox="allow-same-origin allow-scripts" />
            </div>
          </div>
        </div>
      </div>
    </div>

       {/* SMTP Profile Selection Dialog */}
       <AlertDialog open={showConfirmSend} onOpenChange={() => navigate('/bookings')}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispatch Authorization</AlertDialogTitle>
            <AlertDialogDescription>
              Booking created successfully. Choose which account to use for sending the verification link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Select Sender Email</Label>
              <select 
                value={selectedProfileIndex}
                onChange={(e) => setSelectedProfileIndex(Number(e.target.value))}
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {settings?.smtpProfiles?.map((p: any, i: number) => (
                  <option key={i} value={i}>{p.label} ({p.email})</option>
                ))}
                {(!settings?.smtpProfiles || settings.smtpProfiles.length === 0) && (
                  <option disabled>No profiles configured in Settings</option>
                )}
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate('/bookings')}>Skip Email</AlertDialogCancel>
            <AlertDialogAction onClick={executeSend}>Send Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
