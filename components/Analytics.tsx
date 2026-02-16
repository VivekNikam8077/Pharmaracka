import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

import ReactDOM from 'react-dom';
import { DaySummary, UserRole, User } from '../types';
import {
  TrendingUp,
  Clock,
  Activity,
  BarChart3,
  LineChart as LineChartIcon,
  ChevronRight,
  CalendarDays,
  Users as UsersIcon,
  Coffee,
  Palmtree,
  Download,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Database,
} from 'lucide-react';

interface AnalyticsProps {
  data: DaySummary[];
  setData: React.Dispatch<React.SetStateAction<DaySummary[]>>;
  user: User;
  users: User[];
  serverOffsetMs?: number;
}

const CHART_W = 1000;
const CHART_H = 200;
const PAD_L = 60;
const PAD_R = 40;
const PAD_T = 20;
const PAD_B = 40;

const METRIC_CONFIG: Record<string, { color: string; gradientId: string; key: keyof DaySummary; icon: React.ReactNode; desc: string }> = {
  'Work':      { color: '#10b981', gradientId: 'grad-work',     key: 'productiveMinutes',  icon: <Activity className="w-5 h-5" strokeWidth={2.5} />,  desc: 'Productive Time' },
  'Breaks':    { color: '#f43f5e', gradientId: 'grad-breaks',   key: 'totalMinutes',       icon: <Clock className="w-5 h-5" strokeWidth={2.5} />,     desc: 'Break Time' },
  'Feedback':  { color: '#0ea5e9', gradientId: 'grad-feedback', key: 'feedbackMinutes',    icon: <TrendingUp className="w-5 h-5" strokeWidth={2.5} />, desc: 'Feedback Sessions' },
  'Cross-Util':{ color: '#6366f1', gradientId: 'grad-cross',    key: 'crossUtilMinutes',   icon: <BarChart3 className="w-5 h-5" strokeWidth={2.5} />, desc: 'Collaboration' },
};

const formatHnM = (totalMinutes: number): string => {
  if (isNaN(totalMinutes) || totalMinutes <= 0) return '0h 0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
};

const toDateStr = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const isHoliday = (summary: DaySummary): boolean => {
  if (summary.isLeave) return true;
  
  const totalActivity = (summary.productiveMinutes || 0) + 
                        (summary.lunchMinutes || 0) + 
                        (summary.snacksMinutes || 0) + 
                        (summary.refreshmentMinutes || 0) + 
                        (summary.feedbackMinutes || 0) + 
                        (summary.crossUtilMinutes || 0);
  
  if (totalActivity > 0) return false;
  
  const login = (summary.loginTime || '').trim();
  const logout = (summary.logoutTime || '').trim();
  
  if (!login || !logout) return true;
  if (login === '00:00' && logout === '00:00') return true;
  if (login === '00:00:00' && logout === '00:00:00') return true;
  
  return false;
};

const buildMonthDays = (monthDate: Date): (Date | null)[] => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

