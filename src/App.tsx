import React, { useState, useEffect, FormEvent, Suspense } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Search, 
  Bell, 
  Moon, 
  Sun,
  Plane,
  Menu,
  X,
  Check,
  CheckCircle2,
  PlusCircle,
  FileEdit,
  Calendar,
  Mail,
  Users,
  BarChart3,
  Activity,
  Settings as SettingsIcon,
  Database,
  Building,
  Download,
  LayoutDashboard,
  Keyboard,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Icon = ({ name, ...props }: { name: string, [key: string]: any }) => {
  const icons: Record<string, any> = {
    LogOut, Search, Bell, Moon, Sun, Plane, Menu, X, Check, CheckCircle2,
    PlusCircle, FileEdit, Calendar, Mail, Users, BarChart3, Activity,
    Settings: SettingsIcon, Database, Building, Download, LayoutDashboard, Keyboard,
    RefreshCw, Wifi, WifiOff
  };
  const LucideIcon = icons[name];
  return LucideIcon ? <LucideIcon {...props} /> : null;
};
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TenantContext, ClientTenant, useTenant, getDbPath } from '@/lib/tenant';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// Pages
import LoginPage from './pages/LoginPage';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CreateBooking = React.lazy(() => import('./pages/CreateBooking'));
const AllBookings = React.lazy(() => import('./pages/AllBookings'));
const AuthorizationPage = React.lazy(() => import('./pages/AuthorizationPage'));
const ActivityLogs = React.lazy(() => import('./pages/ActivityLogs'));
const Settings = React.lazy(() => import('./pages/Settings'));
const EmailTemplatesPage = React.lazy(() => import('./pages/EmailTemplatesPage'));
const UsersPage = React.lazy(() => import('./pages/UsersPage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const CalendarView = React.lazy(() => import('./pages/CalendarView'));
const ClientAdminPage = React.lazy(() => import('./pages/ClientAdminPage'));
const SentEmailsInbox = React.lazy(() => import('./pages/SentEmailsInbox'));

import { SafeFallback } from '@/components/SafeFallback';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export type UserRole = 'Admin' | 'Manager' | 'Agent' | 'HOD' | 'WFM';

interface UserProfile {
  id?: string;
  uid: string;
  email: string | null;
  role: UserRole;
  username?: string;
  clientId?: string;
  photoURL?: string;
  phone?: string;
}

export default function AppWrapper() {
  const [clientId, setClientId] = useState<string | null>(localStorage.getItem('tenantId') || null);
  const [activeClient, setActiveClient] = useState<ClientTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    async function determineTenant() {
      const hostname = window.location.hostname;
      const isSystemDomain = hostname.includes('localhost') || 
                             hostname.includes('127.0.0.1') || 
                             hostname.includes('run.app') || 
                             hostname.includes('itconflict.xyz') || 
                             hostname.startsWith('ais-');
      
      const searchParams = new URLSearchParams(window.location.search);
      const urlTenant = searchParams.get('tenant');
      const storedTenant = localStorage.getItem('tenantId');
      
      const tenantIdToLookup = urlTenant || storedTenant || null;

      if (!isSystemDomain || tenantIdToLookup) {
        try {
          const res = await api.get('/clients/tenant', { 
            params: { domain: hostname, tenantId: tenantIdToLookup }
          });
          
          if (res.data) {
             setActiveClient(res.data);
             setClientId(res.data.id);
             localStorage.setItem('tenantId', res.data.id);
             setIsSuspended(res.data.isActive === false);
          } else if (storedTenant && storedTenant !== 'legacy-tenant-1') {
             try {
               const directRes = await api.get(`/clients/${storedTenant}`);
               if (directRes.data) {
                 setActiveClient(directRes.data);
                 setClientId(directRes.data.id);
                 setIsSuspended(directRes.data.isActive === false);
                 setLoading(false);
                 return;
               }
             } catch (err) {}
             
             setActiveClient({ id: 'legacy-tenant-1', name: 'Default Company', domain: hostname, isActive: true });
             setClientId('legacy-tenant-1');
             localStorage.setItem('tenantId', 'legacy-tenant-1');
          } else {
             setActiveClient({ id: 'legacy-tenant-1', name: 'Default Company', domain: hostname, isActive: true });
             setClientId('legacy-tenant-1');
             localStorage.setItem('tenantId', 'legacy-tenant-1');
          }
        } catch (e) {
          console.error("Failed to load tenant", e);
          if (storedTenant && storedTenant !== 'legacy-tenant-1') {
             try {
               const directRes = await api.get(`/clients/${storedTenant}`);
               if (directRes.data) {
                 setActiveClient(directRes.data);
                 setClientId(directRes.data.id);
                 setIsSuspended(directRes.data.isActive === false);
                 setLoading(false);
                 return;
               }
             } catch (err) {}
          }
          setActiveClient({ id: 'legacy-tenant-1', name: 'Default Company', domain: hostname, isActive: true });
          setClientId('legacy-tenant-1');
          localStorage.setItem('tenantId', 'legacy-tenant-1');
        }
      } else if (clientId) {
        try {
          const res = await api.get(`/clients/${clientId}`);
          if (res.data) {
            setActiveClient(res.data);
            setIsSuspended(res.data.isActive === false);
          }
        } catch(e) {}
      }
      setLoading(false);
    }
    determineTenant();
  }, [clientId]);

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white uppercase tracking-widest font-black text-xs">Loading Cloud Space...</div>;
  }

  if (isSuspended) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white space-y-4">
        <ServerCrash className="w-16 h-16 text-red-500" />
        <h1 className="text-2xl font-black uppercase tracking-widest text-red-500">Service Suspended</h1>
        <p className="text-xs uppercase tracking-widest text-slate-500">This tenant space has been disabled by the system administrator.</p>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={{ clientId, activeClient, setClientId }}>
      <App />
    </TenantContext.Provider>
  );
}

