// @ts-nocheck
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { logAudit, AuditAction } from '@/lib/auditLogger';
import { 

  generateBookingConfirmation, 
  generatePaymentAuth, 
  generatePassengerInvoice,
  generateConsolidatedReport 
} from '@/lib/pdfGenerator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Eye, 
  Trash2, 
  Mail, 
  Download,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plane,
  FileText,
  CreditCard,
  Receipt,
  Info,
  Zap,
  DollarSign,
  Link,
  Shield,
  XCircle,
  CircleDashed
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useTenant, getDbPath } from '@/lib/tenant';


export default function AllBookings({ filter = 'all', profile }: { filter?: 'all' | 'draft' | 'authorized', profile?: any }) {
  const { clientId, activeClient } = useTenant();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [dateTypeFilter, setDateTypeFilter] = useState<'createdAt' | 'departureDate'>('createdAt');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Superadmin';
  const isManager = profile?.role === 'Admin' || profile?.role === 'Manager' || profile?.role === 'Superadmin';

  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    // Fetch global settings
    api.get('/settings').then(res => {
      setSettings(res.data);
    }).catch(console.error);

    // Fetch bookings
    api.get('/bookings', { params: { limit: 500 } }).then(res => {
      setBookings(res.data.bookings || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });

    // Fetch users (agents) for filtering - only if manager or admin
    if (isManager) {
      api.get('/settings/users').then(res => {
        setUsers(res.data.users || []);
      }).catch(err => {
        console.warn("Limited access: Staff directory requires Manager level clearance");
        setUsers([]);
      });
    }

    return () => {};
  }, [isManager]);

  const [sendingEmail, setSendingEmail] = useState<any>(null);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState(0);
  const [emailTemplateType, setEmailTemplateType] = useState('auth');

  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    try {
      await api.put('/bookings/' + bookingId, { status: newStatus });
      logAudit(AuditAction.BOOKING_EDITED, `Booking status updated to ${newStatus}`, bookingId);
      toast.success(`Booking status updated to ${newStatus}`);
    } catch (error) {
      /* handled error */
      toast.error('Failed to update booking status');
    }
  };

  const handleDownloadPdf = async (booking: any, type: 'confirmation' | 'auth' | 'invoice') => {
    try {
      const pSnap = { docs: [] };
      const passengers = pSnap.docs.map(d => d.data());
      
      const branding = settings ? {
        organizationName: settings.organizationName,
        supportPhone: settings.supportPhone,
        supportEmail: settings.supportEmail,
        logoUrl: settings.logoUrl,
        fullAddress: settings.fullAddress,
        primaryColor: settings.primaryColor
      } : undefined;

      switch (type) {
        case 'confirmation':
          generateBookingConfirmation(booking, passengers, branding);
          break;
        case 'auth':
          generatePaymentAuth(booking, booking.signatureData, branding);
          break;
        case 'invoice':
          generatePassengerInvoice(booking, passengers, branding);
          break;
      }
    } catch (err) {
      console.error("PDF Error:", err);
      toast.error("Failed to generate PDF");
    }
  };

  const executeResend = async () => {
    const booking = sendingEmail;
    const profile = settings?.smtpProfiles?.[selectedProfileIndex];
    
    if (!profile) {
      toast.error("No SMTP profile selected");
      return;
    }

    try {
      let passengersList = [];
      if (Array.isArray(booking.passengerDetails)) {
        passengersList = booking.passengerDetails;
      } else if (Array.isArray(booking.passengerNames)) {
        passengersList = booking.passengerNames.map((n: any) => typeof n === 'string' ? { name: n } : n);
      }
      
      const primaryPassenger = passengersList[0]?.name || (typeof booking.passengerNames?.[0] === 'string' ? booking.passengerNames[0] : '') || "Passenger";

      let endpoint = '/api/send-auth-email';
      if (emailTemplateType === 'refund') endpoint = '/api/send-refund-email';
      else if (emailTemplateType === 'cancel') endpoint = '/api/send-cancel-email';
      else if (emailTemplateType === 'changes') endpoint = '/api/send-changes-email';
      else if (emailTemplateType === 'confirmation') endpoint = '/api/send-confirmation-email';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          bookingId: booking.id, 
          crmId: booking.crmId,
          pnr: booking.pnr,
          oldPnr: booking.oldPnr,
          modificationDetails: booking.modificationDetails,
          packageRichText: booking.packageRichText || '',
          oldPackageRichText: booking.oldPackageRichText || '',
          cardHolderName: booking.cardHolder || booking.passengerNames?.[0] || '',
          cardLast4: booking.card_last4 || booking.cardNumberMasked || '',
          tripType: booking.tripType || '',
          departureDate: booking.departureDate || '',
          arrivalDate: booking.arrivalDate || '',
          multiCitySegments: booking.multiCitySegments || [],
          cabinClass: booking.cabinClass || '',
          passengers: passengersList,
          origin: booking.origin,
          destination: booking.destination,
          email: booking.contactEmail, 
          airlineName: booking.airlineName,
          passengerName: primaryPassenger,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          airlineCharges: booking.airlineCharges,
          serviceFee: booking.serviceFee,
          otherCharges: booking.otherCharges,
          refundQuote: booking.refundQuote,
          appUrl: window.location.origin,
          fromLabel: profile.label,
          fromEmail: profile.email,
          branding: settings
        })
      });
      
      const msg = await res.json();
      
      if (!res.ok) {
        throw new Error(msg.message || "Failed to send email");
      }

      // Store which email was used to send the auth
      await api.put("/bookings/" + booking.id, { status: "reminded" });

      await logAudit(AuditAction.BOOKING_EDITED, `${emailTemplateType.toUpperCase()} notification sent to ${booking.contactEmail} from ${profile.email} for booking ${booking.crmId}`, booking.id);
      toast.success(msg.message);
      setSendingEmail(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend authorization email");
    }
  };

  const deleteBooking = async (id: string, crmId: string) => {
    const bookingToDelete = bookings.find(b => b.id === id);
    const postAuthStatuses = ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'];
    const isAuthorized = bookingToDelete && postAuthStatuses.includes(bookingToDelete.status);

    const canDelete = profile?.role === 'Admin' || profile?.role === 'Superadmin' || 
                      ((profile?.role === 'Manager' || profile?.role === 'HOD') && !isAuthorized);

    if (!canDelete) {
      if ((profile?.role === 'Manager' || profile?.role === 'HOD') && isAuthorized) {
        toast.error("Security violation: Managers can only delete bookings that are unauthorized");
      } else {
        toast.error("Security violation: Role privileges required for data purge");
      }
      return;
    }
    await api.delete('/bookings/' + id);
    await logAudit(AuditAction.BOOKING_DELETED, `Booking ${crmId} permanently deleted from system`, id);
    toast.success("Record purged from system");
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const applyFilters = (data: any[]) => {
    let result = data.filter(b => {
      // Global Sidebar Filter (via props)
      if (filter === 'draft' && !(b.status === 'draft' || b.status === 'pending')) return false;
      if (filter === 'authorized' && !['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'].includes(b.status)) return false;

      // Status Filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Agent Filter
      if (agentFilter !== 'all' && b.agentId !== agentFilter) return false;

      // Date Filter
      if (dateFilter !== 'all') {
        if (dateFilter === 'custom') {
          let referenceDate = null;
          if (dateTypeFilter === 'createdAt') {
            if (b.createdAt) {
              if (typeof b.createdAt.toDate === 'function') referenceDate = b.createdAt.toDate();
              else if (typeof b.createdAt.seconds === 'number') referenceDate = new Date(b.createdAt.seconds * 1000);
              else referenceDate = new Date(b.createdAt);
            }
          } else {
            if (b.departureDate) {
              referenceDate = new Date(b.departureDate);
            }
          }

          if (!referenceDate || isNaN(referenceDate.getTime())) return false;

          const dateMs = referenceDate.getTime();

          if (customStartDate) {
            const start = new Date(customStartDate + 'T00:00:00');
            if (!isNaN(start.getTime()) && dateMs < start.getTime()) return false;
          }

          if (customEndDate) {
            const end = new Date(customEndDate + 'T23:59:59');
            if (!isNaN(end.getTime()) && dateMs > end.getTime()) return false;
          }
        } else {
          const now = new Date();
          let created = null;
          if (b.createdAt) {
            if (typeof b.createdAt.toDate === 'function') created = b.createdAt.toDate();
            else if (typeof b.createdAt.seconds === 'number') created = new Date(b.createdAt.seconds * 1000);
            else created = new Date(b.createdAt);
          }
          
          if (!created || isNaN(created.getTime())) return true; // Show if no date (fallback)

          const diff = now.getTime() - created.getTime();
          const days = diff / (1000 * 60 * 60 * 24);
          
          if (dateFilter === 'today' && days > 1) return false;
          if (dateFilter === 'week' && days > 7) return false;
          if (dateFilter === 'month' && days > 30) return false;
          if (dateFilter === 'quarter' && days > 90) return false;
          if (dateFilter === 'year' && days > 365) return false;
        }
      }

      // Search Term (CRM ID, Passenger, Email, Phone, Cardholder, Remarks)
      const term = searchTerm.toLowerCase();
      if (!term) return true;

      return (
        b.crmId?.toLowerCase().includes(term) ||
        b.pnr?.toLowerCase().includes(term) ||
        b.oldPnr?.toLowerCase().includes(term) ||
        b.airlineName?.toLowerCase().includes(term) ||
        b.contactEmail?.toLowerCase().includes(term) ||
        String(b.contactPhone || '').toLowerCase().includes(term) ||
        b.cardHolder?.toLowerCase().includes(term) ||
        b.ccName?.toLowerCase().includes(term) ||
        b.cardHolderName?.toLowerCase().includes(term) ||
        b.remarks?.toLowerCase().includes(term) ||
        b.passengerNames?.some((p: any) => {
          const pName = typeof p === 'string' ? p : (p?.name || '');
          return pName.toLowerCase().includes(term);
        })
      );
    });

    // Apply Sorting
    return result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle Firestore Timestamps and date strings
      if (sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
         const getTime = (val: any) => {
           if (!val) return 0;
           if (typeof val.toDate === 'function') return val.toDate().getTime();
           if (typeof val.seconds === 'number') return val.seconds * 1000;
           return new Date(val).getTime() || 0;
         };
         aVal = getTime(aVal);
         bVal = getTime(bVal);
      } else {
        if (aVal?.seconds !== undefined) aVal = aVal.seconds;
        if (bVal?.seconds !== undefined) bVal = bVal.seconds;
      }

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
      
      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return (aVal < bVal ? -1 : 1) * multiplier;
    });
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <Search className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-20 transition-opacity" />;
    return sortConfig.direction === 'asc' ? <Clock className="w-3 h-3 ml-2 text-blue-600" /> : <Clock className="w-3 h-3 ml-2 text-blue-600 rotate-180" />;
  };

  const filtered = applyFilters(bookings);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, agentFilter, dateFilter, filter, dateTypeFilter, customStartDate, customEndDate]);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
        toast.info("No data to export");
        return;
    }
    const headers = ['CRM ID', 'Airline', 'Status', 'Passengers', 'Amount', 'Date'];
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + filtered.map(e => `${e.crmId},${e.airlineName},${e.status},${e.passengerNames},${e.totalAmount},${e.createdAt}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Blackgrass_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Export successful");
  };

  const handleDownloadReport = () => {
    if (filtered.length === 0) {
      toast.info("No data to export");
      return;
    }
    try {
      generateConsolidatedReport(filtered);
      toast.success("Report downloaded");
    } catch (err: any) {
      console.error("PDF Report Error:", err);
      toast.error("Failed to generate PDF report");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700">
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-slate-100 uppercase">
            {filter === 'all' && 'Global Manifest'}
            {filter === 'draft' && 'Draft Bookings'}
            {filter === 'authorized' && 'Authorized Bookings'}
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Real-time record synchronization • IATA-Compliant</p>
        </div>
        <div className="flex items-center gap-4">
            <Button onClick={handleDownloadReport} variant="outline" className="h-11 border-slate-200 dark:border-slate-800 border-2 rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                <Download className="w-4 h-4 mr-2" />
                PDF Report
            </Button>
            <Button onClick={handleExportCSV} variant="outline" className="h-11 border-slate-200 dark:border-slate-800 border-2 rounded-xl px-6 text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                <Download className="w-4 h-4 mr-2" />
                Raw Data Export
            </Button>
            <Button onClick={() => setShowFilters(!showFilters)} className={cn("h-11 transition-all rounded-xl px-6 text-[10px] font-black uppercase tracking-widest shadow-xl", showFilters ? "bg-blue-600 text-white shadow-blue-600/20" : "bg-slate-900 text-white shadow-slate-900/20")}>
                <Filter className="w-4 h-4 mr-2" />
                System Filters
            </Button>
        </div>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 border-2 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-slate-900 transition-colors">
        <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 py-8 px-10 transition-colors">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="relative flex-1 max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input 
                            placeholder="Search CRM ID, Passenger, Email, Phone, Cardholder..." 
                            className="pl-12 h-12 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/20 transition-all border-2 text-slate-900 dark:text-slate-100" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Button 
                          variant="outline" 
                          onClick={() => setShowFilters(!showFilters)}
                          className={cn(
                            "h-12 px-6 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest gap-2 transition-all",
                            showFilters ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-100"
                          )}
                        >
                          <Filter className="w-4 h-4" />
                          {showFilters ? 'Hide Engine' : 'Advanced Filters'}
                        </Button>
                        <Badge variant="outline" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-black px-4 py-2 rounded-xl text-[10px] tracking-widest uppercase transition-colors">MATCHES: {filtered.length}</Badge>
                    </div>
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      key="advanced-filters"
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 24 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-6 p-6 bg-slate-50/50 dark:bg-slate-800/20 rounded-3xl border border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-4 duration-300">
                        {/* Selector Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lifecycle Status</label>
                              <select 
                                value={statusFilter} 
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 transition-all"
                              >
                                <option value="all">Any Status</option>
                                <option value="draft">Draft</option>
                                <option value="pending">Pending</option>
                                <option value="authorized">Authorized</option>
                                <option value="email auth confirm">Email Auth Confirm</option>
                                <option value="ready to charge">Ready to Charge</option>
                                <option value="sent for charge">Sent for Charge</option>
                                <option value="charged">Charged</option>
                                <option value="chargeback">Chargeback</option>
                                <option value="failed">Failed</option>
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Liaison</label>
                              <select 
                                value={agentFilter} 
                                onChange={(e) => setAgentFilter(e.target.value)}
                                className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 transition-all"
                              >
                                <option value="all">Global (All Agents)</option>
                                {users.map(u => (
                                  <option key={u.id} value={u.id}>{u.displayName || u.email}</option>
                                ))}
                              </select>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Temporal Range</label>
                              <select 
                                value={dateFilter} 
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="w-full h-11 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 transition-all"
                              >
                                <option value="all">All Time</option>
                                <option value="today">Today (Past 24h)</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                                <option value="quarter">Last 90 Days</option>
                                <option value="year">Last 365 Days</option>
                                <option value="custom">Custom Date Range...</option>
                              </select>
                          </div>
                        </div>

                        {/* Interactive Range Picker Segment */}
                        {dateFilter === 'custom' && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-5 items-end transition-all"
                          >
                            <div className="md:col-span-4 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filter Reference Date</label>
                                <div className="flex bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-100 dark:border-slate-850">
                                   <button
                                     type="button"
                                     onClick={() => setDateTypeFilter('createdAt')}
                                     className={cn(
                                       "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer",
                                       dateTypeFilter === 'createdAt' 
                                         ? "bg-slate-900 text-white dark:bg-slate-800 shadow-sm" 
                                         : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                                     )}
                                   >
                                     Creation Date
                                   </button>
                                   <button
                                     type="button"
                                     onClick={() => setDateTypeFilter('departureDate')}
                                     className={cn(
                                       "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer",
                                       dateTypeFilter === 'departureDate' 
                                         ? "bg-slate-900 text-white dark:bg-slate-800 shadow-sm" 
                                         : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                                     )}
                                   >
                                     Travel Date
                                   </button>
                                </div>
                            </div>

                            <div className="md:col-span-3 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                                <input 
                                  type="date"
                                  value={customStartDate}
                                  onChange={(e) => setCustomStartDate(e.target.value)}
                                  className="w-full h-11 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all cursor-pointer"
                                />
                            </div>

                            <div className="md:col-span-3 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                                <input 
                                  type="date"
                                  value={customEndDate}
                                  onChange={(e) => setCustomEndDate(e.target.value)}
                                  className="w-full h-11 bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-all cursor-pointer"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomStartDate('');
                                    setCustomEndDate('');
                                    setDateTypeFilter('createdAt');
                                  }}
                                  className="w-full h-11 border-2 border-dashed border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 dark:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                                >
                                  Clear range
                                </button>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full -mx-4 sm:mx-0">
            <Table className="min-w-[900px] w-full">
              <TableHeader className="bg-slate-50/30 dark:bg-slate-800/30">
                <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                <TableHead 
                  className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer group hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  onClick={() => handleSort('crmId')}
                >
                  <div className="flex items-center">
                    Trace ID
                    <SortIcon column="crmId" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer group hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  onClick={() => handleSort('airlineName')}
                >
                  <div className="flex items-center">
                    Carrier Assignment
                    <SortIcon column="airlineName" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer group hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  onClick={() => handleSort('contactEmail')}
                >
                  <div className="flex items-center">
                    Endpoint Contact
                    <SortIcon column="contactEmail" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer group hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  onClick={() => handleSort('totalAmount')}
                >
                  <div className="flex items-center">
                    Auth Sum
                    <SortIcon column="totalAmount" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer group hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Sync Status
                    <SortIcon column="status" />
                  </div>
                </TableHead>
                <TableHead className="text-right px-10 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Oversight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-40 uppercase tracking-[0.3em] font-black text-slate-200 text-xs">Accessing Records...</TableCell>
                </TableRow>
              ) : paginatedData.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-40 uppercase tracking-[0.3em] font-black text-slate-200 text-xs">Manifest Null</TableCell>
                </TableRow>
              ) : paginatedData.map((booking) => (
                <TableRow 
                  key={booking.id} 
                  className="group transition-all hover:bg-slate-100/50 dark:hover:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 cursor-pointer even:bg-slate-50/50 dark:even:bg-slate-800/50"
                  onClick={() => navigate(`/bookings/edit/${booking.id}`)}
                >
                  <TableCell className="px-10 py-6">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">{booking.crmId}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white transform group-hover:rotate-12 transition-transform shadow-lg shadow-slate-900/10">
                            <Plane className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-black text-slate-900 dark:text-slate-100 text-[13px] tracking-tight uppercase leading-none mb-1">{booking.airlineName || 'UNMAPPED'}</span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{booking.cardBrand || 'STANDARD'} AUTH</span>
                        </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-600 truncate max-w-[200px]">{booking.contactEmail}</span>
                        <span className="text-[10px] text-slate-400 font-medium font-mono">{booking.contactPhone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-baseline gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{booking.currency || 'USD'}</span>
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tighter">
                          {Number(booking.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1.5 justify-center">
                      <StatusBadge status={booking.status} />
                      {(() => {
                        const s = booking.status?.toLowerCase() || 'draft';
                        const level = ['draft'].includes(s) ? 1 :
                                      ['pending', 'email sent'].includes(s) ? 2 :
                                      ['email auth confirm', 'authorized', 'ready to charge'].includes(s) ? 3 :
                                      ['charged', 'chargeback'].includes(s) ? 4 : 1;
                        const isDisputed = s === 'chargeback';
                        return (
                          <div className="flex items-center gap-1 w-20 pl-0.5">
                            <span 
                              className={cn("h-1 w-full rounded-full transition-all duration-300", level >= 1 ? "bg-blue-500/80" : "bg-slate-200 dark:bg-slate-800")} 
                              title="Draft / Initiated" 
                            />
                            <span 
                              className={cn("h-1 w-full rounded-full transition-all duration-300", level >= 2 ? "bg-amber-500/80" : "bg-slate-200 dark:bg-slate-800")} 
                              title="Pending Verification" 
                            />
                            <span 
                              className={cn("h-1 w-full rounded-full transition-all duration-300", level >= 3 ? "bg-emerald-500/80" : "bg-slate-200 dark:bg-slate-800")} 
                              title="Authorized" 
                            />
                            <span 
                              className={cn(
                                "h-1 w-full rounded-full transition-all duration-300", 
                                isDisputed ? "bg-red-500 animate-pulse" : level >= 4 ? "bg-teal-600" : "bg-slate-200 dark:bg-slate-800"
                              )} 
                              title={isDisputed ? "Chargeback" : "Charged"} 
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right px-10">
                    <div className="flex items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={(props) => (
                            <button
                              {...props}
                              className="w-9 h-9 rounded-xl hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg transition-all border-0 shadow-none outline-none ring-0 inline-flex items-center justify-center text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onClick?.(e);
                              }}
                            >
                              <Download className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                            </button>
                          )}
                        />
                        <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-slate-100 dark:border-slate-800 dark:bg-slate-900">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 py-2">Document Export</DropdownMenuLabel>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="rounded-xl flex items-center gap-3 py-3 px-3 cursor-pointer hover:bg-blue-50 transition-colors" onClick={() => handleDownloadPdf(booking, 'confirmation')}>
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                <Plane className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">Full Booking Email</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Includes T&C + Voucher</span>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-xl flex items-center gap-3 py-3 px-3 cursor-pointer hover:bg-emerald-50 transition-colors" onClick={() => handleDownloadPdf(booking, 'auth')} disabled={booking.status !== 'authorized'}>
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <CreditCard className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">Auth Signature</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Verified Evidence</span>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="rounded-xl flex items-center gap-3 py-3 px-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => handleDownloadPdf(booking, 'invoice')}>
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                                <Receipt className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Fare Invoice</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">Price Breakdown</span>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-9 h-9 rounded-xl hover:bg-emerald-600 hover:text-white hover:shadow-lg hover:shadow-emerald-600/20 transition-all text-emerald-600" 
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = window.location.origin + '/authorize/' + booking.id;
                          navigator.clipboard.writeText(url);
                          toast.success('Public authorization link copied to clipboard');
                        }} 
                        title="Copy Public Link"
                      >
                        <Link className="w-4 h-4" />
                      </Button>

                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="w-9 h-9 rounded-xl hover:bg-blue-600 hover:text-white hover:shadow-lg hover:shadow-blue-600/20 transition-all text-blue-600" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSendingEmail(booking);
                        }} 
                        title="Resend Notification"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={(props) => (
                            <button
                              {...props}
                              className={cn(
                                "rounded-xl hover:shadow-lg transition-all border-0 shadow-none outline-none ring-0 inline-flex items-center justify-center cursor-pointer w-9 h-9 text-slate-400 hover:bg-white dark:hover:bg-slate-800",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onClick?.(e);
                              }}
                            >
                              {booking.status === 'charged' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : booking.status === 'chargeback' ? (
                                <AlertCircle className="w-4 h-4 text-red-500" />
                              ) : booking.status === 'ready to charge' ? (
                                <Zap className="w-4 h-4 text-amber-500" />
                              ) : booking.status === 'authorized' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        />
                        <DropdownMenuContent align="end" className="w-48 rounded-2xl p-2 shadow-2xl border-slate-100 dark:border-slate-800 dark:bg-slate-900">
                           <DropdownMenuGroup>
                             <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 py-2">Update Status</DropdownMenuLabel>
                           </DropdownMenuGroup>
                           <DropdownMenuSeparator />
                           
                           {/* Anyone (including Agents/Users) can change an authorized booking manually to 'Ready to Charge' */}
                           {booking.status !== 'ready to charge' && booking.status !== 'charged' && booking.status !== 'chargeback' && (
                             <DropdownMenuItem className="text-xs font-bold py-2 px-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={(e) => {
                               e.stopPropagation();
                               handleUpdateStatus(booking.id, 'ready to charge');
                             }}>
                               Ready to Charge
                             </DropdownMenuItem>
                           )}

                           {/* HOD, Admin, Manager, and systemAdmin roles can change status further */}
                           {['Admin', 'Manager', 'HOD', 'systemAdmin'].includes(profile?.role || '') && (
                             <>
                               {booking.status === 'ready to charge' && (
                                 <>
                                   <DropdownMenuItem className="text-xs font-bold py-2 px-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600" onClick={(e) => {
                                     e.stopPropagation();
                                     handleUpdateStatus(booking.id, 'charged');
                                   }}>
                                     Charged
                                   </DropdownMenuItem>
                                   <DropdownMenuItem className="text-xs font-bold py-2 px-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-red-600" onClick={(e) => {
                                     e.stopPropagation();
                                     handleUpdateStatus(booking.id, 'chargeback');
                                   }}>
                                     Chargeback
                                   </DropdownMenuItem>
                                 </>
                               )}
                               {/* Option for managers and HOD to revert to ready to charge from other statuses */}
                               {booking.status !== 'ready to charge' && (booking.status === 'charged' || booking.status === 'chargeback') && (
                                 <DropdownMenuItem className="text-xs font-bold py-2 px-3 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500" onClick={(e) => {
                                   e.stopPropagation();
                                   handleUpdateStatus(booking.id, 'ready to charge');
                                 }}>
                                   Set Ready to Charge
                                 </DropdownMenuItem>
                               )}
                             </>
                           )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      {booking.signatureData && (
                        <Popover>
                          <PopoverTrigger
                            render={(props) => (
                              <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9 rounded-xl hover:bg-emerald-500 hover:text-white hover:shadow-lg hover:shadow-emerald-500/20 transition-all text-emerald-600"
                                title="View Signature"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onClick?.(e);
                                }}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            )}
                          />
                          <PopoverContent className="w-80 p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
                             <div className="bg-slate-900 p-3 text-center">
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">Authentication Evidence</p>
                             </div>
                             <div className="p-6 bg-white flex flex-col items-center gap-4">
                                <div className="border border-slate-100 rounded-lg p-2 w-full bg-slate-50">
                                   <img src={booking.signatureData} className="w-full h-auto" alt="Signature" />
                                </div>
                                <div className="text-center">
                                   <p className="text-[10px] font-bold text-slate-400 uppercase">Authorized On</p>
                                   <p className="text-xs font-black text-slate-900">{booking.authorizedAt?.toDate?.() ? booking.authorizedAt.toDate().toLocaleString() : 'Recent'}</p>
                                </div>
                             </div>
                          </PopoverContent>
                        </Popover>
                      )}

                      {(profile?.role === 'Admin' || profile?.role === 'Superadmin' || ((profile?.role === 'Manager' || profile?.role === 'HOD') && !['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'].includes(booking.status))) && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={(props) => (
                              <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9 rounded-xl hover:bg-red-500 hover:text-white hover:shadow-lg hover:shadow-red-500/20 transition-all text-slate-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onClick?.(e);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          />
                          <AlertDialogContent className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter">Delete Booking?</AlertDialogTitle>
                              <AlertDialogDescription className="text-slate-500 font-medium">
                                This action cannot be undone. This will permanently delete the booking
                                and remove it from our servers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={(e) => e.stopPropagation()} className="rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 uppercase tracking-widest text-xs font-bold">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={(e) => { e.stopPropagation(); deleteBooking(booking.id, booking.crmId); }} className="rounded-xl bg-red-600 hover:bg-red-700 text-white uppercase tracking-widest text-xs font-bold">Delete Booking</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-10 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 text-[10px] font-black uppercase"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500 mx-2">
                  Page {currentPage} of {totalPages}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 text-[10px] font-black uppercase"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-center py-6">
        <p className="text-[9px] text-slate-300 font-black uppercase tracking-[0.4em]">Blackgrass Ledger Synchronization End-of-Stream</p>
      </div>
      {/* Footer Branding Override Example or purely for space */}
      <div className="h-20" />

      {/* SMTP Profile Selection Dialog */}
      <AlertDialog open={!!sendingEmail} onOpenChange={() => setSendingEmail(null)}>
        <AlertDialogContent className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              Dispatch Notification
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500 dark:text-slate-400 font-medium">
              You are about to resend the payment authorization link for booking <span className="font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700">{sendingEmail?.crmId}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-6 space-y-6">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipient Endpoint</p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{sendingEmail?.contactEmail}</span>
                <Badge variant="outline" className="text-[9px] font-black uppercase bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">{sendingEmail?.status}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Notification Template</Label>
              <div className="relative group">
                <select 
                  value={emailTemplateType}
                  onChange={(e) => setEmailTemplateType(e.target.value)}
                  className="w-full h-12 bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 transition-all shadow-sm appearance-none cursor-pointer"
                >
                  <option value="auth">Authorization & Audit Upload</option>
                  <option value="refund">Refund Confirmation</option>
                  <option value="cancel">Booking Cancellation & Rebooking</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Plane className="w-4 h-4 rotate-90" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">SMTP Channel Selection</Label>
              <div className="relative group">
                <select 
                  value={selectedProfileIndex}
                  onChange={(e) => setSelectedProfileIndex(Number(e.target.value))}
                  className="w-full h-12 bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-4 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 transition-all shadow-sm appearance-none cursor-pointer"
                >
                  {settings?.smtpProfiles?.map((p: any, i: number) => (
                    <option key={i} value={i}>{p.label} • {p.email}</option>
                  ))}
                  {(!settings?.smtpProfiles || settings.smtpProfiles.length === 0) && (
                    <option disabled>No SMTP profiles found</option>
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Plane className="w-4 h-4 rotate-90" />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 italic pl-1 font-medium italic uppercase tracking-tighter">* This profile will be logged as the official dispatcher for this transaction.</p>
            </div>
          </div>

          <AlertDialogFooter className="gap-2 sm:flex-row flex-col">
            <AlertDialogCancel className="rounded-xl border-slate-200 dark:border-slate-700 uppercase tracking-widest text-[10px] font-black h-11 px-6 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeResend}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white uppercase tracking-widest text-[10px] font-black h-11 px-8 shadow-lg shadow-blue-600/20 border-0"
            >
              Confirm & Dispatch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normStatus = status?.toLowerCase() || 'draft';
  const baseClasses = "text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-md flex items-center gap-1.5 w-fit shadow-sm border border-black/5 dark:border-white/5";

  switch (normStatus) {
    case 'ready to charge':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-amber-500 text-white shadow-amber-500/20")}>
          <Zap className="w-3 h-3 text-amber-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
    case 'authorized':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-emerald-500 text-white shadow-emerald-500/20")}>
          <Shield className="w-3 h-3 text-emerald-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
    case 'email auth confirm':
    case 'charged':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-teal-600 text-white shadow-teal-600/20")}>
          <CheckCircle2 className="w-3 h-3 text-teal-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
    case 'pending':
    case 'email sent':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-blue-500 text-white shadow-blue-500/20")}>
          <Clock className="w-3 h-3 text-blue-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-none border-transparent")}>
          <FileText className="w-3 h-3 opacity-50" />
          <span>{status}</span>
        </Badge>
      );
    case 'chargeback':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-rose-600 text-white shadow-rose-600/20 shadow-md animate-pulse")}>
          <AlertCircle className="w-3 h-3 text-rose-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-slate-800 text-slate-300 dark:bg-slate-800 dark:text-slate-400")}>
          <XCircle className="w-3 h-3" />
          <span>{status}</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn(baseClasses, "bg-indigo-500 text-white shadow-indigo-500/20")}>
          <CircleDashed className="w-3 h-3 text-indigo-100" />
          <span className="drop-shadow-sm">{status}</span>
        </Badge>
      );
  }
}