interface CalendarPopupProps {
  month: Date;
  onMonthChange: (d: Date) => void;
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

const CalendarPopup: React.FC<CalendarPopupProps> = ({ month, onMonthChange, value, onSelect, onClose, triggerRef }) => {
  const cells = buildMonthDays(month);
  const valueDate = value ? new Date(value + 'T00:00:00') : null;
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
  }, [triggerRef]);

  if (!position) return null;

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div 
        className="fixed z-[9999] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200 w-80"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <ChevronRight className="w-4 h-4 rotate-180" strokeWidth={2.5} />
          </button>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {month.toLocaleString('default', { month: 'long' })} {month.getFullYear()}
          </span>
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2 text-center">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 text-sm">
          {cells.map((c, idx) =>
            c ? (
              <button key={idx} onClick={() => { onSelect(toDateStr(c)); onClose(); }}
                className={`w-full aspect-square flex items-center justify-center rounded-lg transition-all duration-150 ${
                  valueDate && isSameDay(c, valueDate) 
                    ? 'bg-indigo-600 text-white font-semibold shadow-lg' 
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}>
                {c.getDate()}
              </button>
            ) : <div key={idx} />
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

interface ChartPoint { x: number; y: number; value: number; date: string; idx: number; }

interface ChartProps {
  points: ChartPoint[];
  color: string;
  gradientId: string;
  maxVal: number;
}

const Chart: React.FC<ChartProps> = ({ points, color, gradientId, maxVal }) => {
  const [hovered, setHovered] = useState<ChartPoint | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-300 dark:text-slate-700">
        <div className="text-center">
          <LineChartIcon className="w-12 h-12 mx-auto mb-3 opacity-20" strokeWidth={2} />
          <p className="text-sm font-medium">No data in selected range</p>
        </div>
      </div>
    );
  }

  const linePath = points.length < 2
    ? ''
    : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const areaPath = points.length < 2
    ? ''
    : `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(CHART_H - PAD_B).toFixed(1)} L ${points[0].x.toFixed(1)} ${(CHART_H - PAD_B).toFixed(1)} Z`;

  const yTicks = [0, 1, 2, 3].map(i => {
    const frac = i / 3;
    const yVal = Math.round(frac * maxVal);
    const yPos = (CHART_H - PAD_B) - frac * (CHART_H - PAD_T - PAD_B);
    return { yPos, label: formatHnM(yVal) };
  });

  return (
    <div className="relative w-full" style={{ height: 280 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={t.yPos} x2={CHART_W - PAD_R} y2={t.yPos}
              stroke="#cbd5e1" strokeWidth="0.8" strokeOpacity="0.3"
              strokeDasharray={i === 0 ? '0' : '4 4'}
            />
            <text x={PAD_L - 8} y={t.yPos + 4} textAnchor="end"
              className="fill-slate-400 dark:fill-slate-600"
              style={{ fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
              {i === 0 ? '' : t.label}
            </text>
          </g>
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((p, i) => {
          const isH = hovered?.idx === i;
          return (
            <g key={i}>
              {isH && (
                <line
                  x1={p.x} y1={PAD_T} x2={p.x} y2={CHART_H - PAD_B}
                  stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="4 3"
                />
              )}
              <text
                x={p.x} y={CHART_H - 6}
                textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}
                className={isH ? 'fill-indigo-500 dark:fill-indigo-400' : 'fill-slate-300 dark:fill-slate-600'}
              >
                {p.date.slice(8)}
              </text>
              <circle
                cx={p.x} cy={p.y}
                r={isH ? 6 : 4}
                fill="white"
                stroke={color}
                strokeWidth="3"
                style={{ transition: 'r 0.15s ease' }}
              />
              <rect
                x={p.x - 20} y={PAD_T} width={40} height={CHART_H - PAD_T - PAD_B}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}
      </svg>

      {hovered && (() => {
        const xPct = (hovered.x / CHART_W) * 100;
        const yPct = (hovered.y / CHART_H) * 100;
        return (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: 'translate(-50%, -120%)',
              transition: 'left 0.1s ease, top 0.1s ease',
            }}
          >
            <div className="bg-slate-900/95 dark:bg-slate-700/95 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/10">
              <span className="text-xs font-medium opacity-70 block mb-1">{hovered.date}</span>
              <span className="text-xl font-semibold tabular-nums">{formatHnM(hovered.value)}</span>
            </div>
            <div className="flex justify-center">
              <div className="w-2 h-2 bg-slate-900/95 dark:bg-slate-700/95 rotate-45 -mt-1" />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const Analytics: React.FC<AnalyticsProps> = ({ data, setData, user, users, serverOffsetMs = 0 }) => {
  const [range, setRange] = useState<'7D' | '30D' | 'All' | 'Custom'>('7D');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [activeMetric, setActiveMetric] = useState<string>('Work');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showStartCal, setShowStartCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);
  const [startMonth, setStartMonth] = useState(new Date());
  const [endMonth, setEndMonth] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;

  useEffect(() => {
    if (!isPrivileged) setSelectedUserId(user.id);
  }, [isPrivileged, user.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') { 
        setIsUserMenuOpen(false); 
        setShowStartCal(false); 
        setShowEndCal(false); 
      } 
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ✅ FETCH DATA FROM DATABASE API
  const fetchAnalyticsData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const serverIp = localStorage.getItem('officely_server_ip') || 'https://server2-e3p9.onrender.com';
      
      // Build query parameters
      const params = new URLSearchParams();
      
      if (isPrivileged && selectedUserId !== 'all') {
        params.append('userId', selectedUserId);
      } else if (!isPrivileged) {
        params.append('userId', user.id);
      }
      
      if (range === 'Custom' && startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      } else if (range !== 'All') {
        const days = range === '7D' ? 7 : 30;
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        params.append('startDate', toDateStr(start));
        params.append('endDate', toDateStr(end));
      }
      
      console.log('[Analytics] 📊 Fetching data from database...', params.toString());
      
      const response = await fetch(`${serverIp}/api/Office/analytics?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }
      
      console.log('[Analytics] ✅ Received data:', result.count, 'records');
      
      // Transform database data to match DaySummary type
      const transformedData: DaySummary[] = result.data.map((row: any) => ({
        userId: row.userid,
        date: row.date,
        loginTime: row.logintime || '00:00:00',
        logoutTime: row.logouttime || '00:00:00',
        productiveMinutes: row.productiveminutes || 0,
        lunchMinutes: row.lunchminutes || 0,
        snacksMinutes: row.snacksminutes || 0,
        refreshmentMinutes: row.refreshmentminutes || 0,
        feedbackMinutes: row.feedbackminutes || 0,
        crossUtilMinutes: row.crossutilminutes || 0,
        totalMinutes: row.totalminutes || 0,
        isLeave: row.isleave || false,
      }));
      
      setData(transformedData);
      setLastRefresh(new Date());
      
    } catch (err: any) {
      console.error('[Analytics] ❌ Fetch error:', err);
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  }, [range, startDate, endDate, selectedUserId, isPrivileged, user.id, setData]);

  // ✅ Auto-fetch on mount and when filters change
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // ✅ Manual refresh
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await fetchAnalyticsData();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [isRefreshing, fetchAnalyticsData]);

  const getUserName = (id: string) => {
    const u = users.find(u => u.id === id || u.email === id || u.name === id);
    return u?.name || id;
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.userId.toLowerCase().includes(q) || d.date.includes(q)
      );
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, search]);

  const { chartPoints, maxVal } = useMemo(() => {
    const getValue = (d: DaySummary): number => {
      if (activeMetric === 'Breaks') return (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
      const cfg = METRIC_CONFIG[activeMetric];
      return (d[cfg.key] as number) || 0;
    };

    const points = filteredData.slice(-15);
    if (points.length === 0) return { chartPoints: [], maxVal: 60 };

    const max = Math.max(...points.map(d => getValue(d)), 60);
    const maxRounded = Math.ceil(max / 30) * 30;

    const drawW = CHART_W - PAD_L - PAD_R;
    const drawH = CHART_H - PAD_T - PAD_B;
    const n = points.length;

    const chartPts: ChartPoint[] = points.map((d, i) => {
      const val = getValue(d);
      const x = n === 1 ? PAD_L + drawW / 2 : PAD_L + (i / (n - 1)) * drawW;
      const y = (CHART_H - PAD_B) - (val / maxRounded) * drawH;
      return { x, y, value: val, date: d.date, idx: i };
    });

    return { chartPoints: chartPts, maxVal: maxRounded };
  }, [filteredData, activeMetric]);

  const exportActivityReport = () => {
    if (filteredData.length === 0) return alert('No data to export.');
    const headers = ['Operator','Shift Date','Login','Logout','Productive (H:M)','Lunch (H:M)','Snacks (H:M)','Ref (H:M)','Feedback (H:M)','Cross-Util (H:M)','Total (H:M)'];
    const rows = filteredData.map(d => {
      const holiday = isHoliday(d);
      const login = holiday ? 'Holiday' : (d.loginTime || '—');
      const logout = holiday ? 'Holiday' : (d.logoutTime || '—');
      return [
        getUserName(d.userId), 
        d.date, 
        login, 
        logout, 
        formatHnM(d.productiveMinutes), 
        formatHnM(d.lunchMinutes), 
        formatHnM(d.snacksMinutes), 
        formatHnM(d.refreshmentMinutes), 
        formatHnM(d.feedbackMinutes), 
        formatHnM(d.crossUtilMinutes), 
        formatHnM(d.totalMinutes)
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { 
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), 
      download: `Activity_${selectedUserId}_${range}_${Date.now()}.csv` 
    });
    a.click();
  };

  const exportBreakReport = () => {
    if (filteredData.length === 0) return alert('No data to export.');
    const headers = ['Operator','Date','Lunch (Mins)','Snacks (Mins)','Ref (Mins)','Productive (H:M)','Total Break (H:M)'];
    const rows = filteredData.map(d => {
      const total = (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
      return [
        getUserName(d.userId), 
        d.date, 
        d.lunchMinutes, 
        d.snacksMinutes, 
        d.refreshmentMinutes, 
        formatHnM(d.productiveMinutes), 
        formatHnM(total)
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { 
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), 
      download: `Breaks_${selectedUserId}_${range}_${Date.now()}.csv` 
    });
    a.click();
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <BarChart3 className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Analytics</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Live data from database • Timing tracked by Dashboard
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all duration-200 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${(isRefreshing || isLoading) ? 'animate-spin' : ''}`} strokeWidth={2.5} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          {isPrivileged && (
            <>
              <button 
                onClick={exportBreakReport} 
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-amber-500/25 transition-all duration-200 disabled:cursor-not-allowed"
              >
                <Coffee className="w-4 h-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">Breaks</span>
              </button>
              <button 
                onClick={exportActivityReport} 
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:bg-slate-400 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-black/20 transition-all duration-200 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Data Source Banner */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
              Real-time Database Analytics
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              All timing data is calculated by each user's Dashboard and auto-saved every 5 minutes. This page displays live data from the database.
              {lastRefresh && <span className="ml-2">Last updated: {lastRefresh.toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-12">
          <div className="flex flex-col items-center justify-center">
            <RefreshCw className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" strokeWidth={2} />
            <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Loading Analytics...</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Fetching data from database</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900 dark:text-red-100 mb-1">Error Loading Data</p>
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
              <button 
                onClick={handleRefresh}
                className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Data Display */}
      {!isLoading && !error && (
        <>
          {/* Filters */}
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Range Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Time Range</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['7D', '30D', 'All', 'Custom'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                        range === r
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range */}
              {range === 'Custom' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Start Date</label>
                    <button
                      ref={startButtonRef}
                      onClick={() => setShowStartCal(true)}
                      className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                      {startDate || 'Select date'}
                    </button>
                    {showStartCal && (
                      <CalendarPopup
                        month={startMonth}
                        onMonthChange={setStartMonth}
                        value={startDate}
                        onSelect={setStartDate}
                        onClose={() => setShowStartCal(false)}
                        triggerRef={startButtonRef}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">End Date</label>
                    <button
                      ref={endButtonRef}
                      onClick={() => setShowEndCal(true)}
                      className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                      {endDate || 'Select date'}
                    </button>
                    {showEndCal && (
                      <CalendarPopup
                        month={endMonth}
                        onMonthChange={setEndMonth}
                        value={endDate}
                        onSelect={setEndDate}
                        onClose={() => setShowEndCal(false)}
                        triggerRef={endButtonRef}
                      />
                    )}
                  </div>
                </>
              )}

              {/* User Selector (for privileged users) */}
              {isPrivileged && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">User</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm font-medium text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors border-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">All Users</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trend Analysis</h3>
              <div className="flex gap-2">
                {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setActiveMetric(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      activeMetric === key
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cfg.icon}
                    {key}
                  </button>
                ))}
              </div>
            </div>
            <Chart
              points={chartPoints}
              color={METRIC_CONFIG[activeMetric].color}
              gradientId={METRIC_CONFIG[activeMetric].gradientId}
              maxVal={maxVal}
            />
          </div>

          {/* Data Count */}
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            Showing {filteredData.length} records from database
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
