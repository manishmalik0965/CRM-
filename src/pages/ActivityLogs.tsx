// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTenant } from '@/lib/tenant';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, User as UserIcon, ShieldAlert, History, Info as InfoIcon } from 'lucide-react';
import {

  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from 'date-fns';


export default function ActivityLogs() {
  const { clientId } = useTenant();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/audit-logs', { params: { limit: 50 } });
        setLogs(res.data || []);
      } catch (error) {
        console.error("Fetch Error:", error);
      }
    };
    fetchData();
  }, [clientId]);

  const renderGranularTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let dateObj: Date;
    if (typeof timestamp === 'string' || typeof timestamp === 'number' || timestamp instanceof Date) {
      dateObj = new Date(timestamp);
    } else if (timestamp && timestamp.toDate && typeof timestamp.toDate === 'function') {
      dateObj = timestamp.toDate();
    } else {
      return 'Just now';
    }
    if (isNaN(dateObj.getTime())) return 'Just now';
    
    const pad = (n: number, size = 2) => n.toString().padStart(size, '0');
    const yyyy = dateObj.getFullYear();
    const mm = pad(dateObj.getMonth() + 1);
    const dd = pad(dateObj.getDate());
    const hh = pad(dateObj.getHours());
    const min = pad(dateObj.getMinutes());
    const ss = pad(dateObj.getSeconds());
    const ms = pad(dateObj.getMilliseconds(), 3);
    
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}.${ms}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight">Security & Audit Logs</h2>
        <p className="text-muted-foreground">Monitor system activity and internal transactions</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
          <Card className="border-none shadow-sm bg-blue-500/5 text-blue-600">
             <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase font-black">Logged Events</CardTitle>
                <Activity className="w-4 h-4" />
             </CardHeader>
             <CardContent><p className="text-2xl font-bold">{logs.length}</p></CardContent>
          </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
           <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <CardTitle>System Timeline</CardTitle>
           </div>
           <CardDescription>Real-time audit trail of all booking modifications</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User & Host IP</TableHead>
                <TableHead>Action performed</TableHead>
                <TableHead>Target ID</TableHead>
                <TableHead className="text-right">Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(logs) && logs.map((log) => (
                <TableRow key={log.id} className="text-sm transition-all hover:bg-slate-100/50 dark:hover:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 even:bg-slate-50/50 dark:even:bg-slate-800/50">
                  <TableCell className="text-muted-foreground whitespace-nowrap py-4">
                    <p className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                      {log.timestamp ? (
                        typeof log.timestamp === 'string' || typeof log.timestamp === 'number' || log.timestamp instanceof Date ? 
                          formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : 
                          (log.timestamp.toDate ? formatDistanceToNow(log.timestamp.toDate(), { addSuffix: true }) : 'Just now')
                      ) : 'Just now'}
                    </p>
                    <p className="text-[10px] font-mono tracking-tight text-slate-400 dark:text-slate-500 mt-0.5">
                      {renderGranularTimestamp(log.timestamp)}
                    </p>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <UserIcon className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium text-xs text-slate-700 dark:text-slate-300">{log.userEmail || 'Internal Staff'}</span>
                        </div>
                        <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-200/40 dark:border-slate-800/40 w-max">
                          {log.ipAddress || 'Unknown IP'}
                        </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium truncate max-w-[400px] py-4">
                    <p className="font-bold">{log.action}</p>
                    <p className="text-[10px] text-muted-foreground">{log.details}</p>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground py-4">{log.bookingId || 'SYSTEM'}</TableCell>
                  <TableCell className="text-right py-4">
                    <Popover>
                      <PopoverTrigger className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-muted hover:text-accent-foreground h-8 w-8 rounded-lg outline-none cursor-pointer border-none bg-transparent">
                           <Badge variant="outline" className="text-[10px] uppercase font-black tracking-widest border-primary/20 text-primary">Info</Badge>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-6 rounded-2xl shadow-2xl border-slate-100">
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 border-b pb-2">
                              <InfoIcon className="w-4 h-4 text-primary" />
                              <h4 className="text-sm font-black uppercase tracking-widest text-slate-900">Event Detail</h4>
                           </div>
                           <div className="space-y-3">
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</p>
                                 <p className="text-xs font-bold text-slate-700">{log.action}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User Trace</p>
                                 <p className="text-xs font-bold text-slate-700">{log.userEmail || 'Internal System'}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source Host (IP Address)</p>
                                 <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded border border-blue-100/30 inline-block">{log.ipAddress || 'Unknown IP'}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Granular Event Time</p>
                                 <p className="text-xs font-mono font-semibold text-slate-700">{renderGranularTimestamp(log.timestamp)}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Description</p>
                                 <p className="text-xs font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{log.details}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Reference</p>
                                 <p className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded inline-block">{log.bookingId || 'GLOBAL'}</p>
                              </div>
                           </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
