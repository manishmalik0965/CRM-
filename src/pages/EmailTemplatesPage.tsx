// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Save, Mail, BookOpen, Ban, Undo2, Edit3, MessageSquare, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {

  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmailTemplateType, generateEmailTemplate } from '@/lib/emailTemplates';


export default function EmailTemplatesPage() {
  const { clientId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [previewBooking, setPreviewBooking] = useState<any>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewType, setPreviewType] = useState<EmailTemplateType>('auth');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const [templates, setTemplates] = useState<any>({
    auth: { title: 'Official Authorization Transmission', introText: '' },
    confirmation: { title: 'Authentication Securely Completed', introText: '' },
    refund: { title: 'Refund Authorization Required', introText: '' },
    cancel: { title: 'Cancellation & Rebook Required', introText: '' },
    changes: { title: 'Changes Authorization Required', introText: '' }
  });

  const defaultTemplates = {
    auth: {
      title: 'Official Authorization Transmission',
      introText: ''
    },
    confirmation: {
      title: 'Authentication Securely Completed',
      introText: ''
    },
    refund: {
      title: 'Refund Authorization Required',
      introText: ''
    },
    cancel: {
      title: 'Cancellation & Rebook Required',
      introText: ''
    },
    changes: {
      title: 'Changes Authorization Required',
      introText: ''
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/settings');
        if (res.data) {
          const data = res.data;
          if (data.emailTemplates) {
             setTemplates({
                auth: { ...defaultTemplates.auth, ...data.emailTemplates.auth },
                confirmation: { ...defaultTemplates.confirmation, ...data.emailTemplates.confirmation },
                refund: { ...defaultTemplates.refund, ...data.emailTemplates.refund },
                cancel: { ...defaultTemplates.cancel, ...data.emailTemplates.cancel },
                changes: { ...defaultTemplates.changes, ...data.emailTemplates.changes }
             });
          } else {
             setTemplates(defaultTemplates);
          }
        }
        
        // Fetch recent booking for preview if we have a clientId
        if (clientId) {
           const bRes = await api.get('/bookings?limit=1');
           if (bRes.data && bRes.data.length > 0) {
              const bData = bRes.data[0];
              // passengers are included in the backend or have passengerNames
              bData.passengers = bData.passengerNames ? (typeof bData.passengerNames === 'string' ? JSON.parse(bData.passengerNames) : bData.passengerNames) : [];
              setPreviewBooking(bData);
           } else {
              setPreviewBooking({
                 crmId: 'SW-123456',
                 firstName: 'John',
                 lastName: 'Doe',
                 airline: 'Demo Airlines',
                 totalAmount: 1250.00,
                 transactionFee: 50.00,
                 currency: 'USD',
                 origin: 'JFK',
                 destination: 'LHR',
                 gateway: 'Stripe'
              });
           }
        } else {
            setPreviewBooking({
                 crmId: 'SW-123456',
                 firstName: 'John',
                 lastName: 'Doe',
                 airline: 'Demo Airlines',
                 totalAmount: 1250.00,
                 transactionFee: 50.00,
                 currency: 'USD',
                 origin: 'JFK',
                 destination: 'LHR',
                 gateway: 'Stripe'
            });
        }
      } catch (e) {
        toast.error('Failed to load templates');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings', { emailTemplates: templates });
      toast.success('Email templates saved successfully');
    } catch (e: any) {
      toast.error('Error saving templates: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = (type: string, field: string, value: string) => {
    setTemplates({
      ...templates,
      [type]: { ...templates[type], [field]: value }
    });
  };

  const handlePreview = (type: EmailTemplateType) => {
     setPreviewType(type);
     
     if (previewBooking) {
        const pName = previewBooking.passengers && previewBooking.passengers.length > 0 
           ? `${previewBooking.passengers[0].firstName} ${previewBooking.passengers[0].lastName}`
           : `${previewBooking.firstName || ''} ${previewBooking.lastName || ''}`.trim() || 'Passenger';
           
        const emailData = {
           pnr: previewBooking.pnr || 'Z5XP9Y',
           oldPnr: type === 'changes' ? 'X3K8A1' : undefined,
           modificationDetails: type === 'changes' ? 'Seat Upgrade to Premium Economy' : undefined,
           crmId: previewBooking.crmId || 'CRM-2023-0001',
           passengerName: pName || 'John Doe',
           airlineName: previewBooking.airline || 'Delta Airlines',
           totalAmount: previewBooking.totalAmount || 1250,
           transactionFee: previewBooking.transactionFee || 0,
           currency: previewBooking.currency || 'USD',
           refundQuote: type === 'changes' ? 150 : 0,
           origin: previewBooking.origin || 'JFK',
           destination: previewBooking.destination || 'LHR',
           cardHolderName: previewBooking.cardHolder || 'Jane Doe',
           cardLast4: previewBooking.card_last4 || '1111',
           validatedGateway: previewBooking.gateway,
           branding: {
              emailTemplates: templates // Pass current unsaved templates for preview
           }
        };
        const html = generateEmailTemplate(type, emailData as any);
        setPreviewHtml(html);
     }
     
     setIsPreviewOpen(true);
  };

  if (loading) return <div className="p-8">Loading templates...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-600" />
            Email Templates
          </h1>
          <p className="text-sm text-slate-500 uppercase tracking-widest mt-1">Manage transactional email content</p>
        </div>
        <div className="flex gap-3">
           <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 px-8 rounded-xl shadow-lg shadow-blue-600/20 uppercase tracking-widest text-[10px]">
             {saving ? 'Saving...' : 'Save Templates'}
           </Button>
        </div>
      </div>

      <div className="mb-4 p-4 border border-blue-200 bg-blue-50 text-blue-800 rounded-xl text-xs flex gap-3">
         <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
         <div>
            <p className="font-bold uppercase tracking-widest mb-1 text-[10px]">Available Merge Tags</p>
            <p className="leading-relaxed opacity-80 font-mono">
               <strong>&#123;&#123;passengerName&#125;&#125;</strong>, <strong>&#123;&#123;totalAmount&#125;&#125;</strong>, <strong>&#123;&#123;currency&#125;&#125;</strong>, <strong>&#123;&#123;airlineName&#125;&#125;</strong>, <strong>&#123;&#123;pnr&#125;&#125;</strong>, <strong>&#123;&#123;validatedGateway&#125;&#125;</strong><br/>
               Use standard HTML tags like &lt;strong&gt; or &lt;br/&gt; for formatting.
            </p>
         </div>
      </div>

      <Tabs defaultValue="auth" className="w-full">
        <TabsList className="w-full justify-start h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 rounded-none p-0 mb-6 gap-6">
          <TabsTrigger value="auth" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 font-black uppercase tracking-widest text-[10px] gap-2">
             <Edit3 className="w-4 h-4" /> New Booking
          </TabsTrigger>
          <TabsTrigger value="cancel" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 font-black uppercase tracking-widest text-[10px] gap-2">
             <Ban className="w-4 h-4" /> Cancel & Rebook
          </TabsTrigger>
          <TabsTrigger value="refund" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 font-black uppercase tracking-widest text-[10px] gap-2">
             <Undo2 className="w-4 h-4" /> Cancellation & Refund
          </TabsTrigger>
          <TabsTrigger value="changes" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 font-black uppercase tracking-widest text-[10px] gap-2">
             <MessageSquare className="w-4 h-4" /> Modifications
          </TabsTrigger>
          <TabsTrigger value="confirmation" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 font-black uppercase tracking-widest text-[10px] gap-2">
             <Save className="w-4 h-4" /> Auth Confirmation
          </TabsTrigger>
        </TabsList>

        {Object.entries(templates).map(([key, template]: [string, any]) => (
          <TabsContent value={key} key={key} className="space-y-6 mt-0">
             <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-slate-900 pb-6 border-b flex flex-row items-start justify-between space-y-0">
                   <div>
                       <CardTitle className="uppercase tracking-widest text-sm font-black text-slate-800">
                          {key === 'auth' && 'New Booking Authorization'}
                          {key === 'cancel' && 'Cancel & Rebook Authorization'}
                          {key === 'refund' && 'Cancellation & Refund Authorization'}
                          {key === 'changes' && 'Modifications Authorization'}
                          {key === 'confirmation' && 'Authorization Confirmation Receipt'}
                       </CardTitle>
                       <CardDescription className="mt-1">Configure the subject line text block and an optional custom message that will appear below the automated system details.</CardDescription>
                   </div>
                   <Button onClick={() => handlePreview(key as EmailTemplateType)} variant="outline" className="h-9 font-bold uppercase tracking-widest text-[10px] gap-2">
                       <Eye className="w-3 h-3" /> Preview HTML
                   </Button>
                 </CardHeader>
                <CardContent className="space-y-6 pt-6">
                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Inner Title Text</label>
                      <Input 
                         value={template.title} 
                         onChange={e => handleUpdate(key, 'title', e.target.value)} 
                         className="h-12 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Additional Custom Message (Optional)</label>
                      <Textarea 
                         placeholder="Leave empty to only use standard system details..."
                         value={template.introText} 
                         onChange={e => handleUpdate(key, 'introText', e.target.value)}
                         className="min-h-[150px] bg-slate-50 dark:bg-slate-800 leading-relaxed"
                      />
                   </div>
                </CardContent>
             </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 bg-white">
          <DialogHeader className="p-4 border-b bg-slate-50 mb-0 shrink-0">
            <DialogTitle className="uppercase tracking-widest text-xs font-black">
              Email Render Preview: {previewType}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-100 p-4 relative">
             {previewHtml ? (
                 <iframe 
                    title="Email Preview"
                    srcDoc={previewHtml}
                    className="w-full h-full min-h-[600px] border-none rounded bg-white shadow-sm"
                 />
             ) : (
                 <div className="flex items-center justify-center h-[400px] text-xs font-bold uppercase tracking-widest text-slate-400">
                    Generating Preview...
                 </div>
             )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
