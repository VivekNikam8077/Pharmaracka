import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Filter,
  FileText,
  Coffee,
  Palmtree,
  Download,
  ChevronDown,
} from 'lucide-react';

interface AnalyticsProps {
  data: DaySummary[];
  setData: React.Dispatch<React.SetStateAction<DaySummary[]>>;
  user: User;
  users: User[];
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

const isHoliday = (loginTime?: string, logoutTime?: string): boolean => {
  if (!loginTime || !logoutTime) return true;
  const login = loginTime.trim();
  const logout = logoutTime.trim();
  if (!login || !logout) return true;
  if (login === '00:00' && logout === '00:00') return true;
  if (login === '00:00:00' && logout === '00:00:00') return true;
  return false;
};

const getIdleMinutes = (userId: string, date: string): number => {
  try {
    const raw = localStorage.getItem('officely_idle_track_v1');
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const dayBucket = parsed?.[date];
    const row = dayBucket?.[userId];
    const totalMs = typeof row?.idleTotalMs === 'number' && Number.isFinite(row.idleTotalMs) ? row.idleTotalMs : 0;
    const idleStartMs = typeof row?.idleStartMs === 'number' && Number.isFinite(row.idleStartMs) ? row.idleStartMs : null;
    const todayStr = toDateStr(new Date());
    const openMs = idleStartMs !== null && date === todayStr ? Math.max(0, Date.now() - idleStartMs) : 0;
    return Math.max(0, Math.floor((totalMs + openMs) / 60000));
  } catch {
    return 0;
  }
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
}

const CalendarPopup: React.FC<CalendarPopupProps> = ({ month, onMonthChange, value, onSelect, onClose }) => {
  const cells = buildMonthDays(month);
  const valueDate = value ? new Date(value + 'T00:00:00') : null;
  return (
    <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-200 w-80">
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

const Analytics: React.FC<AnalyticsProps> = ({ data, user, users }) => {
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

  const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;

  useEffect(() => {
    if (!isPrivileged) setSelectedUserId(user.id);
  }, [isPrivileged, user.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setIsUserMenuOpen(false); setShowStartCal(false); setShowEndCal(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getUserName = (id: string) => {
    const u = users.find(u => u.id === id || u.email === id || u.name === id);
    return u?.name || id;
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    const matchesUser = (dayUserId: string, u: User) => {
      const key = (dayUserId || '').toLowerCase();
      return key === (u.id || '').toLowerCase()
        || (u.email && key === u.email.toLowerCase())
        || (u.name && key === u.name.toLowerCase());
    };

    if (isPrivileged) {
      if (selectedUserId !== 'all') {
        const sel = users.find(u => u.id === selectedUserId);
        result = result.filter(d => d.userId === selectedUserId || (sel && matchesUser(d.userId, sel)));
      }
    } else {
      result = result.filter(d => matchesUser(d.userId, user));
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (range === 'Custom' && startDate && endDate) {
      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(endDate + 'T23:59:59');
      result = result.filter(d => {
        const dDate = new Date(d.date + 'T00:00:00');
        return dDate >= s && dDate <= e;
      });
    } else if (range !== 'All') {
      const days = range === '7D' ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
      result = result.filter(d => {
        const dDate = new Date(d.date + 'T00:00:00');
        return dDate >= cutoff && dDate <= today;
      });
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        d.userId.toLowerCase().includes(q) || d.date.includes(q)
      );
    }

    // Debug logging to help troubleshoot
    console.log('[Analytics] Raw data count:', data.length);
    console.log('[Analytics] Filtered data count:', result.length);
    console.log('[Analytics] Current filters:', { range, selectedUserId, search, startDate, endDate });
    if (result.length > 0) {
      console.log('[Analytics] Sample data:', result[0]);
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, range, startDate, endDate, search, user, users, isPrivileged, selectedUserId]);

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
    const headers = ['Operator','Shift Date','Login','Logout','Idle (H:M)','Actual Work (H:M)','Lunch (H:M)','Snacks (H:M)','Ref (H:M)','Feedback (H:M)','Cross-Util (H:M)','Total (H:M)'];
    const rows = filteredData.map(d => {
      const idle = getIdleMinutes(d.userId, d.date);
      const actual = Math.max(0, (d.productiveMinutes || 0) - idle);
      const login = isHoliday(d.loginTime, d.logoutTime) ? 'Holiday' : d.loginTime;
      const logout = isHoliday(d.loginTime, d.logoutTime) ? 'Holiday' : d.logoutTime;
      return [getUserName(d.userId), d.date, login, logout, formatHnM(idle), formatHnM(actual), formatHnM(d.lunchMinutes), formatHnM(d.snacksMinutes), formatHnM(d.refreshmentMinutes), formatHnM(d.feedbackMinutes), formatHnM(d.crossUtilMinutes), formatHnM(d.totalMinutes)];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `Activity_${selectedUserId}_${range}.csv` });
    a.click();
  };

  const exportBreakReport = () => {
    if (filteredData.length === 0) return alert('No data to export.');
    const headers = ['Operator','Date','Lunch (Mins)','Snacks (Mins)','Ref (Mins)','Idle (H:M)','Actual Work (H:M)','Total Break (H:M)'];
    const rows = filteredData.map(d => {
      const idle = getIdleMinutes(d.userId, d.date);
      const actual = Math.max(0, (d.productiveMinutes || 0) - idle);
      const total = (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
      return [getUserName(d.userId), d.date, d.lunchMinutes, d.snacksMinutes, d.refreshmentMinutes, formatHnM(idle), formatHnM(actual), formatHnM(total)];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `Breaks_${selectedUserId}_${range}.csv` });
    a.click();
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <BarChart3 className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Analytics</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Performance insights and reports</p>
          </div>
        </div>
        {isPrivileged && (
          <div className="flex gap-2">
            <button onClick={exportBreakReport} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-amber-500/25 transition-all duration-200">
              <Coffee className="w-4 h-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Breaks</span>
            </button>
            <button onClick={exportActivityReport} className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 active:scale-95 text-white rounded-xl text-sm font-semibold shadow-lg shadow-black/20 transition-all duration-200">
              <Download className="w-4 h-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6 overflow-visible">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isPrivileged && (
            <div className="space-y-2 relative z-10">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                <UsersIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                User
              </label>
              <div className="relative">
                <button type="button" onClick={() => setIsUserMenuOpen(v => !v)}
                  className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 flex items-center justify-between">
                  <span className="truncate">{selectedUserId === 'all' ? 'All Users' : (users.find(u => u.id === selectedUserId)?.name || 'Select')}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : 'rotate-0'}`} strokeWidth={2.5} />
                </button>
                {isUserMenuOpen && (
                  <>
                    <button type="button" onClick={() => setIsUserMenuOpen(false)} className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm" />
                    <div className="absolute left-0 right-0 mt-2 z-[9999] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
                      <div className="max-h-64 overflow-auto py-2">
                        <button type="button" onClick={() => { setSelectedUserId('all'); setIsUserMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 ${selectedUserId === 'all' ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                          All Users
                        </button>
                        {users.map(u => (
                          <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setIsUserMenuOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 ${selectedUserId === u.id ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                            {u.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              <CalendarDays className="w-3.5 h-3.5" strokeWidth={2.5} />
              Range
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl">
              {(['7D','30D','All','Custom'] as const).map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${range === r ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {range === 'Custom' && (
            <>
              <div className="space-y-2 relative z-10">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Start Date</label>
                <div className="relative">
                  <button type="button" onClick={() => { setShowStartCal(v => !v); setShowEndCal(false); }}
                    className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 text-left font-medium">
                    {startDate || 'Pick date'}
                  </button>
                  {showStartCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm" onClick={() => setShowStartCal(false)} />
                      <CalendarPopup month={startMonth} onMonthChange={setStartMonth} value={startDate} onSelect={v => setStartDate(v)} onClose={() => setShowStartCal(false)} />
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2 relative z-10">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">End Date</label>
                <div className="relative">
                  <button type="button" onClick={() => { setShowEndCal(v => !v); setShowStartCal(false); }}
                    className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 text-left font-medium">
                    {endDate || 'Pick date'}
                  </button>
                  {showEndCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm" onClick={() => setShowEndCal(false)} />
                      <CalendarPopup month={endMonth} onMonthChange={setEndMonth} value={endDate} onSelect={v => setEndDate(v)} onClose={() => setShowEndCal(false)} />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <LineChartIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{activeMetric} Trend</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: METRIC_CONFIG[activeMetric].color }} />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Last {Math.min(filteredData.length, 15)} days</span>
          </div>
        </div>

        <Chart points={chartPoints} color={METRIC_CONFIG[activeMetric].color} gradientId={METRIC_CONFIG[activeMetric].gradientId} maxVal={maxVal} />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(METRIC_CONFIG).map(([label, config]) => (
          <button key={label} onClick={() => setActiveMetric(label)}
            className={`p-5 rounded-2xl border-2 transition-all duration-200 text-left ${
              activeMetric === label
                ? 'bg-white dark:bg-slate-700 border-indigo-500 shadow-xl shadow-indigo-500/10 scale-105'
                : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800'
            }`}>
            <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${activeMetric === label ? 'shadow-lg' : 'bg-slate-200 dark:bg-slate-800'}`}
              style={activeMetric === label ? { backgroundColor: config.color } : {}}>
              {React.cloneElement(config.icon as any, { 
                className: activeMetric === label ? 'text-white' : 'text-slate-500 dark:text-slate-400',
                strokeWidth: 2.5 
              })}
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{label}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{config.desc}</p>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Activity Logs</h3>
          <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{filteredData.length} records</span>
        </div>

        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                {selectedUserId === 'all' && <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">User</th>}
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Date</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Login</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Logout</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Work</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Breaks</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={selectedUserId === 'all' ? 7 : 6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <LineChartIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" strokeWidth={2} />
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">No activity data found</p>
                      <p className="text-xs text-slate-400 dark:text-slate-600">
                        {data.length === 0 
                          ? 'No data has been recorded yet. Data will appear after users log in and use the system.'
                          : 'Try adjusting your filters or date range to see more data.'}
                      </p>
                      {data.length > 0 && filteredData.length === 0 && (
                        <button 
                          onClick={() => { setRange('All'); setSearch(''); setSelectedUserId('all'); }}
                          className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all duration-200"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.slice().sort((a, b) => b.date.localeCompare(a.date)).map((d, idx) => {
                  const breakMins = (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
                  const holiday = isHoliday(d.loginTime, d.logoutTime);
                  
                  return (
                    <tr key={`${d.userId}-${d.date}-${idx}`} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors duration-150 ${holiday ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}>
                      {selectedUserId === 'all' && (
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{getUserName(d.userId)}</span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{d.date}</span>
                      </td>
                      {holiday ? (
                        <td className="px-6 py-4" colSpan={5}>
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                            <Palmtree className="w-4 h-4" strokeWidth={2.5} />
                            <span className="text-sm font-semibold">Holiday / Not Available</span>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono text-slate-600 dark:text-slate-400">{d.loginTime || '—'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono text-slate-600 dark:text-slate-400">{d.logoutTime || '—'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatHnM(d.productiveMinutes || 0)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">{formatHnM(breakMins)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatHnM(d.totalMinutes || 0)}</span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
