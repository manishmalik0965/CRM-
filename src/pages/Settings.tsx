// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Shield, Bell, User, Plane, Save, Plus, Trash2, Building, Globe, Phone, Info, RefreshCw, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';



import { EmailForwardingSettings } from '@/components/EmailForwardingSettings';

export default function Settings({ profile }: { profile?: any }) {
  const { clientId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [branding, setBranding] = useState({
    organizationName: 'Blackgrass CRM',
    supportPhone: '+1 800 555 1234',
    supportEmail: 'support@skyway.com',
    logoUrl: '/logo.svg',
    fullAddress: '123 Aviation Blvd, New York, NY 10001',
    primaryColor: '#0f172a',
    customCss: '',
    customFooterHtml: '',
    customDomain: '',
    bccEmail: ''
  });

  const [smtpProfiles, setSmtpProfiles] = useState<{email: string, appPassword: string, label: string, host?: string, port?: number | string}[]>([]);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [globalTwoFactorEnabled, setGlobalTwoFactorEnabled] = useState(false);

  const [systemStats, setSystemStats] = useState({ users: 0, bookings: 0 });
  const [syncingAirports, setSyncingAirports] = useState(false);
  const isSystemAdmin = profile?.email === 'manishmalik0965@gmail.com';
  const canEditBranding = isSystemAdmin;

  useEffect(() => {
    async function loadSettings() {
      try {
        console.log("Fetching system configuration...");
        // Mock load from API
        const { data } = await api.get('/settings');
        
        if (isSystemAdmin) {
          try {
            const { data: stats } = await api.get('/settings/stats');
            setSystemStats({
              users: stats.users || 0,
              bookings: stats.bookings || 0
            });
          } catch (e) {
            console.error("Failed to load system stats", e);
          }
        }
        
        setBranding({
          organizationName: data.organizationName || 'Blackgrass CRM',
          supportPhone: data.supportPhone || '+1 800 555 1234',
          supportEmail: data.supportEmail || 'support@skyway.com',
          logoUrl: data.logoUrl || '',
          fullAddress: data.fullAddress || '',
          primaryColor: data.primaryColor || '#0f172a',
          customCss: data.customCss || '',
          customFooterHtml: data.customFooterHtml || '',
          customDomain: data.customDomain || '',
          bccEmail: data.bccEmail || ''
        });

        if (Array.isArray(data.smtpProfiles)) {
          setSmtpProfiles(data.smtpProfiles);
        } else {
          setSmtpProfiles([
            { email: 'ticketing@skyway.com', appPassword: '', label: 'Main Ticketing' }
          ]);
        }
        
        if (data.twoFactorEnabled !== undefined) {
          setTwoFactorEnabled(data.twoFactorEnabled);
        }
        if (data.globalTwoFactorEnabled !== undefined) {
          setGlobalTwoFactorEnabled(data.globalTwoFactorEnabled);
        }
      } catch (err) {
        console.error("Settings load error:", err);
        toast.error("Cloud parameters unreachable. Sync offline.");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [clientId, isSystemAdmin]);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        ...branding,
        smtpProfiles,
        twoFactorEnabled,
        globalTwoFactorEnabled,
        updatedAt: new Date().toISOString()
      };
      
      console.log("Deploying system config:", payload);
      await api.post('/settings', payload);
      toast.success("System parameters successfully deployed to global storage.");
      window.dispatchEvent(new Event('settingsUpdated'));
    } catch (err) {
      console.error("Save failure:", err);
      toast.error("Database write error. Check connectivity.");
    } finally {
      setSaving(false);
    }
  };

  const addSmtpProfile = () => {
    setSmtpProfiles([...smtpProfiles, { email: '', appPassword: '', label: 'New Sender' }]);
  };

  const updateSmtpProfile = (index: number, field: string, value: string) => {
    const newProfiles = [...smtpProfiles];
    newProfiles[index] = { ...newProfiles[index], [field]: value };
    setSmtpProfiles(newProfiles);
  };

  const removeSmtpProfile = (index: number) => {
    setSmtpProfiles(smtpProfiles.filter((_, i) => i !== index));
  };

  if (loading) return <div className="flex h-96 items-center justify-center">Loading secure parameters...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight">System Control Center</h2>
          <p className="text-muted-foreground">Modify core agency infrastructure, branding, and mail relays</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} className="gap-2 shadow-lg">
          {saving ? 'Syncing...' : <><Save className="w-4 h-4" /> Deploy Changes</>}
        </Button>
      </div>

      <div className="grid gap-8">
          {isSystemAdmin && (
            <Card className="border-none shadow-sm overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <CardHeader className="pb-6">
                  <CardTitle className="flex items-center gap-2 text-white">
                      <Globe className="w-5 h-5 text-blue-400" />
                      Software Vendor Telemetry
                  </CardTitle>
                  <CardDescription className="text-slate-400">Tenant usage statistics and active deployment limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Users</p>
                        <p className="text-3xl font-black">{systemStats.users}</p>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Bookings</p>
                        <p className="text-3xl font-black">{systemStats.bookings}</p>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">License Status</p>
                        <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30 font-bold">ACTIVE</Badge>
                      </div>
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Plan</p>
                        <p className="text-lg font-bold text-slate-300">Unlimited Tier</p>
                      </div>
                  </div>
              </CardContent>
            </Card>
          )}

          {/* Agency Branding */}
          {isSystemAdmin && (
            <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-900 pb-6">
                  <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5 text-blue-600" />
                      Global Agency Branding
                  </CardTitle>
                  <CardDescription>Visual identity and contact anchors for all customer documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-slate-500">Agency Name</Label>
                          <Input 
                            value={branding.organizationName} 
                            onChange={e => setBranding({...branding, organizationName: e.target.value})}
                            placeholder="e.g. Blackgrass Universal" 
                            disabled={!canEditBranding}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-slate-500">Brand Color (Hex)</Label>
                          <div className="flex gap-2">
                            <Input 
                              type="color"
                              value={branding.primaryColor} 
                              onChange={e => setBranding({...branding, primaryColor: e.target.value})}
                              className="w-12 h-10 p-1 cursor-pointer"
                              disabled={!canEditBranding}
                            />
                            <Input 
                              value={branding.primaryColor} 
                              onChange={e => setBranding({...branding, primaryColor: e.target.value})}
                              placeholder="#000000" 
                              className="flex-1 font-mono uppercase"
                              disabled={!canEditBranding}
                            />
                          </div>
                      </div>
                  </div>

                  <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold text-slate-500">Corporate Logo</Label>
                      <div className="flex items-center gap-4">
                        {branding.logoUrl && (
                          <div className="w-16 h-16 rounded-lg border bg-slate-50 flex items-center justify-center p-2">
                             <img src={branding.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                          </div>
                        )}
                        <div className="flex-1 space-y-2">
                          <Input 
                            type="file"
                            accept="image/*"
                            disabled={!canEditBranding}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                  const base64 = event.target?.result as string;
                                  try {
                                    const res = await fetch('/api/upload-snapshot', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ base64 })
                                    });
                                    if (res.ok) {
                                      const { url, relativeUrl } = await res.json();
                                      const finalUrl = relativeUrl || url;
                                      setBranding(prev => ({...prev, logoUrl: finalUrl}));
                                      toast.success('Logo uploaded successfully');
                                    } else {
                                      setBranding(prev => ({...prev, logoUrl: base64}));
                                    }
                                  } catch (err) {
                                    setBranding(prev => ({...prev, logoUrl: base64}));
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          <p className="text-[10px] text-slate-500">Upload a PNG or JPG (max 2MB). Overwrites current logo.</p>
                        </div>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-slate-500">Support Hotline</Label>
                          <Input 
                            value={branding.supportPhone} 
                            onChange={e => setBranding({...branding, supportPhone: e.target.value})}
                            placeholder="+1 XXX XXX XXXX" 
                          />
                      </div>
                      <div className="space-y-2">
                          <Label className="text-xs uppercase font-bold text-slate-500">Support Email</Label>
                          <Input 
                            value={branding.supportEmail} 
                            onChange={e => setBranding({...branding, supportEmail: e.target.value})}
                            placeholder="ops@agency.com" 
                          />
                      </div>
                  </div>

                  <div className="space-y-2">
                      <Label className="text-xs uppercase font-bold text-slate-500">HQ Physical Address</Label>
                      <Textarea 
                        value={branding.fullAddress}
                        onChange={e => setBranding({...branding, fullAddress: e.target.value})}
                        placeholder="123 Main St, Suite 400..."
                        className="resize-none"
                      />
                  </div>

                  <Separator />

                  <EmailForwardingSettings 
                    value={branding.bccEmail} 
                    onChange={val => setBranding({...branding, bccEmail: val})}
                    disabled={!canEditBranding}
                  />
              </CardContent>
            </Card>
          )}





          {/* SMTP Config */}
          <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50 dark:bg-slate-900 pb-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="w-5 h-5 text-blue-600" />
                            Email SMTP Cloud Relay
                        </CardTitle>
                        <CardDescription>Managed Google App Passwords for secure authorization dispatch</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100 uppercase text-[10px] font-black">Ready</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs uppercase font-bold text-slate-500 tracking-tighter">Active Send Profiles</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={addSmtpProfile} className="h-7 text-blue-600 gap-1 text-[10px] font-bold">
                            <Plus className="w-3 h-3" /> Add Account
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={handleSaveAll} 
                          disabled={saving}
                          className="h-7 bg-blue-600 hover:bg-blue-700 text-white gap-1 text-[10px] font-bold px-3"
                        >
                            <Save className="w-3 h-3" /> Save Config
                        </Button>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                        <div className="flex gap-2">
                            <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-[10px] text-blue-800 dark:text-blue-200 font-bold uppercase tracking-tight">SMTP Connection Guide</p>
                                <p className="text-[10px] text-blue-600 dark:text-blue-300 leading-relaxed">
                                    <strong>Gmail Users:</strong> Your regular password will not work. Go to your <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-black">Google Account</a>, search "App Passwords", and use the 16-character code. Host: <code>smtp.gmail.com</code> Port: <code>465</code>.<br/>
                                    <strong>Other Providers:</strong> Enter your custom SMTP Host (e.g. <code>smtp.office365.com</code>), Port (typically <code>465</code> or <code>587</code>), and standard password.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        {smtpProfiles.map((ap, idx) => (
                            <div key={idx} className="group flex flex-col p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 gap-3 relative">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => removeSmtpProfile(idx)} 
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-8 w-8 text-red-500"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-black text-slate-400">Profile Label</Label>
                                    <Input 
                                        className="h-8 text-xs font-bold"
                                        placeholder="e.g. Main Ticketing" 
                                        value={ap.label}
                                        onChange={(e) => updateSmtpProfile(idx, 'label', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-black text-slate-400">SMTP Host</Label>
                                    <Input 
                                        className="h-8 text-xs"
                                        placeholder="smtp.gmail.com" 
                                        value={ap.host || ''}
                                        onChange={(e) => updateSmtpProfile(idx, 'host', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-black text-slate-400">Port</Label>
                                    <Input 
                                        type="number"
                                        className="h-8 text-xs"
                                        placeholder="465" 
                                        value={ap.port || ''}
                                        onChange={(e) => updateSmtpProfile(idx, 'port', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-black text-slate-400">Email Address</Label>
                                    <Input 
                                        className="h-8 text-xs"
                                        placeholder="user@example.com" 
                                        value={ap.email}
                                        onChange={(e) => updateSmtpProfile(idx, 'email', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-black text-slate-400">Password / App Password</Label>
                                    <Input 
                                        type="password"
                                        className="h-8 text-xs font-mono tracking-widest" 
                                        placeholder="xxxx xxxx xxxx xxxx" 
                                        value={ap.appPassword}
                                        onChange={(e) => updateSmtpProfile(idx, 'appPassword', e.target.value)}
                                    />
                                    {ap.email?.endsWith('@gmail.com') && ap.appPassword && (
                                      <div className="text-[9px] mt-1 font-semibold">
                                        {ap.appPassword.replace(/\s+/g, '').length === 16 ? (
                                          <span className="text-emerald-600">✓ Valid 16-character Gmail App Password format (spaces are automatically stripped)</span>
                                        ) : (
                                          <span className="text-amber-500">⚠ Gmail App Passwords must be exactly 16 letters (currently {ap.appPassword.replace(/\s+/g, '').length} characters)</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="h-7 text-[10px] font-bold border-blue-200 text-blue-600 hover:bg-blue-50"
                                      onClick={async () => {
                                          const promise = fetch('/api/test-smtp', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(ap)
                                          }).then(async r => {
                                            const data = await r.json();
                                            if (!r.ok) throw new Error(data.message || 'Connection failed');
                                            return data;
                                          });

                                          toast.promise(promise, {
                                            loading: 'Verifying SMTP credentials...',
                                            success: (data) => data.message,
                                            error: (err) => err.message
                                          });
                                      }}
                                    >
                                        Test Connection
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <Separator />

                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-bold text-blue-900 dark:text-blue-400">Admin Multi-Factor Auth (MFA)</Label>
                        <p className="text-[10px] text-blue-600/70 font-medium tracking-tight uppercase">Forces 2FA verification for all manager & admin account logins and financial authorizations</p>
                    </div>
                    <Switch 
                      checked={twoFactorEnabled} 
                      onCheckedChange={setTwoFactorEnabled}
                      className="data-[state=checked]:bg-blue-600"
                    />
                </div>

                <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl flex items-center justify-between mt-4">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-bold text-blue-900 dark:text-blue-400">Mandatory Global Two-Factor Authentication</Label>
                        <p className="text-[10px] text-blue-600/70 font-medium tracking-tight uppercase">Require Two-Factor Authentication for all users within the tenant</p>
                    </div>
                    <Switch 
                      checked={globalTwoFactorEnabled} 
                      onCheckedChange={setGlobalTwoFactorEnabled}
                      className="data-[state=checked]:bg-blue-600"
                    />
                </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200/80 dark:border-slate-800 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-lg">System Directories & Maintenance</CardTitle>
                  <CardDescription>Synchronize global aviation datasets for high-speed autocomplete airport searches</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                The CRM relies on a hybrid local/remote airport search database. If you are experiencing search latency or missing minor municipal runways, you can trigger a full sync with the global aviation dataset. This downloads, normalizes, and indexes over 5,000+ commercial, private, and regional airports globally.
              </p>
              
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Worldwide Airports Database Sync</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Recommended once per quarter or during initial system deployments</p>
                </div>
                <Button 
                  disabled={syncingAirports}
                  onClick={async () => {
                    setSyncingAirports(true);
                    const promise = api.post('/airports/sync').then(res => res.data);
                    
                    toast.promise(promise, {
                      loading: 'Downloading & indexing global airport registries (takes 3-5 seconds)...',
                      success: (data) => data.message || 'Successfully synchronized global airports directory!',
                      error: (err) => err.response?.data?.error || err.message || 'Airport sync failed'
                    });
                    
                    try {
                      await promise;
                    } catch(e) {
                      console.error(e);
                    } finally {
                      setSyncingAirports(false);
                    }
                  }}
                  className="gap-2 shrink-0 h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600"
                >
                  <RefreshCw className={syncingAirports ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
                  {syncingAirports ? 'Indexing Database...' : 'Sync Airports Now'}
                </Button>
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
