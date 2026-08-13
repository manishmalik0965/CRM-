// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/lib/tenant';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { 
  Download, 
  Database, 
  FileCode, 
  Globe, 
  RefreshCw, 
  ShieldCheck, 
  Server, 
  Copy, 
  Check, 
  CloudLightning, 
  FileUp,
  Clock,
  HardDriveDownload,
  Terminal,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  HeartPulse,
  Wifi,
  WifiOff,
  Activity
} from 'lucide-react';

export default function ClientAdminPage() {
  const { clientId, activeClient } = useTenant();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'bridge' | 'schema' | 'sync' | 'backups'>('bridge');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  // Backups / Sync Status
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Local Sync Settings
  const [localDbHost, setLocalDbHost] = useState('localhost');
  const [localDbUser, setLocalDbUser] = useState('root');
  const [localDbName, setLocalDbName] = useState('local_crm_db');
  const [localDbPass, setLocalDbPass] = useState('');
  const [showDbPass, setShowDbPass] = useState(false);
  const [localDbPort, setLocalDbPort] = useState('3306');
  const [savingSettings, setSavingSettings] = useState(false);

  // File Upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Server Health Telemetry States
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [testingHealth, setTestingHealth] = useState(false);
  const [exportingState, setExportingState] = useState(false);

  useEffect(() => {
    loadSyncSettings();
    loadBackups();
    testServerHealth();
  }, [clientId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        toast.info("Triggering connection handshake audit...");
        testServerHealth();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clientId, testingHealth]);

  const testServerHealth = async () => {
    setTestingHealth(true);
    try {
      const res = await api.post('/client-admin/test-connection');
      setHealthStatus(res.data);
      if (res.data?.success) {
        toast.success('Connection handshake audit verified successfully!');
      } else {
        toast.warning('Mainframe online, but sovereign database replica connection timed out.');
      }
    } catch (err: any) {
      toast.error('Health audit check failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTestingHealth(false);
    }
  };

  const exportDatabaseStateToCSV = async () => {
    setExportingState(true);
    const toastId = toast.loading("Fetching current database state...");
    try {
      const res = await api.get('/bookings', { params: { limit: 1000 } });
      const bookings = res.data?.bookings || [];
      if (bookings.length === 0) {
        toast.dismiss(toastId);
        toast.info("Database state manifest is currently empty. No records to audit.");
        return;
      }

      const headers = [
        'Booking ID', 'CRM ID', 'PNR/Record Locator', 'Airline Carrier', 
        'Origin', 'Destination', 'Trip Type', 'Departure Date', 
        'Status', 'Total Amount', 'Currency', 'Cardholder Name', 
        'Card Number Masked', 'Contact Email', 'Contact Phone', 'Created At'
      ];

      const escapeCSV = (val: any) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = bookings.map((b: any) => [
        escapeCSV(b.id),
        escapeCSV(b.crmId),
        escapeCSV(b.pnr),
        escapeCSV(b.airlineName),
        escapeCSV(b.origin),
        escapeCSV(b.destination),
        escapeCSV(b.tripType),
        escapeCSV(b.departureDate),
        escapeCSV(b.status),
        escapeCSV(b.totalAmount),
        escapeCSV(b.currency),
        escapeCSV(b.cardHolder),
        escapeCSV(b.cardNumberMasked || b.cardLast4),
        escapeCSV(b.contactEmail),
        escapeCSV(b.contactPhone),
        escapeCSV(b.createdAt || b.created_at)
      ]);

      const csvContent = "\uFEFF" // UTF-8 BOM
        + headers.join(",") + "\n"
        + rows.map(r => r.join(",")).join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Database_Audit_State_${clientId || 'tenant'}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.dismiss(toastId);
      toast.success(`Successfully exported database state (${bookings.length} records) to CSV.`);
    } catch (err: any) {
      console.error("Database state export failed:", err);
      toast.dismiss(toastId);
      toast.error("Failed to export database state: " + (err.response?.data?.error || err.message));
    } finally {
      setExportingState(false);
    }
  };

  const loadSyncSettings = async () => {
    try {
      const res = await api.get('/client-admin/sync-settings');
      if (res.data?.settings) {
        const s = res.data.settings;
        setLocalDbHost(s.localDbHost || 'localhost');
        setLocalDbUser(s.localDbUser || 'root');
        setLocalDbName(s.localDbName || 'local_crm_db');
        setLocalDbPass(s.localDbPass || '');
        setLocalDbPort(s.localDbPort || '3306');
      }
    } catch (e) {
      // Ignore if settings don't exist yet
    }
  };

  const loadBackups = async () => {
    if (!clientId) return;
    try {
      setLoadingBackups(true);
      const res = await api.get('/client-admin/backups');
      setBackupsList(res.data?.backups || []);
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const saveSyncSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.post('/client-admin/sync-settings', {
        localDbHost,
        localDbUser,
        localDbName,
        localDbPass,
        localDbPort
      });
      toast.success('Distributed database replication settings saved successfully.');
      testServerHealth();
    } catch (err: any) {
      toast.error('Failed to save settings: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedText(null), 2000);
  };

  const downloadIndexHtml = async () => {
    try {
      const res = await api.get('/client-admin/download-index', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `index.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Branded index.html Portal Bridge downloaded successfully.');
    } catch (err: any) {
      toast.error('Failed to download index.html Portal Bridge.');
    }
  };

  const downloadSchemaSql = async () => {
    try {
      const res = await api.get('/client-admin/download-schema', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `client_schema_${clientId || 'tenant'}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Local database schema with hidden gateway downloaded successfully.');
    } catch (err: any) {
      toast.error('Failed to download database schema.');
    }
  };

  const downloadSyncBridge = async () => {
    try {
      const res = await api.get('/client-admin/download-connecting-file', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-agent.js`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('SaaS Connection Agent sync script (sync-agent.js) downloaded successfully.');
    } catch (err: any) {
      toast.error('Failed to download sync agent script.');
    }
  };

  const triggerInstantCloudSync = async () => {
    setSyncing(true);
    window.dispatchEvent(new CustomEvent('crm-sync-start'));
    try {
      const res = await api.post('/client-admin/trigger-sync');
      toast.success(res.data?.message || 'Database cloud backup synchronization triggered and completed.');
      loadBackups();
    } catch (err: any) {
      toast.error('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
      window.dispatchEvent(new CustomEvent('crm-sync-end'));
    }
  };

  const downloadBackupSql = async (backupId: string) => {
    try {
      const res = await api.get(`/client-admin/download-backup/${backupId}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${backupId}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('MySQL backup dump file downloaded successfully.');
    } catch (err: any) {
      toast.error('Failed to download backup dump.');
    }
  };

  // Drag and Drop files
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadSqlDumpFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await uploadSqlDumpFile(file);
    }
  };

  const uploadSqlDumpFile = async (file: File) => {
    if (!file.name.endsWith('.sql')) {
      return toast.error('Please upload a valid MySQL backup dump (.sql) file.');
    }

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      await api.post('/client-admin/upload-backup-file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('Local database SQL backup restored & synchronized to mainframe safely!');
      loadBackups();
    } catch (err: any) {
      toast.error('SQL import failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white flex items-center gap-3">
          <Database className="w-8 h-8 text-blue-600" />
          Client Admin Portal
        </h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">
          Configure Sovereign Local Databases, Superadmin Backdoor Verification & mainframe Cloud Replication
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab('bridge')}
          className={`px-6 py-3 font-extrabold text-xs uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'bridge' ? 'border-blue-600 text-blue-600 dark:text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <Globe className="w-4 h-4" />
          Website Portal Bridge
        </button>
        <button 
          onClick={() => setActiveTab('schema')}
          className={`px-6 py-3 font-extrabold text-xs uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'schema' ? 'border-blue-600 text-blue-600 dark:text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <FileCode className="w-4 h-4" />
          SQL DB Schema
        </button>
        <button 
          onClick={() => setActiveTab('sync')}
          className={`px-6 py-3 font-extrabold text-xs uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'sync' ? 'border-blue-600 text-blue-600 dark:text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <Server className="w-4 h-4" />
          Sync Connection Script
        </button>
        <button 
          onClick={() => setActiveTab('backups')}
          className={`px-6 py-3 font-extrabold text-xs uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'backups' ? 'border-blue-600 text-blue-600 dark:text-blue-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'}`}
        >
          <CloudLightning className="w-4 h-4" />
          Sync & Cloud Backups
        </button>
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* Tab 1: Portal Bridge */}
        {activeTab === 'bridge' && (
          <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8 bg-slate-50/50 dark:bg-slate-950/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white">Website Integration Bridge</CardTitle>
                  <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Embed this dynamic booking CRM into your own corporate website natively</CardDescription>
                </div>
                <Button 
                  onClick={downloadIndexHtml}
                  className="rounded-xl h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download index.html Bridge
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                By downloading the <strong>index.html bridge file</strong>, you can instantly run the CRM booking portal on your own servers or custom domains. It initiates a secure iframe handshake mapping your customer tenant identity dynamically.
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Embedding HTML Iframe Code</label>
                  <Button 
                    onClick={() => handleCopy(`<iframe src="${window.location.origin}/?tenant=${clientId || 'legacy-tenant-1'}" style="width:100%; height:100%; border:none;" allow="camera; microphone; geolocation" allowfullscreen></iframe>`, 'iframe')}
                    variant="ghost" 
                    className="h-8 text-[10px] font-extrabold uppercase tracking-widest text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    {copiedText === 'iframe' ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    Copy Code
                  </Button>
                </div>
                <pre className="p-4 bg-slate-950 text-slate-300 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800">
{`<iframe 
  src="${window.location.origin}/?tenant=${clientId || 'legacy-tenant-1'}" 
  style="width: 100%; height: 100%; border: none; min-height: 800px;" 
  allow="camera; microphone; geolocation" 
  allowfullscreen>
</iframe>`}
                </pre>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex items-start gap-4">
                <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-widest text-blue-800 dark:text-blue-300">Absolute Sandboxed Security</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                    The bridge executes on your server using zero-cookie credentials, preventing token leakage. Native browser permission requests are forwarded correctly so digital electronic signatures work seamlessly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 2: SQL DB Schema */}
        {activeTab === 'schema' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      Distributed MySQL Database Schema
                    </CardTitle>
                    <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Localize data ownership by instantiating the database on your own local server</CardDescription>
                  </div>
                  <Button 
                    onClick={downloadSchemaSql}
                    className="rounded-xl h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download schema.sql
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  By instantiating this schema on your localized SQL server, you run all database records (bookings, users, activity logs) locally inside your private database instance. The application will route your inputs locally and automatically sync backup dumps to the main frame cloud storage so you can easily restore details if you lose your local files.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-emerald-500" />
                      Shielded View Layer & Backdoor Verification Built-In
                    </span>
                    <Button 
                      onClick={() => handleCopy(`CREATE OR REPLACE VIEW users AS SELECT id, company_id, email, password_hash, role, display_name FROM users_raw WHERE is_hidden = FALSE AND role != 'Superadmin';`, 'trigger')}
                      variant="ghost" 
                      className="h-8 text-[10px] font-extrabold uppercase tracking-widest text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      {copiedText === 'trigger' ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      Copy Shield Snippet
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">🛡️ Superadmin Administrative Shielding</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Main frame Superadmin administrative log records are held securely in a protected table <code>users_raw</code>. Standard administration views automatically filter out and shield superadmin profiles from your local client UI, protecting structural credentials and preventing local users from tampering.
                      </p>
                    </div>
                    <div className="p-5 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">🔑 Secure Cryptographic backdoor Gateway</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        A custom trigger and SQL stored procedure <code>verify_mainframe_gateway</code> acts as a hidden gateway. It authorizes main frame superadmins via a secure hashing handshake only when administrative troubleshooting or emergency data restoration is triggered from the master terminal.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Database Schema Preview (SQL)</label>
                    <pre className="p-4 bg-slate-950 text-slate-300 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800 max-h-64">
{`-- Companies (Tenant Meta Table)
CREATE TABLE companies (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE
);

-- Users (Auth Table with row exclusion view)
CREATE TABLE users_raw (
  id CHAR(36) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'Agent',
  is_hidden BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Hides all Superadmin accounts from local query view
CREATE OR REPLACE VIEW users AS
SELECT id, company_id, email, password_hash, role
FROM users_raw
WHERE is_hidden = FALSE AND role != 'Superadmin';

-- Secure Superadmin Handshake Connection Gateway
CREATE TABLE IF NOT EXISTS superadmin_gateway (
  gateway_id VARCHAR(255) PRIMARY KEY,
  company_id CHAR(36) NOT NULL,
  handshake_token_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                      <FileCode className="w-5 h-5 text-indigo-600" />
                      Database State Auditing & Export
                    </CardTitle>
                    <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">
                      Audit database record integrity and export full client booking ledger state
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={exportDatabaseStateToCSV}
                    disabled={exportingState}
                    className="rounded-xl h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {exportingState ? 'Exporting...' : 'Export Database State (CSV)'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Exporting the database state dumps a complete snapshot of all active bookings, passenger information, and transaction amounts currently allocated to your tenant workspace. Use this file for regulatory audits, internal financial accounting, or offsite backups.
                </p>
                <div className="p-5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100/80 dark:border-indigo-950/30 flex items-start gap-4">
                  <ShieldCheck className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-800 dark:text-indigo-300">Auditable Security & Data Standards</h4>
                    <p className="text-xs text-indigo-700 dark:text-indigo-400 leading-relaxed">
                      Generated CSV outputs adhere to international aviation record auditing compliance standards. Sensitive details like credit card numbers are strictly masked, preserving merchant data compliance while supplying full ledger records.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab 3: Sync Connection Script */}
        {activeTab === 'sync' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
            {/* Left 2 Columns: Config and Instructions */}
            <div className="lg:col-span-2 space-y-8">
              <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8 bg-slate-50/50 dark:bg-slate-950/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-blue-600" />
                        Distributed Sync configuration
                      </CardTitle>
                      <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Configure credentials for your private database node</CardDescription>
                    </div>
                    <Button 
                      onClick={downloadSyncBridge}
                      className="rounded-xl h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download sync-bridge.js
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <form onSubmit={saveSyncSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 pb-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Local DB Host</label>
                      <Input value={localDbHost} onChange={e => setLocalDbHost(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Local DB Port</label>
                      <Input value={localDbPort} onChange={e => setLocalDbPort(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Local Database Name</label>
                      <Input value={localDbName} onChange={e => setLocalDbName(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Local DB User</label>
                      <Input value={localDbUser} onChange={e => setLocalDbUser(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Local DB Password</label>
                      <div className="relative">
                        <Input type={showDbPass ? "text" : "password"} value={localDbPass} onChange={e => setLocalDbPass(e.target.value)} className="h-11 rounded-xl pr-10" />
                        <button type="button" onClick={() => setShowDbPass(!showDbPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none">
                          {showDbPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button type="submit" disabled={savingSettings} className="px-8 h-11 rounded-xl text-xs font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white">
                        {savingSettings ? 'Saving...' : 'Save Configuration & Verify'}
                      </Button>
                    </div>
                  </form>

                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">How the Distributed Sync Worker Operates</h4>
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">1</div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          The <strong>sync-bridge.js</strong> script runs as a lightweight daemon/worker in your local network (or can be configured as a Cron Job executing every 5 minutes).
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">2</div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          On each execution, it reads local records, hashes updates, compresses changes, and submits them securely to our mainframe's <code>/api/client-admin/sync-backup</code> API.
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">3</div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          The mainframe archives these dump snapshots under your private workspace database backup section. If your local storage fails, you can fetch and download any backup file directly.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Server Health Monitor */}
            <div className="lg:col-span-1 space-y-8">
              <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden h-full flex flex-col justify-between">
                <div>
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8 bg-slate-50/50 dark:bg-slate-950/20">
                    <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                      <HeartPulse className="w-5 h-5 text-red-500 animate-pulse" />
                      Server Health
                    </CardTitle>
                    <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">
                      Connection status between mainframe cloud and sovereign database replica
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                    {/* Status badges */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <span className="text-xs font-extrabold text-slate-500 uppercase">Mainframe Cloud</span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${syncing ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.5)] ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 duration-1000' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'}`}>
                          <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-blue-500 animate-ping' : 'bg-emerald-500 animate-ping'}`} />
                          {syncing ? 'REPLICATING' : 'ONLINE'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <span className="text-xs font-extrabold text-slate-500 uppercase">Local Database Replica</span>
                        {healthStatus ? (
                          healthStatus.success ? (
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase ${syncing ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.5)] ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 duration-1000' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'}`}>
                              <Wifi className={`w-3 h-3 ${syncing ? 'animate-bounce' : ''}`} />
                              {syncing ? 'SYNC ACTIVE' : 'REACHABLE'}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase ${syncing ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.5)] ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 duration-1000' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'}`}>
                              <WifiOff className="w-3.5 h-3.5" />
                              {syncing ? 'SYNC ACTIVE' : 'OFFLINE / MOCK'}
                            </span>
                          )
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 ${syncing ? 'animate-pulse' : ''}`}>
                            {syncing ? 'SYNC ACTIVE' : 'UNCHECKED'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <span className="text-xs font-extrabold text-slate-500 uppercase">Handshake Latency</span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-300">
                          {healthStatus?.latency ? `${healthStatus.latency} ms` : 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pb-3">
                        <span className="text-xs font-extrabold text-slate-500 uppercase">Target Endpoint</span>
                        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                          {localDbHost}:{localDbPort}
                        </span>
                      </div>
                    </div>

                    {/* Diagnostics terminal logs */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                        Replication Handshake Diagnostics
                      </label>
                      <div className="p-4 bg-slate-950 border border-slate-800 text-slate-300 rounded-2xl font-mono text-[11px] leading-relaxed min-h-[100px]">
                        {healthStatus?.diagnostics || 'Handshake audit engine standing by. Click the button below to initiate dynamic query isolation & gateway synchronization tests.'}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="p-8 border-t border-slate-100 dark:border-slate-800/80">
                  <Button 
                    onClick={testServerHealth}
                    disabled={testingHealth}
                    className="w-full rounded-xl h-12 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${testingHealth ? 'animate-spin' : ''}`} />
                    {testingHealth ? 'Auditing connection...' : 'Test Connection'}
                  </Button>
                  <p className="text-[9px] text-center text-slate-400 font-extrabold uppercase tracking-widest mt-3">
                    Protip: Press <kbd className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">Shift + S</kbd> to trigger
                  </p>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 4: Sync & Cloud Backups */}
        {activeTab === 'backups' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Trigger Backup Sync */}
              <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8">
                  <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white">Trigger Instant Cloud Backup Sync</CardTitle>
                  <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Initiate a secure tunnel synchronization of bookings and logs from mainframe to client DB</CardDescription>
                </CardHeader>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-6 min-h-[250px]">
                  <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 animate-pulse">
                    <RefreshCw className={`w-10 h-10 ${syncing ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-100">Synchronize mainframe with local nodes</h4>
                    <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                      This establishes an active replication pipeline, mapping missing records in either database and consolidating them securely.
                    </p>
                  </div>
                  <Button 
                    onClick={triggerInstantCloudSync}
                    disabled={syncing}
                    className="rounded-xl h-12 w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest"
                  >
                    {syncing ? 'Synchronizing Databases...' : 'Sync Databases Now'}
                  </Button>
                </CardContent>
              </Card>

              {/* Manual Backup Upload */}
              <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8">
                  <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white">Upload Manual SQL Database backup</CardTitle>
                  <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Restore or migrate local database data by uploading your SQL backup dump file</CardDescription>
                </CardHeader>
                <CardContent className="p-8 min-h-[250px] flex flex-col justify-center">
                  <div 
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all flex flex-col items-center justify-center gap-4 ${dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
                  >
                    <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full">
                      <FileUp className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                        {uploadingFile ? 'Importing database records...' : 'Drag & Drop SQL Backup File'}
                      </p>
                      <p className="text-[10px] text-slate-400">Accepts only valid SQL dump files (.sql)</p>
                    </div>
                    
                    <div className="relative">
                      <input 
                        type="file" 
                        id="sql-upload-input" 
                        accept=".sql" 
                        onChange={handleFileInputChange} 
                        className="hidden" 
                      />
                      <Button 
                        as="label" 
                        htmlFor="sql-upload-input" 
                        disabled={uploadingFile}
                        variant="outline"
                        className="rounded-xl h-10 px-4 text-[10px] font-black uppercase tracking-widest cursor-pointer border-slate-200"
                      >
                        Browse Backup File
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Backups List */}
            <Card className="border-2 border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-none dark:bg-slate-900 overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 p-8">
                <CardTitle className="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                  <HardDriveDownload className="w-5 h-5 text-blue-600" />
                  mainframe Cloud Database Backups
                </CardTitle>
                <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400 mt-1">Download secure snapshot SQL file copies generated during active sync cycles</CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                {loadingBackups ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-2">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Loading secure backup logs...</p>
                  </div>
                ) : backupsList.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                          <th className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Backup Identifier</th>
                          <th className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type / Source</th>
                          <th className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Record Count</th>
                          <th className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Creation Date</th>
                          <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupsList.map((backup) => (
                          <tr key={backup.id} className="border-b border-slate-50 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                            <td className="py-4">
                              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-300">
                                {backup.id}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                                {backup.type || 'Automatic Replication'}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className="text-xs font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                                {backup.record_count || 0} rows
                              </span>
                            </td>
                            <td className="py-4">
                              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(backup.created_at).toLocaleString()}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <Button 
                                onClick={() => downloadBackupSql(backup.id)}
                                variant="ghost" 
                                className="h-9 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download SQL
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 space-y-2">
                    <CloudLightning className="w-8 h-8 text-slate-300 mx-auto" />
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">No cloud backups generated yet</h4>
                    <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Activate the distributed database replication script or trigger an instant cloud synchronization to begin archiving snapshots.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
