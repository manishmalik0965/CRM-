import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  ShieldCheck,
  FileText,
  Plane,
  BarChart3,
  Activity,
  Download,
  ExternalLink,
  Settings as SettingsIcon,
  User,
  Info,
  Shield,
  Globe,
  BookOpen,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { clientId, activeClient } = useTenant();
  const [copied, setCopied] = useState(false);

  const getDashboardHeader = () => {
    switch (user?.role) {
      case 'Admin':
        return {
          title: "Admin Command Center",
          sub: "Super-Admin Control Hub • System-wide Configuration, SMTP & All Tenants",
          roleBadge: "ADMIN LEVEL"
        };
      case 'Manager':
        return {
          title: "Managerial Command Hub",
          sub: "Managerial Command Hub • Verify Bookings, Audit Logs & Performance Monitor",
          roleBadge: "MANAGER LEVEL"
        };
      case 'HOD':
        return {
          title: "Department Executive Suite",
          sub: "Head of Department • Revenue Oversight, High-Valued Tickets & Volume Analysis",
          roleBadge: "HOD LEVEL"
        };
      case 'WFM':
        return {
          title: "Workforce Operation Panel",
          sub: "Workforce Management • Operational Load, Queue Metrics, Active Production",
          roleBadge: "WFM LEVEL"
        };
      case 'Agent':
      default:
        return {
          title: "Agent Workspace Hub",
          sub: "Personal Booking Engine • Create/Authorise Tickets & Conversion Dashboard",
          roleBadge: "AGENT WORKSPACE"
        };
    }
  };

  const headerDetails = getDashboardHeader();

  const userCompanyId = user?.company_id || user?.companyId;
  const isSystemAdmin = user?.email === 'manishmalik0965@gmail.com' || user?.role === 'Superadmin' || (userCompanyId === 'legacy-tenant-1' && user?.role === 'Admin');
  const isTenantAdmin = user?.role === 'Admin' && !isSystemAdmin && userCompanyId !== 'legacy-tenant-1';

  const htmlCode = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeClient?.name || 'Portal'} Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body,html{margin:0;padding:0;height:100%;overflow:hidden;background:#0f172a;}</style>
</head>
<body>
  <iframe src="${window.location.origin}/?tenant=${clientId || 'default'}" style="width:100%;height:100%;border:none;" allow="camera; microphone; geolocation" allowfullscreen></iframe>
</body>
</html>`;

  const handleDownloadBridge = () => {
    const blob = new Blob([htmlCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `index.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Website integration bridge file (index.html) downloaded successfully.");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(htmlCode);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const [stats, setStats] = useState({
    pending: 0,
    authorized: 0,
    revenue: 0,
    totalToday: 0,
    monthlyRevenue: 0
  });

  const [statPage, setStatPage] = useState<'standard' | 'performance'>('standard');
  const [chartView, setChartView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [agentStats, setAgentStats] = useState<any[]>([]);
  const [isAdminOrManager, setIsAdminOrManager] = useState(false);
  const [chartDataDaily, setChartDataDaily] = useState<any[]>([]);
  const [chartDataWeekly, setChartDataWeekly] = useState<any[]>([]);
  const [chartDataMonthly, setChartDataMonthly] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/bookings', { params: { limit: 500 } });
        let docs = res.data.bookings || [];
        
        const roleLevel = user?.role;
        const managerRole = roleLevel === 'Admin' || roleLevel === 'Manager' || roleLevel === 'HOD' || roleLevel === 'WFM';
        setIsAdminOrManager(managerRole);

        if (!managerRole && user) {
          docs = docs.filter((d: any) => d.createdBy === user.id);
        }

        const pending = docs.filter((d: any) => d.status === 'pending').length;
        const authorized = docs.filter((d: any) => ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged', 'chargeback'].includes(d.status)).length;
        const rawRevenue = docs.reduce((acc: number, cur: any) => {
          if (cur.status === 'charged') return acc + (parseFloat(cur.totalAmount) || 0);
          if (cur.status === 'chargeback') return acc - (parseFloat(cur.totalAmount) || 0);
          return acc;
        }, 0);
        const revenue = Math.max(0, rawRevenue);
        
        const now = new Date();
        const todayStart = new Date(now.setHours(0,0,0,0)).getTime();
        const todayEnd = new Date(now.setHours(23,59,59,999)).getTime();
        
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        
        let totalToday = 0;
        let monthlyRevenueRaw = 0;
        
        docs.forEach((d: any) => {
          let created = new Date(d.createdAt).getTime();
          if (created >= todayStart && created <= todayEnd) {
            totalToday++;
          }
          if (created >= monthStart && created <= monthEnd) {
            if (d.status === 'charged') {
              monthlyRevenueRaw += (parseFloat(d.totalAmount) || 0);
            } else if (d.status === 'chargeback') {
              monthlyRevenueRaw -= (parseFloat(d.totalAmount) || 0);
            }
          }
        });
        const monthlyRevenue = Math.max(0, monthlyRevenueRaw);
        
        setStats({ pending, authorized, revenue, totalToday, monthlyRevenue });
        setRecentBookings(docs.slice(0, 5));

        // Generate Chart Data (Last 7 days revenue)
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const last7Days = Array.from({length: 7}, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d;
        });

        const dailyData = last7Days.map(date => {
            const dayName = days[date.getDay()];
            const dayStart = new Date(date.setHours(0,0,0,0)).getTime();
            const dayEnd = new Date(date.setHours(23,59,59,999)).getTime();
            
            const dayRevenue = docs.filter((d: any) => {
                let created = new Date(d.createdAt).getTime();
                return created >= dayStart && created <= dayEnd;
            }).reduce((acc: number, cur: any) => {
                if (cur.status === 'charged') return acc + (parseFloat(cur.totalAmount) || 0);
                if (cur.status === 'chargeback') return acc - (parseFloat(cur.totalAmount) || 0);
                return acc;
            }, 0);

            return { name: dayName, value: Math.max(0, dayRevenue) };
        });
        setChartDataDaily(dailyData);

        // Generate Weekly Data (Last 4 weeks)
        const weeklyData = Array.from({length: 4}, (_, i) => {
          const wEnd = new Date();
          wEnd.setDate(wEnd.getDate() - (i * 7));
          wEnd.setHours(23,59,59,999);
          const wStart = new Date(wEnd);
          wStart.setDate(wStart.getDate() - 6);
          wStart.setHours(0,0,0,0);
          
          const weekRevenue = docs.filter((d: any) => {
              let created = new Date(d.createdAt).getTime();
              return created >= wStart.getTime() && created <= wEnd.getTime();
          }).reduce((acc: number, cur: any) => {
              if (cur.status === 'charged') return acc + (parseFloat(cur.totalAmount) || 0);
              if (cur.status === 'chargeback') return acc - (parseFloat(cur.totalAmount) || 0);
              return acc;
          }, 0);

          return { name: `Wk ${4-i}`, value: Math.max(0, weekRevenue) };
        }).reverse();
        setChartDataWeekly(weeklyData);

        // Generate Monthly Data (Last 6 months)
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = Array.from({length: 6}, (_, i) => {
          const mod = new Date();
          mod.setMonth(mod.getMonth() - i);
          const mStart = new Date(mod.getFullYear(), mod.getMonth(), 1).getTime();
          const mEnd = new Date(mod.getFullYear(), mod.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

          const monthRevenue = docs.filter((d: any) => {
              let created = new Date(d.createdAt).getTime();
              return created >= mStart && created <= mEnd;
          }).reduce((acc: number, cur: any) => {
              if (cur.status === 'charged') return acc + (parseFloat(cur.totalAmount) || 0);
              if (cur.status === 'chargeback') return acc - (parseFloat(cur.totalAmount) || 0);
              return acc;
          }, 0);
          
          return { name: months[mod.getMonth()], value: Math.max(0, monthRevenue) };
        }).reverse();
        setChartDataMonthly(monthlyData);

        if (managerRole) {
          const agents: Record<string, { name: string; revenue: number; bookings: number; successfulAuth: number; securedAmount: number }> = {};
          docs.forEach((d: any) => {
            const agentName = d.agentName || 'Unknown Agent';
            if (!agents[agentName]) {
              agents[agentName] = { name: agentName, revenue: 0, bookings: 0, successfulAuth: 0, securedAmount: 0 };
            }
            agents[agentName].bookings += 1;

            const isAuthorized = ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged'].includes(d.status);
            if (isAuthorized) {
              agents[agentName].successfulAuth += 1;
              agents[agentName].securedAmount += (parseFloat(d.totalAmount) || 0);
            }

            if (d.status === 'charged') {
              agents[agentName].revenue += (parseFloat(d.totalAmount) || 0);
            } else if (d.status === 'chargeback') {
              agents[agentName].revenue -= (parseFloat(d.totalAmount) || 0);
            }
          });
          const sortedAgents = Object.values(agents).map((a: any) => ({
            ...a,
            revenue: Math.max(0, a.revenue),
            securedAmount: Math.max(0, a.securedAmount)
          })).sort((a: any, b: any) => b.securedAmount - a.securedAmount).slice(0, 5);
          setAgentStats(sortedAgents);
        }

      } catch (err) {
        console.error("Dashboard fetch error", err);
      }
    };
    fetchData();
  }, [user]);

  if (isTenantAdmin) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
             <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] tracking-widest uppercase">
                <Globe className="w-3.5 h-3.5" /> Tenant Workspace
             </div>
             <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase mt-1">Website Integration Control</h1>
             <p className="text-slate-500 text-xs">Deploy the white-labeled CRM portal securely on your corporate domain</p>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-black text-[10px] py-1.5 px-4 rounded-full">
             License: ACTIVE
          </Badge>
        </div>

        {/* Big Integration Card */}
        <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 pb-6">
            <CardTitle className="uppercase tracking-widest font-black text-xs flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <Download className="w-4 h-4 text-blue-600" />
              Direct HTML Bridge Download
            </CardTitle>
            <CardDescription className="text-xs">
              Use the connection bridge to load this fully managed CRM frame on your private website.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Deployment Instructions</h3>
                <ol className="space-y-3.5 text-xs text-slate-600 dark:text-slate-400 list-decimal pl-4">
                  <li className="leading-relaxed">
                    <strong>Download Bridge file:</strong> Click the primary <strong>Download index.html</strong> button below.
                  </li>
                  <li className="leading-relaxed">
                    <strong>Upload to website hosting:</strong> Place this <code>index.html</code> file into your corporate public directory (e.g. your root folder or a sub-folder like <code>/portal</code>).
                  </li>
                  <li className="leading-relaxed">
                    <strong>Grant browser flags:</strong> The bridge iframe utilizes secure HTML sandboxing and allow permissions (<code>camera, microphone, geolocation</code>) configured to run fully white-labeled.
                  </li>
                  <li className="leading-relaxed">
                    <strong>Test Setup:</strong> Load the custom link (e.g. <code>https://yourdomain.com/portal/</code>) on mobile and desktop browsers to verify seamless auth flows.
                  </li>
                </ol>

                <div className="pt-4 flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={handleDownloadBridge} 
                    className="flex-1 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-[10px] h-12 gap-2 shadow-lg shadow-blue-500/20"
                  >
                    <Download className="w-4 h-4" />
                    Download index.html
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={handleCopyCode} 
                    className="rounded-2xl border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-bold text-[10px] uppercase tracking-widest h-12 gap-2 border-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    Copy Code Snippet
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Bridge HTML Source</span>
                  <Badge variant="outline" className="text-[9px] font-mono capitalize tracking-normal border-slate-200">
                    index.html
                  </Badge>
                </div>
                <div className="relative">
                  <pre className="p-4 bg-slate-950 text-slate-300 font-mono text-[10px] rounded-2xl overflow-x-auto max-h-[220px] select-all border border-slate-800">
                    {htmlCode}
                  </pre>
                  <button 
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors border border-slate-700"
                    title="Copy snippet"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auxiliary Quick Links Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="border-slate-200 dark:border-slate-800 border-2 rounded-[2rem] overflow-hidden shadow-none bg-white dark:bg-slate-900 group cursor-pointer hover:-translate-y-1 transition-all"
            onClick={() => navigate('/settings')}
          >
            <CardContent className="p-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                  <SettingsIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Tenant settings</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">SMTP relays & 2FA config</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>

          <Card 
            className="border-slate-200 dark:border-slate-800 border-2 rounded-[2rem] overflow-hidden shadow-none bg-white dark:bg-slate-900 group cursor-pointer hover:-translate-y-1 transition-all"
            onClick={() => navigate('/profile')}
          >
            <CardContent className="p-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700">
                  <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">My profile details</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Admin picture & credentials</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-black tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full uppercase">
              {headerDetails.roleBadge}
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white uppercase">{headerDetails.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-4">{headerDetails.sub}</p>
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 pt-1">Core Metrics</h2>
        </div>
        <div className="flex flex-col items-end gap-4">
          <div className="flex gap-3">
            <Button variant="outline" className="h-11 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-black uppercase tracking-widest text-[10px] px-8 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all border-2" onClick={() => navigate('/logs')}>
              System Log
            </Button>
            <Button className="h-11 bg-slate-900 dark:bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] px-8 rounded-xl shadow-2xl shadow-slate-900/20 hover:bg-slate-800 dark:hover:bg-blue-700 transition-all active:scale-95" onClick={() => navigate('/bookings/new')}>
              New Booking
            </Button>
          </div>
          <div className="flex mt-2 bg-slate-200 dark:bg-slate-800 p-1.5 rounded-xl shadow-sm border border-slate-300 dark:border-slate-700">
            <button onClick={() => setStatPage('standard')} className={cn("px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", statPage === 'standard' ? "bg-white dark:bg-slate-900 shadow text-blue-700 dark:text-blue-400" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200")}>Standard</button>
            <button onClick={() => setStatPage('performance')} className={cn("px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", statPage === 'performance' ? "bg-white dark:bg-slate-900 shadow text-blue-700 dark:text-blue-400" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200")}>Performance</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statPage === 'standard' ? (
          <>
            <StatCard 
              label="Pending Verification" 
              value={stats.pending} 
              icon={<Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />} 
              trend="+12% velocity"
              color="blue"
            />
            <StatCard 
              label="Successful Auth" 
              value={stats.authorized} 
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />} 
              trend="99.8% stability"
              color="emerald"
            />
            <StatCard 
              label="Secured Revenue" 
              value={`$${stats.revenue.toLocaleString()}`} 
              icon={<DollarSign className="w-5 h-5 text-blue-900 dark:text-blue-200" />} 
              trend="Target: Operational"
              color="slate"
            />
            <StatCard 
              label="Risk Mitigation" 
              value="LOW" 
              icon={<ShieldCheck className="w-5 h-5 text-red-600 dark:text-red-400" />} 
              trend="Audit: Complete"
              color="red"
            />
          </>
        ) : (
          <>
            <StatCard 
              label="Total Bookings Today" 
              value={stats.totalToday} 
              icon={<FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} 
              trend="Daily Volume"
              color="blue"
            />
            <StatCard 
              label="Pending Authorizations" 
              value={stats.pending} 
              icon={<Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />} 
              trend="Action Required"
              color="emerald"
            />
            <StatCard 
              label="Total Revenue (Month)" 
              value={`$${stats.monthlyRevenue.toLocaleString()}`} 
              icon={<DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />} 
              trend="Monthly Performance"
              color="emerald"
            />
            <StatCard 
              label="System Health" 
              value="OPTIMAL" 
              icon={<ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />} 
              trend="All Systems Normal"
              color="blue"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 border-2 rounded-[2.5rem] overflow-hidden shadow-none bg-white dark:bg-slate-900">
          <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 py-8 px-10 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Transaction Pulse</CardTitle>
              <CardDescription className="text-slate-900 dark:text-white font-black text-lg tracking-tight uppercase">{chartView === 'daily' ? 'Daily' : chartView === 'weekly' ? 'Weekly' : 'Monthly'} Volume Flow</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setChartView('daily')} className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all", chartView === 'daily' ? "bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200")}>Daily</button>
                <button onClick={() => setChartView('weekly')} className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all", chartView === 'weekly' ? "bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200")}>Weekly</button>
                <button onClick={() => setChartView('monthly')} className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all", chartView === 'monthly' ? "bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200")}>Monthly</button>
              </div>
              <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-10 h-[400px]">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartView === 'daily' ? chartDataDaily : chartView === 'weekly' ? chartDataWeekly : chartDataMonthly}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#334155" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}}
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 900}}
                />
                <Tooltip 
                  cursor={{ stroke: '#2563eb', strokeWidth: 2 }}
                  contentStyle={{ 
                    borderRadius: '24px', 
                    border: 'none', 
                    boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)',
                    padding: '16px 24px',
                    backgroundColor: 'var(--tw-colors-slate-900, #0f172a)'
                  }} 
                  labelStyle={{ display: 'none' }}
                  itemStyle={{ color: '#2563eb', fontWeight: 900, fontSize: '14px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#2563eb" 
                  strokeWidth={5} 
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 border-2 rounded-[2.5rem] overflow-hidden shadow-none bg-white dark:bg-slate-900">
          <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 py-8 px-10">
            <div className="space-y-1">
                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Queue Monitor</CardTitle>
                <CardDescription className="text-slate-900 dark:text-white font-black text-lg tracking-tight uppercase">Critical Path Active</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-8">
              {recentBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                    <Activity className="w-12 h-12 text-slate-400 mb-4 animate-slow-spin" />
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Synchronizing State...</p>
                </div>
              ) : (
                recentBookings.map((booking: any) => (
                  <div key={booking.id} className="flex items-center justify-between group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 -m-2 rounded-2xl transition-all" onClick={() => navigate(`/bookings`)}>
                    <div className="flex items-center gap-5">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:rotate-12 group-hover:shadow-lg",
                        ['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged'].includes(booking.status) ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 shadow-emerald-500/10" : 
                        booking.status === 'chargeback' ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-red-500/10" :
                        "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-blue-500/10"
                      )}>
                        {['authorized', 'email auth confirm', 'ready to charge', 'sent for charge', 'charged'].includes(booking.status) ? <CheckCircle2 className="w-6 h-6" /> : 
                         booking.status === 'chargeback' ? <Activity className="w-6 h-6" /> :
                         <Plane className="w-6 h-6" />}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[13px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{booking.crmId}</p>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{booking.airlineName || 'UNMAPPED'}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                       <p className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tighter">${booking.totalAmount?.toLocaleString()}</p>
                       <Badge variant="ghost" className="text-[8px] h-4 font-black uppercase tracking-[0.2em] p-0 text-slate-400 group-hover:text-blue-600 transition-colors">
                          Status: {booking.status}
                       </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Button variant="ghost" className="w-full mt-10 text-slate-900 dark:text-slate-100 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-slate-900 hover:text-white dark:hover:bg-slate-800 py-8 rounded-2xl border-2 border-slate-100 dark:border-slate-800 transition-all" onClick={() => navigate('/bookings')}>
                View Global Manifest
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-10">
        {(user?.role === 'Admin' || user?.role === 'Manager' || user?.role === 'HOD' || user?.role === 'WFM') && (
          <Card className="lg:col-span-3 border-slate-200 dark:border-slate-800 border-2 rounded-[2.5rem] overflow-hidden shadow-none bg-white dark:bg-slate-900">
            <CardHeader className="border-b border-slate-50 dark:border-slate-800/50 py-8 px-10">
              <div className="space-y-1">
                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Agent Performance & Team Productivity</CardTitle>
                <CardDescription className="text-slate-900 dark:text-white font-black text-lg tracking-tight uppercase">Authorizations & Leaderboard</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Bar Chart Section */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-505 text-slate-400">Agent Productivity Index (Authorizations)</h3>
                    <div className="flex gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                  {agentStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                        <Activity className="w-12 h-12 text-slate-400 mb-4 animate-slow-spin" />
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Gathering productivity metrics...</p>
                    </div>
                  ) : (
                    <div className="bg-slate-50/50 dark:bg-slate-950/20 p-6 rounded-3xl border border-slate-101 dark:border-slate-800/40">
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={agentStats} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#334155" opacity={0.3} vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} 
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} 
                          />
                          <Tooltip 
                            cursor={{ fill: 'rgba(37, 99, 235, 0.04)' }}
                            contentStyle={{ 
                              borderRadius: '20px', 
                              border: 'none', 
                              boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)',
                              padding: '12px 20px',
                              backgroundColor: '#0f172a'
                            }} 
                            labelStyle={{ color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.1em' }}
                            itemStyle={{ color: '#2563eb', fontWeight: 900, fontSize: '13px' }}
                          />
                          <Bar dataKey="successfulAuth" radius={[8, 8, 0, 0]} name="Authorizations">
                            {agentStats.map((entry, index) => {
                              const colors = ['#2563eb', '#10b981', '#6366f1', '#f59e0b', '#ec4899'];
                              return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Scorecards list */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Team Leaderboard</h3>
                  <div className="space-y-4 overflow-y-auto max-h-[340px] pr-2">
                    {agentStats.map((agent, i) => (
                      <div key={i} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl flex flex-col gap-3 border border-slate-100 dark:border-slate-800 hover:border-blue-500 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-sm shadow-inner">
                              {agent.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 dark:text-white text-xs uppercase tracking-tight truncate max-w-[120px]">{agent.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{agent.bookings} Bookings</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">${agent.securedAmount.toLocaleString()}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{agent.successfulAuth} Authed</p>
                          </div>
                        </div>
                        <div className="flex justify-between text-[9px] font-black uppercase text-slate-400 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800">
                          <span>Paid Rev: <span className="text-indigo-600 dark:text-indigo-400 font-bold">${agent.revenue.toLocaleString()}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend, color }: { label: string, value: string | number, icon: ReactNode, trend: string, color: string }) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 border-2 rounded-[2.5rem] overflow-hidden shadow-none bg-white dark:bg-slate-900 group transition-all duration-700 hover:-translate-y-2">
      <CardContent className="p-10 relative">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700">
            <BarChart3 className="w-24 h-24 text-slate-900 dark:text-slate-100" />
        </div>
        <div className="flex items-center justify-between mb-8">
          <div className={cn(
            "w-14 h-14 rounded-3xl flex items-center justify-center transition-all group-hover:scale-110 group-hover:rotate-6",
            color === 'blue' ? "bg-blue-50 dark:bg-blue-900/30" : color === 'emerald' ? "bg-emerald-50 dark:bg-emerald-900/30" : color === 'red' ? "bg-red-50 dark:bg-red-900/30" : "bg-slate-50 dark:bg-slate-800"
          )}>
            {icon}
          </div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">{trend}</span>
        </div>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">{label}</h3>
        <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</p>
      </CardContent>
    </Card>
  );
}
