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
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LazyIcon = React.lazy(async () => {
  const lucide = await import('lucide-react');
  return {
    default: ({ name, ...props }: { name: keyof typeof lucide, [key: string]: any }) => {
      const Icon = lucide[name] as React.ElementType;
      return Icon ? <Icon {...props} /> : null;
    }
  };
});
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
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const CreateBooking = React.lazy(() => import('./pages/CreateBooking'));
const AllBookings = React.lazy(() => import('./pages/AllBookings'));
const AuthorizationPage = React.lazy(() => import('./pages/AuthorizationPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const ActivityLogs = React.lazy(() => import('./pages/ActivityLogs'));
const Settings = React.lazy(() => import('./pages/Settings'));
const EmailTemplatesPage = React.lazy(() => import('./pages/EmailTemplatesPage'));
const UsersPage = React.lazy(() => import('./pages/UsersPage'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));

import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export type UserRole = 'Admin' | 'Manager' | 'Agent' | 'HOD' | 'WFM';

interface UserProfile {
  uid: string;
  email: string | null;
  role: UserRole;
  username?: string;
  clientId?: string;
}

export default function AppWrapper() {
  const [clientId, setClientId] = useState<string | null>(localStorage.getItem('tenantId') || null);
  const [activeClient, setActiveClient] = useState<ClientTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    async function determineTenant() {
      const hostname = window.location.hostname;
      const isSystemDomain = hostname.includes('localhost') || hostname.includes('run.app') || hostname.includes('itconflict.xyz');
      
      const searchParams = new URLSearchParams(window.location.search);
      const urlTenant = searchParams.get('tenant');

      if (!isSystemDomain || urlTenant) {
        try {
          const res = await api.get('/clients/tenant', { 
            params: { domain: hostname, tenantId: urlTenant }
          });
          
          if (res.data) {
             setActiveClient(res.data);
             setClientId(res.data.id);
             localStorage.setItem('tenantId', res.data.id);
             setIsSuspended(res.data.isActive === false);
          } else {
             // Fallback to default instead of suspending
             setActiveClient({ id: 'legacy-tenant-1', name: 'Default Company', domain: hostname, isActive: true });
             setClientId('legacy-tenant-1');
             localStorage.setItem('tenantId', 'legacy-tenant-1');
          }
        } catch (e) {
          console.error("Failed to load tenant", e);
          // Fallback to default on error so the app loads
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
      };
      
      fetchData();

      const handleSettingsUpdate = async () => {
        try {
          const settingsRes = await api.get('/settings');
          setSettings(settingsRes.data);
        } catch (e) {}
      };
      window.addEventListener('settingsUpdated', handleSettingsUpdate);
      
      // Basic polling for notifications
      const notifInterval = setInterval(async () => {
         try {
           const res = await api.get('/bookings/recent-updates');
           setNotifications(Array.isArray(res.data) ? res.data : []);
         } catch(e) {
           setNotifications([]);
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

  const isSystemAdmin = user?.email === 'manishmalik0965@gmail.com' || profile?.role === 'Superadmin' || user?.role === 'Superadmin';
  const isTenantAdmin = profile?.role === 'Admin' && !isSystemAdmin;
  const isAdmin = (profile?.role === 'Admin' || profile?.role === 'Superadmin' || isSystemAdmin) && !isTenantAdmin;
  const isManager = (profile?.role === 'Admin' || profile?.role === 'Manager' || profile?.role === 'Superadmin' || isSystemAdmin) && !isTenantAdmin;
  const isAgent = !!profile && !isTenantAdmin; // Everyone with a profile is at least an agent

  // Strict role boundaries
  const canDeleteBookings = isAdmin;
  const canManageUsers = isAdmin;
  const canEditBookings = isManager; // Manager and Admin
  const canCreateBookings = isAgent; // Everyone
  const canSendEmails = isAgent; // Everyone

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">Loading Blackgrass CRM...</div>;

  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white uppercase tracking-widest font-black text-xs">Loading Cloud Space...</div>}>
      <Routes>
        {/* Public Authorization Route */}
        <Route path="/authorize/:bookingId" element={<AuthorizationPage />} />
        
        {/* Login Route */}
        <Route path="/login" element={user && sessionStorage.getItem('mfa_verified') === 'true' ? <Navigate to={'/' + window.location.search} /> : <LoginPage />} />

        {/* Protected CRM Routes */}
        <Route path="/*" element={user && profile && (
            sessionStorage.getItem('mfa_verified') === 'true' || 
            (!settings?.globalTwoFactorEnabled && ((profile.role !== 'Admin' && profile.role !== 'Manager') || !settings?.twoFactorEnabled))
        ) ? (
          <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans transition-colors relative">
            
            {/* Mobile Header */}
            <div className="lg:hidden absolute top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-20">
              <div className="flex items-center gap-3">
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
                <h1 className="text-slate-900 dark:text-white font-bold tracking-tight text-lg">{settings?.organizationName || 'BLACKGRASS CRM'}</h1>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
              <div 
                className="lg:hidden fixed inset-0 bg-black/50 z-30"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar */}
            <aside className={cn(
              "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
              <div className="p-6 hidden lg:flex items-center gap-3">
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
                <h1 className="text-white font-bold tracking-tight text-lg">{settings?.organizationName || 'BLACKGRASS CRM'}</h1>
              </div>
              
              {/* Mobile Sidebar Header */}
              <div className="p-6 lg:hidden flex flex-col pt-16">
                 {/* Spacing for mobile top bar */}
              </div>

              <ScrollArea className="flex-1 px-4" id="sidebar-scroll-area">
                <nav className="space-y-1" id="sidebar-navigation">
                  {isTenantAdmin ? (
                    <>
                      <div id="tenant-workspace-header" className="pt-2 pb-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workspace</div>
                      <NavItem to="/" iconName="LayoutDashboard" label="Dashboard" />
                      <NavItem to="/settings" iconName="Settings" label="Settings" />
                      <NavItem to="/profile" iconName="User" label="Profile" />
                    </>
                  ) : (
                    <>
                      <NavItem to="/" iconName="LayoutDashboard" label="Dashboard" />
                      {profile?.role === 'Agent' && <NavItem to="/bookings/new" iconName="PlusCircle" label="Create Booking" />}
                      <NavItem to="/bookings" iconName="FileEdit" label="All Bookings" />
                      <NavItem to="/drafts" iconName="FileEdit" label="Draft Bookings" />
                      <NavItem to="/authorized" iconName="CheckCircle2" label="Authorized" />
                      
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
                      {isSystemAdmin && (
                        <NavItem to="/clients" iconName="Building" label="Clients" />
                      )}
                    </>
                  )}
                </nav>
              </ScrollArea>
              <div className="p-4 border-t border-slate-800 flex flex-col gap-4">
                <div className="text-center pb-2">
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
                      type="text" 
                      placeholder="Search CRM ID, Passenger, or Email..." 
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
                  <Separator orientation="vertical" className="h-6 dark:bg-slate-700" />
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
              <div className="flex-1 overflow-auto p-8 relative">
                {activeClient && isSystemAdmin && (
                   <div className="absolute top-4 right-8 z-50 flex items-center gap-3 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-[10px] uppercase font-black px-4 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 shadow-sm">
                      Tenant View: {activeClient.name}
                      <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-100 rounded-full"
                         onClick={() => {
                            localStorage.removeItem('tenantId');
                            window.location.href = '/clients';
                         }}
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </Button>
                   </div>
                )}
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/clients" element={isSystemAdmin ? <ClientsPage /> : <Navigate to="/" />} />
                  <Route path="/bookings/new" element={isTenantAdmin ? <Navigate to="/settings" /> : <CreateBooking profile={profile} />} />
                  <Route path="/bookings/edit/:id" element={isTenantAdmin ? <Navigate to="/settings" /> : <CreateBooking profile={profile} />} />
                  <Route path="/bookings" element={isTenantAdmin ? <Navigate to="/settings" /> : <AllBookings filter="all" profile={profile} />} />
                  <Route path="/drafts" element={isTenantAdmin ? <Navigate to="/settings" /> : <AllBookings filter="draft" profile={profile} />} />
                  <Route path="/authorized" element={isTenantAdmin ? <Navigate to="/settings" /> : <AllBookings filter="authorized" profile={profile} />} />
                  <Route path="/users" element={!isTenantAdmin && isManager ? <UsersPage profile={profile} /> : <Navigate to="/" />} />
                  <Route path="/analytics" element={isTenantAdmin ? <Navigate to="/settings" /> : <Dashboard />} />
                  <Route path="/bookings/:id" element={isTenantAdmin ? <Navigate to="/settings" /> : <AllBookings filter="all" />} />
                  <Route path="/logs" element={!isTenantAdmin && isAdmin ? <AdminRoute isAdmin={isAdmin}><ActivityLogs /></AdminRoute> : <Navigate to="/" />} />
                  <Route path="/templates" element={!isTenantAdmin && isAdmin ? <AdminRoute isAdmin={isAdmin}><EmailTemplatesPage /></AdminRoute> : <Navigate to="/" />} />
                  <Route path="/settings" element={<AdminRoute isAdmin={isSystemAdmin || profile?.role === 'Admin'}><Settings profile={profile} /></AdminRoute>} />
                  <Route path="/profile" element={<ProfilePage profile={profile} />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>
              
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
        <Suspense fallback={<div className="w-4 h-4 bg-slate-800/50 rounded animate-pulse" />}>
          <LazyIcon name={iconName} className="w-4 h-4" />
        </Suspense>
      </div>
      {label}
    </Link>
  );
}
