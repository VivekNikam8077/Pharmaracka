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
} from 'lucide-react';

interface AnalyticsProps {
  data: DaySummary[];
  setData: React.Dispatch<React.SetStateAction<DaySummary[]>>;
  user: User;
  users: User[];
}

// ==================== CONSTANTS ====================
const CHART_W = 1000;
const CHART_H = 200;
const PAD_L = 60;
const PAD_R = 40;
const PAD_T = 20;
const PAD_B = 40;

const METRIC_CONFIG: Record<string, { color: string; gradientId: string; key: keyof DaySummary; icon: React.ReactNode; desc: string }> = {
  'Work':      { color: '#10b981', gradientId: 'grad-work',     key: 'productiveMinutes',  icon: <Activity className="w-5 h-5" />,  desc: 'Core Presence' },
  'Breaks':    { color: '#f43f5e', gradientId: 'grad-breaks',   key: 'totalMinutes',       icon: <Clock className="w-5 h-5" />,     desc: 'Restoration' },
  'Feedback':  { color: '#0ea5e9', gradientId: 'grad-feedback', key: 'feedbackMinutes',    icon: <TrendingUp className="w-5 h-5" />, desc: 'Growth Mix' },
  'Cross-Util':{ color: '#6366f1', gradientId: 'grad-cross',    key: 'crossUtilMinutes',   icon: <BarChart3 className="w-5 h-5" />, desc: 'Node Load' },
};

// ==================== HELPERS ====================
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

// FIX: Get idle minutes accurately — close any open idle session if still running
const getIdleMinutes = (userId: string, date: string): number => {
  try {
    const raw = localStorage.getItem('officely_idle_track_v1');
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const dayBucket = parsed?.[date];
    const row = dayBucket?.[userId];
    const totalMs = typeof row?.idleTotalMs === 'number' && Number.isFinite(row.idleTotalMs) ? row.idleTotalMs : 0;
    const idleStartMs = typeof row?.idleStartMs === 'number' && Number.isFinite(row.idleStartMs) ? row.idleStartMs : null;
    // Only add open idle if date is today (don't inflate past days)
    const todayStr = toDateStr(new Date());
    const openMs = idleStartMs !== null && date === todayStr ? Math.max(0, Date.now() - idleStartMs) : 0;
    return Math.max(0, Math.floor((totalMs + openMs) / 60000));
  } catch {
    return 0;
  }
};

// ==================== CALENDAR ====================
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
    <div className="absolute left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="text-slate-400 hover:text-indigo-600 text-xs font-black px-2">◀</button>
        <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-200">
          {month.toLocaleString('default', { month: 'long' })} {month.getFullYear()}
        </span>
        <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="text-slate-400 hover:text-indigo-600 text-xs font-black px-2">▶</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] font-black uppercase text-slate-400 mb-2 text-center">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {cells.map((c, idx) =>
          c ? (
            <button key={idx} onClick={() => { onSelect(toDateStr(c)); onClose(); }}
              className={`w-full py-1.5 rounded-lg transition-all text-center ${valueDate && isSameDay(c, valueDate) ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700'}`}>
              {c.getDate()}
            </button>
          ) : <div key={idx} />
        )}
      </div>
    </div>
  );
};

