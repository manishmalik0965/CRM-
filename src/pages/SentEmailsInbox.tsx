// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Mail, 
  Search, 
  Calendar, 
  User, 
  Code, 
  Eye, 
  FileText, 
  ArrowLeft, 
  RefreshCw, 
  SlidersHorizontal,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function SentEmailsInbox() {
  const { clientId } = useTenant();
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'html' | 'data'>('html');

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sent-emails');
      setEmails(res.data?.emails || []);
    } catch (e) {
      console.error('Failed to load sent emails:', e);
      toast.error('Could not load email history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [clientId]);

  // Types of emails sent based on schema / routes
  const emailTypes = [
    { value: 'all', label: 'All Messages' },
    { value: 'auth', label: 'Auth Request' },
    { value: 'confirmation', label: 'Confirmation' },
    { value: 'refund', label: 'Refunds' },
    { value: 'cancel', label: 'Cancellations' },
    { value: 'changes', label: 'Itinerary Changes' }
  ];

  // Helper to resolve badge colors based on email types
  const getTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('auth')) {
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold border-none">Authorization</Badge>;
    }
    if (t.includes('confirm')) {
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold border-none">Confirmation</Badge>;
    }
    if (t.includes('refund')) {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-bold border-none">Refund</Badge>;
    }
    if (t.includes('cancel')) {
      return <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-bold border-none">Cancellation</Badge>;
    }
    if (t.includes('change')) {
      return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-bold border-none">Itinerary Change</Badge>;
    }
    return <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold border-none">{type || 'General'}</Badge>;
  };

  // Safe rendering of date format
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Filter & Search logic
  const filteredEmails = emails.filter(email => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (email.recipient || '').toLowerCase().includes(term) ||
      (email.subject || '').toLowerCase().includes(term) ||
      (email.crm_id || '').toLowerCase().includes(term) ||
      (email.sent_by || '').toLowerCase().includes(term);

    if (selectedType === 'all') return matchesSearch;
    
    const emailType = (email.type || '').toLowerCase();
    const filterType = selectedType.toLowerCase();
    return emailType.includes(filterType) && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase font-sans">
            Sent Messages Inbox
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-light">
            Audit history of all secure communications, authorizations, and transactional notifications sent to travelers.
          </p>
        </div>
        <Button onClick={fetchEmails} variant="outline" className="h-10 self-start sm:self-auto gap-2 text-xs uppercase tracking-wider font-extrabold" disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Inbox
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-slate-100/50 dark:bg-slate-900/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Transmissions</CardTitle>
            <Mail className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{emails.length}</div>
            <p className="text-[10px] text-slate-500 mt-1">Successfully logged messages</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-100/50 dark:bg-slate-900/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Authorizations Sent</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {emails.filter(e => (e.type || '').toLowerCase().includes('auth')).length}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Direct approval transmissions</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-100/50 dark:bg-slate-900/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmations & Updates</CardTitle>
            <FileText className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {emails.filter(e => !(e.type || '').toLowerCase().includes('auth')).length}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Confirmations, refunds & modifications</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-slate-100/50 dark:bg-slate-900/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">Latest Transmission</CardTitle>
            <Calendar className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-black text-slate-900 dark:text-white truncate">
              {emails.length > 0 ? formatDateTime(emails[0].created_at).split(',')[0] : 'Never'}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              {emails.length > 0 ? formatDateTime(emails[0].created_at).split(',')[1]?.trim() : 'No emails sent yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Search & Message List (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4 space-y-4">
              
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
                <Input 
                  placeholder="Search recipient, subject, CRM ID..." 
                  className="pl-9 h-10 border-slate-200 dark:border-slate-800"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Category Pill Filters */}
              <div className="flex flex-wrap gap-1.5 pb-1">
                {emailTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all border ${
                      selectedType === type.value 
                        ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900' 
                        : 'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {/* Scrollable message List */}
              <ScrollArea className="h-[600px] pr-2">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-3">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Loading historical transmissions...</span>
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
                    <Mail className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                    <span className="text-sm font-bold text-slate-500">No emails match your filter</span>
                    <p className="text-xs text-slate-400 max-w-xs">Try clearing your search keyword or selecting "All Messages".</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredEmails.map((email) => {
                      const isSelected = selectedEmail?.id === email.id;
                      return (
                        <div
                          key={email.id}
                          onClick={() => {
                            setSelectedEmail(email);
                            setActiveTab('html');
                          }}
                          className={`p-4 rounded-xl cursor-pointer border text-left transition-all ${
                            isSelected 
                              ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-500/40 dark:border-blue-500/30 ring-1 ring-blue-500/30' 
                              : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-150 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-mono text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 bg-blue-100/40 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                              CRM-{email.crm_id || 'GENERAL'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatDateTime(email.created_at).split(',')[0]}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mb-1">
                            {email.subject}
                          </h4>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate max-w-[150px] font-medium">To: {email.recipient}</span>
                            <span className="shrink-0 text-[10px] text-slate-400 italic">By: {email.sent_by || 'System'}</span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-2">
                            {getTypeBadge(email.type)}
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 group-hover:text-blue-600">
                              View Details
                              <Eye className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

            </CardContent>
          </Card>
        </div>

        {/* Right Side: Email Content Details & Payload Data (lg:col-span-7) */}
        <div className="lg:col-span-7">
          {selectedEmail ? (
            <Card className="border-none shadow-sm">
              <CardHeader className="border-b border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 p-6 space-y-4">
                
                {/* Email general header info */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-1.5 text-left">
                    {getTypeBadge(selectedEmail.type)}
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-snug">
                      {selectedEmail.subject}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 font-light">
                      <span><strong className="font-semibold text-slate-600 dark:text-slate-300">Recipient:</strong> {selectedEmail.recipient}</span>
                      <span><strong className="font-semibold text-slate-600 dark:text-slate-300">Sender Auth:</strong> {selectedEmail.sent_by || 'Agent'}</span>
                    </div>
                  </div>
                  <div className="sm:text-right shrink-0 flex flex-col items-start sm:items-end gap-1 font-mono text-[11px] text-slate-400">
                    <span>Sent: {formatDateTime(selectedEmail.created_at)}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-100/30 dark:bg-blue-950/30 px-2.5 py-0.5 rounded-full">CRM-{selectedEmail.crm_id || 'GENERAL'}</span>
                  </div>
                </div>

                {/* Tabs selection: HTML preview vs Data Payload */}
                <div className="flex border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('html')}
                    className={`px-4 py-2.5 text-xs uppercase tracking-wider font-extrabold flex items-center gap-2 border-b-2 transition-all -mb-[1px] ${
                      activeTab === 'html'
                        ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 font-black'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Message Preview
                  </button>
                  <button
                    onClick={() => setActiveTab('data')}
                    className={`px-4 py-2.5 text-xs uppercase tracking-wider font-extrabold flex items-center gap-2 border-b-2 transition-all -mb-[1px] ${
                      activeTab === 'data'
                        ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 font-black'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Data Payload Sent to PAX
                  </button>
                </div>

              </CardHeader>

              <CardContent className="p-6">
                
                {/* HTML content inside safety iframe */}
                {activeTab === 'html' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Exact rendering of customer message
                      </span>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white shadow-inner">
                      <iframe
                        srcDoc={selectedEmail.body_html || '<p className="p-4 text-center">No HTML content logged for this communication.</p>'}
                        className="w-full h-[550px] bg-white"
                        title="Email Body Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                ) : (
                  
                  /* Dynamic structured representation of data_sent metadata payload */
                  <div className="space-y-6 text-left">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
                      <Code className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider">Flight & Booking Authorization Context</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-light">
                          These parameters represent the variables injected into the email template at the exact moment of transmission to ensure billing accuracy.
                        </p>
                      </div>
                    </div>

                    {selectedEmail.data_sent ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Summary Block */}
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Flight Route & Gateway</h4>
                          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl space-y-3 text-xs">
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">PNR Record Locator:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedEmail.data_sent.pnr || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Routing Path:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEmail.data_sent.origin || '---'} ➔ {selectedEmail.data_sent.destination || '---'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Airline Carrier:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEmail.data_sent.airlineName || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Cabin Class:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{selectedEmail.data_sent.cabinClass || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between pb-1">
                              <span className="text-slate-400">Authorized Gateway:</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400 uppercase">{selectedEmail.data_sent.validatedGateway || 'STANDARD SECURE'}</span>
                            </div>
                          </div>

                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 pt-2">Fare Charges Breakdown</h4>
                          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl space-y-3 text-xs">
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Currency:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEmail.data_sent.currency || 'USD'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Ticket Fare / Total:</span>
                              <span className="font-black text-slate-950 dark:text-white">{selectedEmail.data_sent.currency || 'USD'} {selectedEmail.data_sent.totalAmount?.toLocaleString() || '0.00'}</span>
                            </div>
                            {selectedEmail.data_sent.refundQuote && (
                              <div className="flex justify-between pb-1">
                                <span className="text-slate-400">Refund Quote Value:</span>
                                <span className="font-bold text-orange-500">{selectedEmail.data_sent.currency || 'USD'} {selectedEmail.data_sent.refundQuote}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Passenger Details & Raw Payload Tree */}
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Signatory & Passengers</h4>
                          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl space-y-3 text-xs">
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
                              <span className="text-slate-400">Signature Holder / Cardholder:</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{selectedEmail.data_sent.passengerName || selectedEmail.recipient || 'N/A'}</span>
                            </div>
                            <div className="space-y-1.5 text-left pb-1">
                              <span className="text-slate-400 text-[11px]">Authorized Travelers (PAX):</span>
                              <div className="space-y-1 mt-1">
                                {Array.isArray(selectedEmail.data_sent.passengers) && selectedEmail.data_sent.passengers.length > 0 ? (
                                  selectedEmail.data_sent.passengers.map((p, idx) => (
                                    <div key={idx} className="bg-slate-50 dark:bg-slate-850 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                      {typeof p === 'string' ? p : (p.name || `Pax #${idx + 1}`)} 
                                      {p.ptc && <Badge variant="secondary" className="ml-2 text-[9px] px-1.5 py-0">{p.ptc}</Badge>}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-slate-400 italic text-[11px]">No specific passenger list logged</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 pt-2">Full JSON Metadata Payload</h4>
                          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-950 text-slate-200 p-4">
                            <ScrollArea className="h-44 text-left">
                              <pre className="font-mono text-[10px] leading-relaxed text-blue-400 whitespace-pre-wrap">
                                {JSON.stringify(selectedEmail.data_sent, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center space-y-1">
                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">No variable payload logged</span>
                        <p className="text-[11px] text-slate-400 max-w-xs">This might be an older notification format or manually sent update.</p>
                      </div>
                    )}

                  </div>
                )}

              </CardContent>
            </Card>
          ) : (
            <div className="h-[600px] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-slate-100/5 dark:bg-slate-900/5 space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/40 flex items-center justify-center text-slate-400 dark:text-slate-600">
                <Mail className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-base font-black uppercase text-slate-800 dark:text-white tracking-wider">No Message Selected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-light">
                  Select a sent email record from the history list to preview the actual HTML copy, passenger signature requirements, routing, and charges data payload.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
