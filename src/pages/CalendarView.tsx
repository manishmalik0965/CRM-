import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plane, 
  Search, 
  ArrowRight, 
  Clock, 
  User, 
  PlusCircle, 
  AlertCircle, 
  X, 
  ExternalLink,
  Users,
  CheckCircle2,
  Info,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarView() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all bookings
  useEffect(() => {
    async function loadBookings() {
      setLoading(true);
      try {
        const res = await api.get('/bookings', { params: { limit: 1000 } });
        if (res.data && res.data.bookings) {
          setBookings(res.data.bookings);
        } else if (Array.isArray(res.data)) {
          setBookings(res.data);
        }
      } catch (err: any) {
        console.error('Failed to load bookings for calendar:', err);
        toast.error('Failed to load booking schedule');
      } finally {
        setLoading(false);
      }
    }
    loadBookings();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculate grid info
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday, 6 is Saturday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Create array for all 42 grid cells (6 rows x 7 columns)
  const calendarCells = useMemo(() => {
    const cells = [];
    
    // Previous month's trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, daysInPrevMonth - i);
      cells.push({
        date: prevDate,
        isCurrentMonth: false,
        dayNum: prevDate.getDate()
      });
    }

    // Current month's days
    for (let i = 1; i <= daysInMonth; i++) {
      const currDate = new Date(year, month, i);
      cells.push({
        date: currDate,
        isCurrentMonth: true,
        dayNum: i
      });
    }

    // Next month's leading days
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(year, month + 1, i);
      cells.push({
        date: nextDate,
        isCurrentMonth: false,
        dayNum: i
      });
    }

    return cells;
  }, [year, month, startDayOfWeek, daysInMonth, daysInPrevMonth]);

  // Map bookings to their departure dates (string format YYYY-MM-DD for fast lookup)
  const bookingsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    bookings.forEach(b => {
      if (!b.departureDate) return;
      
      // Parse the departureDate string (could be ISO or YYYY-MM-DD)
      const depDate = new Date(b.departureDate);
      if (isNaN(depDate.getTime())) return;
      
      const key = `${depDate.getFullYear()}-${String(depDate.getMonth() + 1).padStart(2, '0')}-${String(depDate.getDate()).padStart(2, '0')}`;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(b);
    });
    return map;
  }, [bookings]);

  // Filter bookings on calendar using search query (airline, passenger, crmId, PNR)
  const isBookingMatchingQuery = (b: any, query: string) => {
    if (!query) return true;
    const q = query.toLowerCase();
    
    const crmIdMatches = b.crmId?.toLowerCase().includes(q);
    const pnrMatches = b.pnr?.toLowerCase().includes(q);
    const airlineMatches = b.airlineName?.toLowerCase().includes(q);
    const originMatches = b.origin?.toLowerCase().includes(q);
    const destinationMatches = b.destination?.toLowerCase().includes(q);
    
    // Check passenger names
    let passengerMatches = false;
    if (b.passengerNames) {
      if (typeof b.passengerNames === 'string') {
        passengerMatches = b.passengerNames.toLowerCase().includes(q);
      } else if (Array.isArray(b.passengerNames)) {
        passengerMatches = b.passengerNames.some((p: any) => {
          const name = typeof p === 'string' ? p : p.name || '';
          return name.toLowerCase().includes(q);
        });
      }
    }
    
    return crmIdMatches || pnrMatches || airlineMatches || originMatches || destinationMatches || passengerMatches;
  };

  const getFilteredBookingsForDateStr = (dateStr: string) => {
    const list = bookingsByDate[dateStr] || [];
    if (!searchQuery) return list;
    return list.filter(b => isBookingMatchingQuery(b, searchQuery));
  };

  // Monthly stats
  const monthlyStats = useMemo(() => {
    let totalFlights = 0;
    let passengerCount = 0;
    let busiestDayStr = 'None';
    let maxFlightsOnDay = 0;
    
    Object.entries(bookingsByDate).forEach(([dateStr, listObj]) => {
      const list = listObj as any[];
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        totalFlights += list.length;
        
        list.forEach(b => {
          if (b.passengerNames) {
            try {
              const parsed = typeof b.passengerNames === 'string' ? JSON.parse(b.passengerNames) : b.passengerNames;
              passengerCount += Array.isArray(parsed) ? parsed.length : 1;
            } catch (e) {
              passengerCount += 1;
            }
          } else {
            passengerCount += 1;
          }
        });

        if (list.length > maxFlightsOnDay) {
          maxFlightsOnDay = list.length;
          busiestDayStr = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
        }
      }
    });

    return { totalFlights, passengerCount, busiestDayStr, maxFlightsOnDay };
  }, [bookingsByDate, year, month]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handleYearChange = (newYear: number) => {
    setCurrentDate(new Date(newYear, month, 1));
  };

  const handleMonthChange = (newMonth: number) => {
    setCurrentDate(new Date(year, newMonth, 1));
  };

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 30; // Past 3 decades
    const endYear = currentYear + 20;   // Next 2 decades
    const arr = [];
    for (let i = endYear; i >= startYear; i--) {
      arr.push(i);
    }
    return arr;
  }, []);

  // Selected date key for lookup
  const selectedDateStr = selectedDate 
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : '';

  // Get active selected bookings
  const selectedDateBookings = useMemo(() => {
    if (!selectedDateStr) return [];
    return bookingsByDate[selectedDateStr] || [];
  }, [selectedDateStr, bookingsByDate]);

  // helper to style statuses
  const getStatusStyle = (status: string) => {
    const s = status?.toLowerCase() || 'draft';
    if (s === 'completed') return 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60';
    if (['charged', 'ready to charge'].includes(s)) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
    if (['authorized', 'email auth confirm'].includes(s)) return 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60';
    if (s.includes('reminded') || s.includes('alert')) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
    if (s.includes('fail') || s.includes('chargeback') || s.includes('cancel')) return 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
    return 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  // Density category function
  const getDensityClass = (count: number) => {
    if (count === 0) return 'bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/50';
    if (count === 1) return 'bg-sky-50/40 dark:bg-sky-950/10 border-sky-100 dark:border-sky-900/20 hover:bg-sky-50 dark:hover:bg-sky-950/20';
    if (count <= 3) return 'bg-violet-50/40 dark:bg-violet-950/10 border-violet-150 dark:border-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-950/20';
    return 'bg-purple-100/30 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40 hover:bg-purple-100/40 dark:hover:bg-purple-950/30';
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 min-h-screen bg-slate-50/50 dark:bg-slate-950/20">
      
      {/* Header section with month controls and filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 dark:bg-indigo-400/10 rounded-xl text-indigo-600 dark:text-indigo-400">
            <CalendarIcon className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Monthly Flight Schedule</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">View upcoming flight density and agent assignments</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month Navigator */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700/60">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="flex items-center gap-1 px-2">
              <select 
                value={month} 
                onChange={(e) => handleMonthChange(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {m}
                  </option>
                ))}
              </select>

              <select 
                value={year} 
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm"
              onClick={handleNextMonth}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button 
            variant="outline" 
            size="sm"
            className="h-9 px-3 rounded-xl border-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            onClick={handleToday}
          >
            Today
          </Button>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search passengers, PNRs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid & Details panel split */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* Left Side: The 3/4 Calendar Grid */}
        <div className="xl:col-span-3 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            
            {/* Weekdays indicator row */}
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              {WEEKDAYS.map((day, idx) => (
                <div 
                  key={day} 
                  className={`py-3 text-center text-[10px] font-bold uppercase tracking-wider ${
                    idx === 0 || idx === 6 ? 'text-rose-500/90 dark:text-rose-400/90' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 42 grid cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
              {calendarCells.map((cell, idx) => {
                const dateStr = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
                const dateBookings = getFilteredBookingsForDateStr(dateStr);
                const hasBookings = dateBookings.length > 0;
                
                const isSelected = selectedDate && 
                  selectedDate.getDate() === cell.date.getDate() && 
                  selectedDate.getMonth() === cell.date.getMonth() && 
                  selectedDate.getFullYear() === cell.date.getFullYear();

                const isToday = () => {
                  const today = new Date();
                  return today.getDate() === cell.date.getDate() && 
                    today.getMonth() === cell.date.getMonth() && 
                    today.getFullYear() === cell.date.getFullYear();
                };

                return (
                  <div
                    key={`${dateStr}-${idx}`}
                    className={`min-h-[110px] p-2 flex flex-col justify-between transition-all cursor-pointer relative group ${
                      !cell.isCurrentMonth ? 'opacity-30 dark:opacity-20' : ''
                    } ${getDensityClass(dateBookings.length)} ${
                      isSelected ? 'ring-2 ring-indigo-500 ring-inset dark:ring-indigo-400 z-10' : ''
                    }`}
                    onClick={() => setSelectedDate(cell.date)}
                  >
                    {/* Header of Cell (Day number and today dot) */}
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${
                        isToday() 
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500 h-6 w-6 rounded-full flex items-center justify-center font-extrabold shadow-sm' 
                          : 'text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                      }`}>
                        {cell.dayNum}
                      </span>
                      
                      {hasBookings && (
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                          dateBookings.length >= 4 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' 
                            : dateBookings.length >= 2 
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' 
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        }`}>
                          {dateBookings.length} {dateBookings.length === 1 ? 'Flight' : 'Flights'}
                        </span>
                      )}
                    </div>

                    {/* Flights visual rendering */}
                    <div className="mt-2 flex-1 flex flex-col gap-1 justify-end overflow-hidden">
                      {dateBookings.slice(0, 3).map((b, bIdx) => (
                        <div 
                          key={b.id || bIdx} 
                          className="text-[10px] px-1.5 py-1 rounded-md border truncate font-medium flex items-center gap-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-700 shadow-sm hover:border-slate-300 dark:hover:border-slate-600"
                        >
                          <Plane className="w-2.5 h-2.5 flex-shrink-0 text-slate-400" />
                          <span className="font-extrabold text-[9px] text-slate-500 dark:text-slate-400">
                            {b.crmId?.toUpperCase() || 'CRM'}
                          </span>
                          <span className="truncate">
                            {b.airlineName || 'Carrier'}
                          </span>
                        </div>
                      ))}
                      {dateBookings.length > 3 && (
                        <div className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 pl-1.5">
                          + {dateBookings.length - 3} more flights...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Density guide legend */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 px-6 py-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-xs text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Density Level Indicator:</span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
                <span>Empty (0)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-sky-100 dark:bg-sky-950/40 border border-sky-200" />
                <span>Light (1)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-violet-100 dark:bg-violet-950/40 border border-violet-200" />
                <span>Moderate (2-3)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-200 dark:bg-purple-950/60 border border-purple-300" />
                <span>High (4+)</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <Info className="w-4 h-4" />
              <span>Hover over or click a day to examine detailed itineraries.</span>
            </div>
          </div>
        </div>

        {/* Right Side: Detailed selected day panel */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          
          {/* Selected day details */}
          <Card className="rounded-2xl border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Day Details</CardTitle>
                  <CardDescription className="text-base font-extrabold text-slate-800 dark:text-white mt-1">
                    {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : 'No Day Selected'}
                  </CardDescription>
                </div>
                {selectedDateBookings.length > 0 && (
                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 py-1 px-2.5 rounded-lg text-xs font-black uppercase">
                    {selectedDateBookings.length} DEP
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5 flex flex-col gap-4">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
                  Loading flight details...
                </div>
              ) : selectedDateBookings.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-full text-slate-300 dark:text-slate-600">
                    <Plane className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-widest">No Departures</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[180px] mx-auto">There are no client flights departing on this day.</p>
                  </div>
                  <Button 
                    size="sm"
                    className="mt-2 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider h-8"
                    onClick={() => navigate('/bookings/new')}
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                    Create Booking
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1">
                  {selectedDateBookings.map((b) => (
                    <div 
                      key={b.id}
                      className="group border border-slate-100 dark:border-slate-800 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-900/40 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all cursor-pointer relative"
                      onClick={() => navigate(`/bookings/edit/${b.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          ID: {b.crmId?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <Badge className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border rounded-md ${getStatusStyle(b.status)}`}>
                          {b.status}
                        </Badge>
                      </div>

                      <div className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                        {b.passengerName || b.passengerNames?.[0] || 'Passenger TBD'}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                        <Plane className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{b.airlineName || 'Carrier'}</span>
                        {b.pnr && (
                          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] rounded font-mono font-bold text-slate-600 dark:text-slate-300">
                            {b.pnr.toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2 border-t border-slate-50 dark:border-slate-800 pt-2">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{b.origin?.toUpperCase() || 'TBD'}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{b.destination?.toUpperCase() || 'TBD'}</span>
                        
                        {b.cabinClass && (
                          <span className="ml-auto text-[9px] font-bold uppercase text-slate-400">
                            {b.cabinClass}
                          </span>
                        )}
                      </div>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all text-indigo-500 dark:text-indigo-400">
                        <ExternalLink className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Month overview summary */}
          <Card className="rounded-2xl border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-5">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Month Density Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl flex flex-col gap-1">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase">Total Flights</div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-white flex items-baseline gap-1">
                    {monthlyStats.totalFlights}
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">DEP</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3.5 rounded-xl flex flex-col gap-1">
                  <div className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase">Passengers</div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-white flex items-baseline gap-1 animate-pulse">
                    {monthlyStats.passengerCount}
                    <Users className="w-3.5 h-3.5 text-slate-400 ml-1" />
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/40 dark:border-indigo-900/30 p-4 rounded-xl flex flex-col gap-1 text-xs">
                <span className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-wider">Busiest Departure Day</span>
                <span className="font-extrabold text-slate-800 dark:text-white mt-0.5">{monthlyStats.busiestDayStr}</span>
                {monthlyStats.maxFlightsOnDay > 0 && (
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                    ({monthlyStats.maxFlightsOnDay} flights scheduled on this date)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

    </div>
  );
}