// ==================== CHART ====================
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
      <div className="flex items-center justify-center h-64 text-slate-300 dark:text-slate-700 font-black text-sm uppercase tracking-widest">
        No data in range
      </div>
    );
  }

  const linePath = points.length < 2
    ? ''
    : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const areaPath = points.length < 2
    ? ''
    : `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(CHART_H - PAD_B).toFixed(1)} L ${points[0].x.toFixed(1)} ${(CHART_H - PAD_B).toFixed(1)} Z`;

  // Y-axis labels (4 ticks)
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
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={t.yPos} x2={CHART_W - PAD_R} y2={t.yPos}
              stroke="#94a3b8" strokeWidth="0.8" strokeOpacity="0.2"
              strokeDasharray={i === 0 ? '0' : '4 4'}
            />
            <text x={PAD_L - 8} y={t.yPos + 4} textAnchor="end"
              className="fill-slate-400 dark:fill-slate-600"
              style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
              {i === 0 ? '' : t.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        )}

        {/* Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Points + hover zones */}
        {points.map((p, i) => {
          const isH = hovered?.idx === i;
          return (
            <g key={i}>
              {/* Vertical guide on hover */}
              {isH && (
                <line
                  x1={p.x} y1={PAD_T} x2={p.x} y2={CHART_H - PAD_B}
                  stroke={color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 3"
                />
              )}
              {/* X-axis label */}
              <text
                x={p.x} y={CHART_H - 4}
                textAnchor="middle"
                style={{ fontSize: 11, fontWeight: 800, fontFamily: 'inherit' }}
                className={isH ? 'fill-indigo-500 dark:fill-indigo-400' : 'fill-slate-300 dark:fill-slate-600'}
              >
                {p.date.slice(8)} {/* DD only */}
              </text>
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y}
                r={isH ? 6 : 4}
                fill="white"
                stroke={color}
                strokeWidth="2.5"
                style={{ transition: 'r 0.15s ease' }}
              />
              {/* Large invisible hover target */}
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

      {/* Tooltip — rendered in HTML over the SVG, properly centred */}
      {hovered && (() => {
        // Convert SVG x to % of container width
        const xPct = (hovered.x / CHART_W) * 100;
        // Convert SVG y to % of container height (SVG H → container H = 280)
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
            <div className="bg-slate-900 dark:bg-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 flex flex-col items-center whitespace-nowrap">
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{hovered.date}</span>
              <span className="text-lg font-black tabular-nums">{formatHnM(hovered.value)}</span>
            </div>
            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-2 h-2 bg-slate-900 dark:bg-slate-700 rotate-45 -mt-1 shadow" />
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsUserMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getUserName = (id: string) => {
    const u = users.find(u => u.id === id || u.email === id || u.name === id);
    return u?.name || id;
  };

  // ==================== DATA FILTERING ====================
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

    // FIX: date comparison using local midnight, not UTC shift
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (range === 'Custom' && startDate && endDate) {
      // FIX: parse date strings as local dates (append T00:00:00 to avoid UTC offset issues)
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

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, range, startDate, endDate, search, user, users, isPrivileged, selectedUserId]);

  // ==================== CHART DATA ====================
  const { chartPoints, maxVal } = useMemo(() => {
    const getValue = (d: DaySummary): number => {
      if (activeMetric === 'Breaks') return (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
      const cfg = METRIC_CONFIG[activeMetric];
      return (d[cfg.key] as number) || 0;
    };

    // Use last 15 points for chart
    const points = filteredData.slice(-15);
    if (points.length === 0) return { chartPoints: [], maxVal: 60 };

    const max = Math.max(...points.map(d => getValue(d)), 60);
    // Round up to nearest 30 mins for clean axis
    const maxRounded = Math.ceil(max / 30) * 30;

    const drawW = CHART_W - PAD_L - PAD_R;
    const drawH = CHART_H - PAD_T - PAD_B;
    const n = points.length;

    const chartPts: ChartPoint[] = points.map((d, i) => {
      const val = getValue(d);
      const x = n === 1
        ? PAD_L + drawW / 2
        : PAD_L + (i / (n - 1)) * drawW;
      const y = (CHART_H - PAD_B) - (val / maxRounded) * drawH;
      return { x, y, value: val, date: d.date, idx: i };
    });

    return { chartPoints: chartPts, maxVal: maxRounded };
  }, [filteredData, activeMetric]);

  // ==================== EXPORT ====================
  const exportActivityReport = () => {
    if (filteredData.length === 0) return alert('No data to export.');
    const headers = ['Operator','Shift Date','Login','Logout','Idle (H:M)','Actual Work (H:M)','Lunch (H:M)','Snacks (H:M)','Ref (H:M)','Feedback (H:M)','Cross-Util (H:M)','Total (H:M)'];
    const rows = filteredData.map(d => {
      const idle = getIdleMinutes(d.userId, d.date);
      const actual = Math.max(0, (d.productiveMinutes || 0) - idle);
      return [getUserName(d.userId), d.date, d.loginTime, d.logoutTime, formatHnM(idle), formatHnM(actual), formatHnM(d.lunchMinutes), formatHnM(d.snacksMinutes), formatHnM(d.refreshmentMinutes), formatHnM(d.feedbackMinutes), formatHnM(d.crossUtilMinutes), formatHnM(d.totalMinutes)];
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

  // ==================== RENDER ====================
  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">

      {/* Filter Panel */}
      <div className="bg-white dark:bg-slate-800 p-10 rounded-[3rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl ring-8 ring-indigo-50 dark:ring-indigo-900/30">
              <Filter className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Archive Engine</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Temporal dataset processing</p>
            </div>
          </div>
          {isPrivileged && (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={exportBreakReport} className="px-6 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-2">
                <Coffee className="w-4 h-4" /> Break Report
              </button>
              <button onClick={exportActivityReport} className="px-6 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2">
                <FileText className="w-4 h-4" /> Export CSV
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pt-8 border-t border-slate-100 dark:border-slate-700">
          {isPrivileged && (
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-indigo-500" /> Identity
              </label>
              <div className="relative">
                <button type="button" onClick={() => setIsUserMenuOpen(v => !v)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 transition-all shadow-sm dark:text-white flex items-center justify-between">
                  <span className="truncate">{selectedUserId === 'all' ? 'Global (All Users)' : (users.find(u => u.id === selectedUserId)?.name || 'Select User')}</span>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-90' : 'rotate-0'}`} />
                </button>
                {isUserMenuOpen && (
                  <>
                    <button type="button" onClick={() => setIsUserMenuOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                    <div className="absolute left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-2xl overflow-hidden">
                      <div className="max-h-64 overflow-auto py-2">
                        <button type="button" onClick={() => { setSelectedUserId('all'); setIsUserMenuOpen(false); }}
                          className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedUserId === 'all' ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}>
                          Global (All Users)
                        </button>
                        {users.map(u => (
                          <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setIsUserMenuOpen(false); }}
                            className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedUserId === u.id ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}>
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

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-500" /> Horizon
            </label>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl">
              {(['7D','30D','All','Custom'] as const).map(r => (
                <button key={r} onClick={() => setRange(r)}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${range === r ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {range === 'Custom' && (
            <>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Start</label>
                <div className="relative">
                  <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                    <button type="button" onClick={() => { setShowStartCal(v => !v); setShowEndCal(false); }}
                      className="w-full text-left text-xs font-bold text-slate-700 dark:text-white outline-none">
                      {startDate || 'Pick a date'}
                    </button>
                  </div>
                  {showStartCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-40" onClick={() => setShowStartCal(false)} />
                      <CalendarPopup month={startMonth} onMonthChange={setStartMonth} value={startDate} onSelect={v => setStartDate(v)} onClose={() => setShowStartCal(false)} />
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">End</label>
                <div className="relative">
                  <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl shadow-sm flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                    <button type="button" onClick={() => { setShowEndCal(v => !v); setShowStartCal(false); }}
                      className="w-full text-left text-xs font-bold text-slate-700 dark:text-white outline-none">
                      {endDate || 'Pick a date'}
                    </button>
                  </div>
                  {showEndCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-40" onClick={() => setShowEndCal(false)} />
                      <CalendarPopup month={endMonth} onMonthChange={setEndMonth} value={endDate} onSelect={v => setEndDate(v)} onClose={() => setShowEndCal(false)} />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart Section */}
      <div className="space-y-8">
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[3rem] border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                <LineChartIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">{activeMetric} Velocity</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Temporal performance mapping · last {Math.min(filteredData.length, 15)} points</p>
              </div>
            </div>
            {/* Legend dot */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: METRIC_CONFIG[activeMetric].color }} />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeMetric}</span>
            </div>
          </div>

          <Chart
            points={chartPoints}
            color={METRIC_CONFIG[activeMetric].color}
            gradientId={METRIC_CONFIG[activeMetric].gradientId}
            maxVal={maxVal}
          />
        </div>

        {/* Metric selector cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(METRIC_CONFIG).map(([label, config]) => (
            <button key={label} onClick={() => setActiveMetric(label)}
              className={`flex items-center gap-4 p-6 rounded-[2rem] border transition-all duration-300 text-left ${
                activeMetric === label
                  ? 'bg-white dark:bg-slate-700 border-indigo-200 dark:border-indigo-800 shadow-xl scale-[1.02] ring-2 ring-indigo-500/10'
                  : 'bg-slate-50 dark:bg-slate-900 border-transparent opacity-60 hover:opacity-90 hover:bg-white dark:hover:bg-slate-800'
              }`}>
              <div className={`p-3 rounded-xl transition-all flex-shrink-0 ${activeMetric === label ? 'text-white shadow-sm' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
                style={activeMetric === label ? { backgroundColor: config.color } : {}}>
                {config.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest truncate">{label}</p>
                <p className={`text-[10px] font-bold mt-0.5 truncate ${activeMetric === label ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400'}`}>
                  {config.desc}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Daily Logs Table */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-10 py-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Daily Logs</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Login / Logout and time breakdown per day</p>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filteredData.length} Records</span>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  {selectedUserId === 'all' && <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">User</th>}
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Login</th>
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Logout</th>
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Work</th>
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Breaks</th>
                  <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={selectedUserId === 'all' ? 7 : 6} className="px-10 py-12 text-center text-slate-300 dark:text-slate-700 font-black uppercase tracking-widest text-[10px]">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredData
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((d, idx) => {
                      const breakMins = (d.lunchMinutes || 0) + (d.snacksMinutes || 0) + (d.refreshmentMinutes || 0);
                      return (
                        <tr key={`${d.userId}-${d.date}-${idx}`} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/30 transition-colors">
                          {selectedUserId === 'all' && (
                            <td className="px-8 py-5">
                              <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{getUserName(d.userId)}</span>
                            </td>
                          )}
                          <td className="px-8 py-5"><span className="text-xs font-black text-slate-800 dark:text-white">{d.date}</span></td>
                          <td className="px-8 py-5"><span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{d.loginTime || '—'}</span></td>
                          <td className="px-8 py-5"><span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{d.logoutTime || '—'}</span></td>
                          <td className="px-8 py-5"><span className="text-xs font-black text-emerald-600">{formatHnM(d.productiveMinutes || 0)}</span></td>
                          <td className="px-8 py-5"><span className="text-xs font-black text-rose-500">{formatHnM(breakMins)}</span></td>
                          <td className="px-8 py-5"><span className="text-xs font-black text-slate-800 dark:text-white">{formatHnM(d.totalMinutes || 0)}</span></td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