function ServerCrash(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 14h12"/><path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/><path d="M12 10v4"/><path d="M10 22v-4"/><path d="M14 22v-4"/><path d="M15 6h.01"/><path d="M9 6h.01"/></svg>
}

function AdminRoute({ isAdmin, children }: { isAdmin: boolean, children: React.ReactNode }) {
  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">403 Forbidden</h2>
        <p className="text-slate-500 dark:text-slate-400">Admin access is required to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function App() {
  const navigate = useNavigate();
  const { clientId, activeClient } = useTenant();
  const { user, setUser, isLoading: isAuthLoading, logout } = useAuth();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [settings, setSettings] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [readNotifications, setReadNotifications] = useState<string[]>([]);
  const [agentStatus, setAgentStatus] = useState<'Live' | 'Break' | 'Logged Out'>('Live');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Progressive Web App Installation Hooks
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsSyncing(true);
      toast.success("Connection restored! Syncing CRM data with servers...", {
        duration: 4000,
        icon: <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
      });
      
      // Trigger background sync if supported
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration: any) => {
          if (registration.sync) {
            registration.sync.register('sync-crm-data').catch((err: any) => {
              console.warn('Background Sync registration failed, running normal refetch:', err);
            });
          }
        });
      }

      // Fire a custom event to notify all active pages to refetch details
      window.dispatchEvent(new CustomEvent('crm-sync-refresh'));
      
      setTimeout(() => {
        setIsSyncing(false);
      }, 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error("You are currently offline. Operations will cached locally until internet connection is restored.", {
        duration: 5000
      });
    };

    const handleCrmSyncRefresh = () => {
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2500);
    };

    const handleCrmSyncStart = () => {
      setIsSyncing(true);
    };

    const handleCrmSyncEnd = () => {
      setIsSyncing(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('crm-sync-refresh', handleCrmSyncRefresh);
    window.addEventListener('crm-sync-start', handleCrmSyncStart);
    window.addEventListener('crm-sync-end', handleCrmSyncEnd);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('crm-sync-refresh', handleCrmSyncRefresh);
      window.removeEventListener('crm-sync-start', handleCrmSyncStart);
      window.removeEventListener('crm-sync-end', handleCrmSyncEnd);
    };
  }, []);

  useEffect(() => {
    // Detect standalone display mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true || 
                         document.referrer.includes('android-app://');
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      console.log('CRM PWA application installed successfully!');
      setIsInstalled(true);
      setShowInstallBtn(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA installation choice outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  useEffect(() => {
    if (user?.id) {
      try {
        const stored = localStorage.getItem(`read_notifications_${user.id}`);
        setReadNotifications(stored ? JSON.parse(stored) : []);
      } catch (e) {
        setReadNotifications([]);
      }
    } else {
      setReadNotifications([]);
    }
  }, [user]);

  const toggleReadNotification = (id: string | number) => {
    const idStr = String(id);
    const userId = user?.id || 'guest';
    let updated;
    if (readNotifications.includes(idStr)) {
      updated = readNotifications.filter(x => x !== idStr);
    } else {
      updated = [...readNotifications, idStr];
    }
    setReadNotifications(updated);
    try {
      localStorage.setItem(`read_notifications_${userId}`, JSON.stringify(updated));
    } catch (e) {}
  };

  const markAllAsRead = () => {
    const userId = user?.id || 'guest';
    const allIds = notifications.map(notif => String(notif.id));
    const merged = Array.from(new Set([...readNotifications, ...allIds]));
    setReadNotifications(merged);
    try {
      localStorage.setItem(`read_notifications_${userId}`, JSON.stringify(merged));
    } catch (e) {}
  };

  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((notif: any) => !readNotifications.includes(String(notif.id))).length
    : 0;

  useEffect(() => {
    if (isAuthLoading) return;
    
    if (user) {
      setProfile({
        id: user.id || user.uid,
        uid: user.id || user.uid,
        email: user.email,
        role: user.role,
        username: user.displayName || user.username || user.email?.split('@')[0],
        photoURL: user.photoURL,
        phone: user.phone,
      });

      if (!user.totp_enabled) {
        sessionStorage.setItem('mfa_verified', 'true');
      }
      
      const fetchData = async () => {
        setIsSyncing(true);
        try {
          const settingsRes = await api.get('/settings');
          setSettings(settingsRes.data);
        } catch(e) {}
        
        try {
          const notifRes = await api.get('/bookings/recent-updates');
          setNotifications(Array.isArray(notifRes.data) ? notifRes.data : []);
        } catch(e) {
          setNotifications([]);
        }
        
        setLoading(false);
        setTimeout(() => setIsSyncing(false), 1500);
      };
      
      fetchData();

      const handleSettingsUpdate = async () => {
        setIsSyncing(true);
        try {
          const settingsRes = await api.get('/settings');
          setSettings(settingsRes.data);
        } catch (e) {}
        setTimeout(() => setIsSyncing(false), 1000);
      };
      window.addEventListener('settingsUpdated', handleSettingsUpdate);
      
      // Basic polling for notifications
      const notifInterval = setInterval(async () => {
         setIsSyncing(true);
         try {
           const res = await api.get('/bookings/recent-updates');
           setNotifications(Array.isArray(res.data) ? res.data : []);
         } catch(e) {
           setNotifications([]);
         } finally {
           setTimeout(() => setIsSyncing(false), 1500);
         }
      }, 60000);
      
      return () => {
        clearInterval(notifInterval);
        window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      };
    } else {
      setProfile(null);
      setSettings(null);
      setNotifications([]);
      setLoading(false);
    }
  }, [user, isAuthLoading]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Automatic session timeout (30 minutes of inactivity)
  useEffect(() => {
    if (!user) return;

    const timeoutDuration = 30 * 60 * 1000; // 30 minutes in milliseconds
    let timeoutId: NodeJS.Timeout;

    const handleInactivityLogout = () => {
      logout();
      toast.error("Session expired due to 30 minutes of inactivity. Please login again.");
      navigate('/login' + window.location.search);
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleInactivityLogout, timeoutDuration);
    };

    // Events to track user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    // Set initial timer
    resetTimer();

    // Listen to activities
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, navigate, logout]);

  // Update favicon dynamically when branding settings load
  useEffect(() => {
    const faviconUrl = settings?.logoUrl || '/logo.svg';
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
    if (faviconUrl.endsWith('.svg')) {
      link.type = 'image/svg+xml';
    } else {
      link.type = 'image/png';
    }
  }, [settings?.logoUrl]);

  useEffect(() => {
    if (user && profile && clientId) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('downloadBridge') === 'true') {
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Portal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body,html{margin:0;padding:0;height:100%;overflow:hidden;background:#0f172a;}</style>
</head>
<body>
  <iframe src="${window.location.origin}/?tenant=${clientId}" style="width:100%;height:100%;border:none;" allow="camera; microphone; geolocation" allowfullscreen></iframe>
</body>
</html>`;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `index.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({path:newUrl}, '', newUrl);
        toast.success("Website bridge script (index.html) downloaded successfully.");
      }
    }
  }, [user, profile, clientId]);

  const handleNotificationClick = () => {
    toast.info("No new notifications at this time.");
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const term = searchTerm.trim().toLowerCase();
    
    if (term.length < 2) {
      setPreviewResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delay = setTimeout(async () => {
      try {
        const res = await api.get('/bookings', { params: { q: term, limit: 3 } });
        setPreviewResults(res.data.bookings || []);
      } catch (err) {
        console.error("Preview Search Error", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [searchTerm, clientId]);

  const handleGlobalSearch = (e: FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/bookings?q=${encodeURIComponent(searchTerm)}`);
      setShowPreview(false);
    }
  };

  const userCompanyId = user?.company_id || user?.companyId || clientId;
  const isSystemAdmin = user?.email === 'manishmalik0965@gmail.com' || profile?.role === 'Superadmin' || user?.role === 'Superadmin' || (userCompanyId === 'legacy-tenant-1' && (profile?.role === 'Admin' || user?.role === 'Admin'));
  const isTenantAdmin = profile?.role === 'Admin' && !isSystemAdmin && userCompanyId !== 'legacy-tenant-1';
  const isAdmin = (profile?.role === 'Admin' || profile?.role === 'Superadmin' || isSystemAdmin) && !isTenantAdmin;
  const isManager = (profile?.role === 'Admin' || profile?.role === 'Manager' || profile?.role === 'Superadmin' || isSystemAdmin) && !isTenantAdmin;
  const isAgent = !!profile && !isTenantAdmin; // Everyone with a profile is at least an agent

  // Strict role boundaries
  const canDeleteBookings = isAdmin;
  const canManageUsers = isAdmin;
  const canEditBookings = isManager; // Manager and Admin
  const canCreateBookings = isAgent; // Everyone
  const canSendEmails = isAgent; // Everyone

  // Global Keyboard Shortcuts hook listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in form inputs, textarea, or contentEditable dynamic elements
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const isInput = 
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.hasAttribute('contenteditable') || 
        target.isContentEditable;

      // Handle Escape globally to dismiss help or search preview
      if (e.key === 'Escape') {
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
          setShowPreview(false);
          return;
        }
      }

      // If user is editing/typing inside an input field, do not trigger navigation/global shortcuts
      if (isInput) return;

      const key = e.key.toLowerCase();

      // Trigger standard shortcuts
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setShowPreview(true);
        toast.info("Search focused (Press Escape to dismiss)", { id: "search-focus", duration: 1500 });
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
        return;
      }

      switch (key) {
        case 'n':
          e.preventDefault();
          if (canCreateBookings) {
            navigate('/bookings/new');
            toast.info("Navigated to New Booking", { id: "kb-nav-new", duration: 1500 });
          } else {
            toast.error("You do not have permission to create bookings.");
          }
          break;
        case 'h':
          e.preventDefault();
          navigate('/');
          toast.info("Navigated to Dashboard", { id: "kb-nav-dash", duration: 1500 });
          break;
        case 'b':
          e.preventDefault();
          navigate('/bookings');
          toast.info("Navigated to All Bookings", { id: "kb-nav-bookings", duration: 1500 });
          break;
        case 'd':
          e.preventDefault();
          navigate('/drafts');
          toast.info("Navigated to Draft Bookings", { id: "kb-nav-drafts", duration: 1500 });
          break;
        case 'a':
          e.preventDefault();
          navigate('/authorized');
          toast.info("Navigated to Authorized Bookings", { id: "kb-nav-auth", duration: 1500 });
          break;
        case 's':
          e.preventDefault();
          if (isAdmin || isSystemAdmin) {
            navigate('/settings');
            toast.info("Navigated to Settings", { id: "kb-nav-settings", duration: 1500 });
          }
          break;
        case 'u':
          e.preventDefault();
          if (isManager) {
            navigate('/users');
            toast.info("Navigated to Manage Users", { id: "kb-nav-users", duration: 1500 });
          }
          break;
        case 't':
          e.preventDefault();
          if (isAdmin) {
            navigate('/templates');
            toast.info("Navigated to Email Templates", { id: "kb-nav-templates", duration: 1500 });
          }
          break;
        case 'm':
          // Optional additional navigation shortcut
          break;
        case 'k':
          e.preventDefault();
          setShowShortcutsHelp(prev => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, isAgent, isManager, isAdmin, isSystemAdmin, canCreateBookings, showShortcutsHelp]);

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">Loading Blackgrass CRM...</div>;

  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white uppercase tracking-widest font-black text-xs">Loading Cloud Space...</div>}>
      <Routes>
        {/* Public Authorization Route */}
        <Route path="/authorize/:bookingId" element={<AuthorizationPage />} />
        
        {/* Login Route */}
        <Route path="/login" element={user && (!user.totp_enabled || sessionStorage.getItem('mfa_verified') === 'true') ? <Navigate to={'/' + window.location.search} /> : <LoginPage />} />

        {/* Protected CRM Routes */}
        <Route path="/*" element={user && profile && (
            !user.totp_enabled ||
            sessionStorage.getItem('mfa_verified') === 'true' || 
            (!settings?.globalTwoFactorEnabled && ((profile.role !== 'Admin' && profile.role !== 'Manager') || !settings?.twoFactorEnabled))
        ) ? (
          <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors relative">
            
            {/* Mobile Header */}
            <div className="lg:hidden absolute top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-20">
              <Link to="/" className="flex items-center gap-2 px-1 hover:opacity-85 transition-opacity">
                <div 
                  className="w-8 h-8 rounded shrink-0 flex items-center justify-center shadow-lg overflow-hidden border border-slate-700/50" 
                  style={{ backgroundColor: settings?.primaryColor || '#2563eb' }}
                >
                  <img src={settings?.logoUrl || '/logo.png'} alt="Logo" className="w-full h-full object-cover" onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }} />
                  <Plane className="w-5 h-5 text-white hidden" />
                </div>
                <h1 className="text-slate-900 dark:text-white font-black tracking-tight text-sm sm:text-base uppercase max-w-[120px] sm:max-w-[200px] truncate">{settings?.organizationName || 'BLACKGRASS CRM'}</h1>
              </Link>
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Mobile Syncing Indicator */}
                <div className="flex items-center shrink-0 mr-1">
                  {isSyncing ? (
                    <div className="p-1.5 text-blue-500 bg-blue-50 dark:bg-blue-950/40 rounded-full border border-blue-100 dark:border-blue-900/40" title="Sync active...">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  ) : !isOnline ? (
                    <div className="p-1.5 text-red-500 bg-red-50 dark:bg-red-950/40 rounded-full border border-red-100 dark:border-red-900/40 animate-pulse" title="Offline mode">
                      <WifiOff className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Connected & Online"></div>
                  )}
                </div>
                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 transition-colors" onClick={() => setDarkMode(!darkMode)} title="Toggle Theme">
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs cursor-pointer hover:bg-blue-700 transition overflow-hidden border border-slate-200 dark:border-slate-800" onClick={() => { navigate('/profile'); setSidebarOpen(false); }} title="My Profile">
                  {profile?.photoURL ? (
                    <img src={profile.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    (profile?.username || user?.email || '?').charAt(0).toUpperCase()
                  )}
                </div>
                <button className="p-1 text-slate-400 hover:text-red-500 transition-colors" onClick={logout} title="Logout">
                  <LogOut className="w-4 h-4" />
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 dark:text-slate-400" onClick={() => setSidebarOpen(!sidebarOpen)}>
                  {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            {/* Mobile Sidebar Overlay with CSS transitions */}
            <div 
              className={cn(
                "lg:hidden fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 ease-in-out",
                sidebarOpen ? "opacity-100 pointer-events-auto font-sans" : "opacity-0 pointer-events-none font-sans"
              )}
              onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside className={cn(
              "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
              <Link to="/" className="p-6 hidden lg:flex items-center gap-3 hover:opacity-85 transition-opacity">
                <div 
                  className="w-8 h-8 rounded shrink-0 flex items-center justify-center shadow-lg overflow-hidden border border-slate-700/50" 
                  style={{ backgroundColor: settings?.primaryColor || '#2563eb' }}
                >
                  <img src={settings?.logoUrl || '/logo.png'} alt="Logo" className="w-full h-full object-cover" onError={(e) => {
                    // Fallback if logo.png doesn't exist
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }} />
                  <Plane className="w-5 h-5 text-white hidden" />
                </div>
                <h1 className="text-white font-black tracking-tight text-base uppercase truncate max-w-[155px]">{settings?.organizationName || 'BLACKGRASS CRM'}</h1>
              </Link>
              
              {/* Mobile Sidebar Header */}
              <div className="p-6 lg:hidden flex flex-col pt-16">
                 {/* Spacing for mobile top bar */}
              </div>

              <ScrollArea className="flex-1 px-4" id="sidebar-scroll-area">
                <nav className="space-y-1" id="sidebar-navigation">
                  <NavItem to="/" iconName="LayoutDashboard" label="Dashboard" />
                  {isAgent && <NavItem to="/bookings/new" iconName="PlusCircle" label="Create Booking" />}
                  <NavItem to="/bookings" iconName="FileEdit" label="All Bookings" />
                  <NavItem to="/calendar" iconName="Calendar" label="Calendar View" />
                  <NavItem to="/drafts" iconName="FileEdit" label="Draft Bookings" />
                  <NavItem to="/authorized" iconName="CheckCircle2" label="Authorized" />
                  <NavItem to="/sent-emails" iconName="Mail" label="Email Sent Inbox" />
                  
                  {isManager && (
                    <>
                      <div className="pt-6 pb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Management</div>
                      <NavItem to="/users" iconName="Users" label="Manage Users" />
                      <NavItem to="/analytics" iconName="BarChart3" label="Analytics" />
                    </>
                  )}
                  {isAdmin && (
                    <>
                      <NavItem to="/logs" iconName="Activity" label="Activity Logs" />
                      <NavItem to="/templates" iconName="Mail" label="Email Templates" />
                      <NavItem to="/settings" iconName="Settings" label="Settings" />
                    </>
                  )}
                  {(isTenantAdmin || (profile?.role === 'Admin' && !isSystemAdmin)) && (
                    <NavItem to="/client-portal" iconName="Database" label="Client Admin" />
                  )}
                  {isSystemAdmin && (
                    <NavItem to="/clients" iconName="Building" label="Clients" />
                  )}
                </nav>
              </ScrollArea>
              <div className="p-4 border-t border-slate-800 flex flex-col gap-3 bg-slate-950/20">
                {showInstallBtn && (
                  <button 
                    onClick={handleInstallClick}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition duration-150 shadow-md active:scale-[0.98]"
                  >
                    <Icon name="Download" className="w-3.5 h-3.5" />
                    <span>Install CRM Software</span>
                  </button>
                )}
                {/* User Info Footing inside App navigation bar for better Phone experience */}
                <div className="flex items-center justify-between gap-2 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-2.5 min-w-0 cursor-pointer" onClick={() => { navigate('/profile'); setSidebarOpen(false); }}>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-black text-white text-xs overflow-hidden border border-slate-700 shrink-0">
                      {profile?.photoURL ? (
                        <img src={profile.photoURL} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        (profile?.username || user?.email || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-[11px] text-white font-bold truncate pr-1">{profile?.username || user?.email}</p>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold">{profile?.role}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-slate-800 shrink-0" onClick={() => { logout(); setSidebarOpen(false); }}>
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="text-center">
                  {isSystemAdmin && (
                    <p className="text-[9px] text-slate-500 font-medium font-mono uppercase tracking-widest">© {new Date().getFullYear()} ALL RIGHTS RESERVED SELLER OF THE SOFTWARE</p>
                  )}
                  <p className="text-[8px] text-slate-600 font-medium font-mono uppercase tracking-widest mt-1 opacity-70">Licenced to: {settings?.organizationName || 'BLACKGRASS CRM'}</p>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors pt-16 lg:pt-0">
              {/* Navbar */}
              <header className="h-16 hidden lg:flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 items-center justify-between px-8 sticky top-0 z-10 shrink-0 transition-colors">
                <div className="relative">
                  <form onSubmit={handleGlobalSearch} className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-md px-3 py-1.5 w-64 xl:w-96 transition-colors group focus-within:ring-2 focus-within:ring-blue-500/20">
                    <Search className="w-4 h-4 text-slate-400 mr-2 group-focus-within:text-blue-500 transition-colors" />
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="Search CRM ID, Passenger, or Email... (Press / to search)" 
                      className="bg-transparent border-none text-sm w-full outline-none text-slate-600 dark:text-slate-300 font-light"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowPreview(true);
                      }}
                      onFocus={() => setShowPreview(true)}
                      onBlur={() => setTimeout(() => setShowPreview(false), 200)}
                    />
                  </form>
                  
                  {showPreview && searchTerm.length >= 2 && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                      {isSearching ? (
                        <div className="p-4 text-xs font-bold text-slate-400 text-center uppercase tracking-widest">Searching...</div>
                      ) : previewResults.length > 0 ? (
                        <div className="flex flex-col">
                          {previewResults.map(b => (
                            <div 
                              key={b.id} 
                              onClick={() => {
                                navigate(`/bookings/${b.id}`);
                                setShowPreview(false);
                              }}
                              className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-b-0 space-y-1 group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors">{b.crmId}</span>
                                <Badge variant="outline" className="text-[10px] tracking-widest uppercase">{b.status || 'Draft'}</Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs text-slate-500 text-left">
                                <span className="truncate flex-1 max-w-[200px] text-left text-[11px]">{b.passengerNames?.join(', ') || 'No Passengers'}</span>
                                <span className="font-mono text-[10px]">{b.pnr || 'No PNR'}</span>
                              </div>
                            </div>
                          ))}
                          <div 
                            onClick={() => {
                              navigate(`/bookings?q=${encodeURIComponent(searchTerm)}`);
                              setShowPreview(false);
                            }}
                            className="bg-slate-50 dark:bg-slate-800/50 p-2 text-center text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                          >
                            View all results for "{searchTerm}"
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-xs font-bold text-slate-400 text-center italic">No immediate results found</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  {/* Background sync/connection status indicator */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSyncing ? (
                      <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/40 shadow-sm transition-all duration-300">
                        <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                        <span className="uppercase tracking-wider">Sync Active</span>
                      </div>
                    ) : !isOnline ? (
                      <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-red-100 dark:border-red-900/40 shadow-sm transition-all duration-300 animate-pulse">
                        <WifiOff className="w-3 h-3 text-red-500" />
                        <span className="uppercase tracking-wider">Offline</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-100 dark:border-slate-800/80 transition-all duration-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="uppercase tracking-wider">Online</span>
                      </div>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger className="outline-none">
                      <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors uppercase tracking-widest",
                          agentStatus === 'Live' ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400" :
                          agentStatus === 'Break' ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400" :
                          "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                        )}>
                          {agentStatus}
                        </span>
                        <div className={cn("w-2 h-2 rounded-full",
                          agentStatus === 'Live' ? "bg-emerald-500 animate-pulse" :
                          agentStatus === 'Break' ? "bg-amber-500" :
                          "bg-red-500"
                        )}></div>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setAgentStatus('Live')} className="text-xs font-bold uppercase tracking-widest text-emerald-600">Live</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAgentStatus('Break')} className="text-xs font-bold uppercase tracking-widest text-amber-600">Break</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAgentStatus('Logged Out')} className="text-xs font-bold uppercase tracking-widest text-red-600">Logged Out</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Popover>
                    <PopoverTrigger className="relative outline-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-full transition-colors border-none bg-transparent flex items-center justify-center">
                      <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 font-bold">
                          {unreadCount}
                        </span>
                      )}
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 rounded-2xl shadow-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden" align="end">
                      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-slate-500">Recent Updates</h4>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:opacity-80 transition-opacity cursor-pointer"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>
                      <ScrollArea className="max-h-[300px]">
                        {(!Array.isArray(notifications) || notifications.length === 0) ? (
                          <div className="px-4 py-8 text-center text-xs text-slate-400">No new notifications</div>
                        ) : (
                          notifications.map((notif: any) => {
                            const isRead = readNotifications.includes(String(notif.id));
                            return (
                              <div key={notif.id} className={cn("group/notif flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors pr-2", isRead && "opacity-50")}>
                                <Link to={`/bookings/edit/${notif.id}`} className="flex-1 flex flex-col p-4 pr-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">{notif.crmId}</span>
                                    <span className={cn(
                                      "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                      notif.status === 'authorized' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                      notif.status === 'charged' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" :
                                      notif.status === 'chargeback' ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" :
                                      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                    )}>
                                      {notif.status}
                                    </span>
                                  </div>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                                    {(Array.isArray(notif.passengerNames) ? notif.passengerNames.join(', ') : notif.passengerNames) || 'No Pax Name'} • {notif.airlineName}
                                  </span>
                                </Link>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleReadNotification(notif.id);
                                  }}
                                  className={cn(
                                    "p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shrink-0",
                                    isRead ? "text-emerald-500 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300"
                                  )}
                                  title={isRead ? "Mark as unread" : "Mark as read"}
                                >
                                  {isRead ? (
                                    <Check className="w-4 h-4 text-emerald-500 stroke-[3]" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  {showInstallBtn && (
                    <button 
                      onClick={handleInstallClick}
                      className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[10px] uppercase tracking-widest rounded-full transition duration-150 shadow-md shadow-blue-500/10 active:scale-[0.98]"
                      title="Install CRM as Standalone Desktop Software"
                    >
                      <Icon name="Download" className="w-3.5 h-3.5" />
                      <span>Install App</span>
                    </button>
                  )}
                  <Separator orientation="vertical" className="h-6 dark:bg-slate-700" />
                  <button 
                    onClick={() => setShowShortcutsHelp(true)}
                    className="text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-white transition-colors relative focus:outline-none p-2 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800"
                    title="Keyboard Shortcuts Guide (Press K or ?)"
                  >
                    <Icon name="Keyboard" className="w-5 h-5" />
                  </button>
                  <div className="text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-white transition-colors" onClick={() => setDarkMode(!darkMode)}>
                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </div>

                  {/* Profile Section Added to Navbar */}
                  <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs cursor-pointer hover:bg-blue-700 transition overflow-hidden" onClick={() => navigate('/profile')}>
                        {profile?.photoURL ? (
                          <img src={profile.photoURL} alt="User" className="w-full h-full object-cover" />
                        ) : (
                          (profile?.username || user?.email || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-col hidden md:flex min-w-[80px]">
                        <p className="text-[11px] text-slate-900 dark:text-white font-medium truncate max-w-[120px] cursor-pointer hover:underline" onClick={() => navigate('/profile')}>{profile.username || user.email}</p>
                        <p id="user-role-label" className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{isTenantAdmin ? 'User' : profile.role}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={logout}>
                        <LogOut className="w-4 h-4" />
                      </Button>
                  </div>
                </div>
              </header>

              {/* Page View */}
              <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 relative">
                {activeClient && isSystemAdmin && (
                   <div className="absolute top-4 right-8 z-50 flex items-center gap-3 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-[10px] uppercase font-black px-4 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 shadow-sm">
                      Tenant View: {activeClient.name}
                      <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-full"
                         onClick={() => {
                            localStorage.removeItem('tenantId');
                            window.location.href = '/';
                         }}
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </Button>
                   </div>
                )}
                <SafeFallback>
                  <React.Suspense fallback={
                    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
                      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Loading Module...</span>
                    </div>
                  }>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/index.html" element={<Navigate to="/" replace />} />
                      <Route path="/clients" element={isSystemAdmin ? <ClientsPage /> : <Navigate to="/" />} />
                      <Route path="/bookings/new" element={<CreateBooking profile={profile} />} />
                      <Route path="/bookings/edit/:id" element={<CreateBooking profile={profile} />} />
                      <Route path="/bookings" element={<AllBookings filter="all" profile={profile} />} />
                      <Route path="/calendar" element={<CalendarView />} />
                      <Route path="/drafts" element={<AllBookings filter="draft" profile={profile} />} />
                      <Route path="/authorized" element={<AllBookings filter="authorized" profile={profile} />} />
                      <Route path="/users" element={isManager ? <UsersPage profile={profile} /> : <Navigate to="/" />} />
                      <Route path="/analytics" element={<Dashboard />} />
                      <Route path="/bookings/:id" element={<AllBookings filter="all" />} />
                      <Route path="/logs" element={isAdmin ? <AdminRoute isAdmin={isAdmin}><ActivityLogs /></AdminRoute> : <Navigate to="/" />} />
                      <Route path="/templates" element={isAdmin ? <AdminRoute isAdmin={isAdmin}><EmailTemplatesPage /></AdminRoute> : <Navigate to="/" />} />
                      <Route path="/settings" element={<AdminRoute isAdmin={isSystemAdmin || profile?.role === 'Admin'}><Settings profile={profile} /></AdminRoute>} />
                      <Route path="/client-portal" element={profile?.role === 'Admin' ? <ClientAdminPage /> : <Navigate to="/" />} />
                      <Route path="/sent-emails" element={<SentEmailsInbox />} />
                      <Route path="/profile" element={<ProfilePage profile={profile} />} />
                      <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                  </React.Suspense>
                </SafeFallback>
              </div>
              
              {showShortcutsHelp && (
                <div 
                  id="shortcuts-help-modal"
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
                  onClick={() => setShowShortcutsHelp(false)}
                >
                  <div 
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="Keyboard" className="w-5 h-5 text-blue-500" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                          Keyboard Shortcuts
                        </h3>
                      </div>
                      <button 
                        onClick={() => setShowShortcutsHelp(false)}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                      {/* Section: Search & Actions */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          Global Commands
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Focus Search</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              /
                            </kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Dismiss / Escape</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              ESC
                            </kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Toggle this guide</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              ? or K
                            </kbd>
                          </div>
                        </div>
                      </div>

                      {/* Section: Navigation */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          Navigation Shortcuts
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Dashboard</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              H
                            </kbd>
                          </div>
                          {canCreateBookings && (
                            <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                              <span className="text-xs text-slate-600 dark:text-slate-300">Create Booking</span>
                              <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                                N
                              </kbd>
                            </div>
                          )}
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">All Bookings</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              B
                            </kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Drafts</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              D
                            </kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <span className="text-xs text-slate-600 dark:text-slate-300">Authorized Bookings</span>
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                              A
                            </kbd>
                          </div>
                        </div>
                      </div>

                      {/* Section: Administration Management */}
                      {(isManager || isAdmin) && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            Administration
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {isManager && (
                              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                                <span className="text-xs text-slate-600 dark:text-slate-300">Manage Users</span>
                                <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                                  U
                                </kbd>
                              </div>
                            )}
                            {isAdmin && (
                              <>
                                <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                                  <span className="text-xs text-slate-600 dark:text-slate-300">Settings</span>
                                  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                                    S
                                  </kbd>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950/20 rounded-lg border border-slate-100 dark:border-slate-800/60">
                                  <span className="text-xs text-slate-600 dark:text-slate-300">Email Templates</span>
                                  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 font-mono text-[10px] font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-sm">
                                    T
                                  </kbd>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-center">
                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Press <span className="font-bold">ESC</span> to dismiss this menu at any time.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Toaster />
            </main>
          </div>
        ) : <Navigate to={'/login' + window.location.search} />} />
      </Routes>
    </Suspense>
  );
}

function NavItem({ to, iconName, label }: { to: string, iconName: string, label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link to={to} className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-[11px] font-black uppercase tracking-widest leading-none border",
      isActive 
        ? "bg-blue-600/10 text-blue-500 border-blue-600/20" 
        : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
    )}>
      <div className={cn(
        "transition-colors",
        isActive ? "text-blue-500" : "text-slate-600 group-hover:text-slate-400"
      )}>
        <Icon name={iconName} className="w-4 h-4" />
      </div>
      {label}
    </Link>
  );
}
