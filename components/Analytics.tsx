
import React, { useState, useMemo, useEffect } from 'react';
import { DaySummary, UserRole, User } from '../types';
import { 
  TrendingUp, 
  Clock, 
  Activity,
  Search,
  BarChart3,
  LineChart as LineChartIcon,
  ChevronRight,
  CalendarDays,
  Users as UsersIcon,
  Filter,
  FileText,
  Coffee,
  Download
} from 'lucide-react';

interface AnalyticsProps {
  data: DaySummary[];
  setData: React.Dispatch<React.SetStateAction<DaySummary[]>>;
  user: User;
  users: User[];
}

const Analytics: React.FC<AnalyticsProps> = ({ data, user, users }) => {
  const [range, setRange] = useState<'7D' | '30D' | 'All' | 'Custom'>('7D');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [activeMetric, setActiveMetric] = useState<string>('Work');
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number, y: number, value: number, label: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showStartCal, setShowStartCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);
  const [startMonth, setStartMonth] = useState(new Date());
  const [endMonth, setEndMonth] = useState(new Date());
  const getUserName = (id: string) => {
    const u = users.find(u => u.id === id || u.email === id || u.name === id);
    return u?.name || id;
  };
  
  const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;

  useEffect(() => {
    if (!isPrivileged) setSelectedUserId(user.id);
  }, [isPrivileged, user.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const formatHnM = (totalMinutes: number) => {
    if (isNaN(totalMinutes) || totalMinutes <= 0) return "0h 0m";
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  };

  const toDateStr = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const buildMonthDays = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay(); // 0 Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  };

  const CalendarPopup: React.FC<{ month: Date; onMonthChange: (next: Date) => void; value: string; onSelect: (v: string) => void; onClose: () => void; }> = ({ month, onMonthChange, value, onSelect, onClose }) => {
    const cells = buildMonthDays(month);
    const valueDate = value ? new Date(value) : null;
    const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    return (
      <div className="absolute left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="text-slate-400 hover:text-indigo-600 text-xs font-black">◀</button>
          <div className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-200">{month.toLocaleString('default', { month: 'long' })} {month.getFullYear()}</div>
          <button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="text-slate-400 hover:text-indigo-600 text-xs font-black">▶</button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-[10px] font-black uppercase text-slate-400 mb-2">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2 text-xs">
          {cells.map((c, idx) => c ? (
            <button
              key={idx}
              onClick={() => { onSelect(toDateStr(c)); onClose(); }}
              className={`w-full py-2 rounded-xl transition-all ${
                valueDate && isSameDay(c, valueDate)
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700'
              }`}
            >
              {c.getDate()}
            </button>
          ) : (
            <div key={idx} />
          ))}
        </div>
      </div>
    );
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    const matchesUser = (dayUserId: string, u: User) => {
      const key = (dayUserId || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      return key === id || (email && key === email) || (name && key === name);
    };

    if (isPrivileged) {
      if (selectedUserId !== 'all') {
        const selectedUser = users.find(u => u.id === selectedUserId);
        result = result.filter(d => {
          if (d.userId === selectedUserId) return true;
          if (!selectedUser) return false;
          return matchesUser(d.userId, selectedUser);
        });
      }
    } else {
      result = result.filter(d => matchesUser(d.userId, user));
    }

    const now = new Date();
    const comparisonDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (range === 'Custom' && startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      result = result.filter(d => {
        const dDate = new Date(d.date);
        return dDate >= s && dDate <= e;
      });
    } else if (range !== 'All') {
      result = result.filter(d => {
        const dayDate = new Date(d.date);
        const diffMs = comparisonDate.getTime() - dayDate.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));
        if (range === '7D') return diffDays >= 0 && diffDays < 7;
        if (range === '30D') return diffDays >= 0 && diffDays < 30;
        return true;
      });
    }

    if (search) {
      result = result.filter(d => 
        d.userId.toLowerCase().includes(search.toLowerCase()) || 
        d.date.includes(search)
      );
    }

    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, range, startDate, endDate, search, user.id, isPrivileged, selectedUserId]);

  const METRIC_CONFIG: Record<string, { color: string; key: keyof DaySummary; icon: React.ReactNode; desc: string }> = {
    'Work': { color: '#10b981', key: 'productiveMinutes', icon: <Activity className="w-5 h-5" />, desc: 'Core Presence' },
    'Breaks': { color: '#f43f5e', key: 'totalMinutes', icon: <Clock className="w-5 h-5" />, desc: 'Restoration' },
    'Feedback': { color: '#0ea5e9', key: 'feedbackMinutes', icon: <TrendingUp className="w-5 h-5" />, desc: 'Growth Mix' },
    'Cross-Util': { color: '#6366f1', key: 'crossUtilMinutes', icon: <BarChart3 className="w-5 h-5" />, desc: 'Node Load' }
  };

  const exportActivityReport = () => {
  if (filteredData.length === 0) return alert("No nodes found for export.");

  const headers = ['Operator', 'Shift Date', 'Login', 'Logout', 'Work (H:M)', 'Lunch (H:M)', 'Snacks (H:M)', 'Ref (H:M)', 'Feedback (H:M)', 'Cross-Util (H:M)', 'Total (H:M)'];

  const rows = filteredData.map(d => [
    getUserName(d.userId),
    d.date,
    d.loginTime,
    d.logoutTime, 
    formatHnM(d.productiveMinutes), 
    formatHnM(d.lunchMinutes),
    formatHnM(d.snacksMinutes),
    formatHnM(d.refreshmentMinutes),
    formatHnM(d.feedbackMinutes),
    formatHnM(d.crossUtilMinutes),
    formatHnM(d.totalMinutes)
  ]);

  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Activity_Report_${getUserName(selectedUserId)}_${range}.csv`;
  link.click();
};

  const exportBreakReport = () => {
  if (filteredData.length === 0) return alert("No nodes found for break export.");

  const headers = ['Operator', 'Date', 'Lunch (Mins)', 'Snacks (Mins)', 'Ref (Mins)', 'Total Break (H:M)'];

  const rows = filteredData.map(d => {
    const totalBreakMins = d.lunchMinutes + d.snacksMinutes + d.refreshmentMinutes;
    return [
      getUserName(d.userId),
      d.date,
      d.lunchMinutes,
      d.snacksMinutes,
      d.refreshmentMinutes,
      formatHnM(totalBreakMins)
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Break_Report_${getUserName(selectedUserId)}_${range}.csv`;
  link.click();
};


  const generateLinePath = (metricKey: string) => {
    const points = filteredData.slice(-15);
    if (points.length < 2) return "";
    
    const getValue = (d: DaySummary) => {
      if (metricKey === 'Breaks') return d.lunchMinutes + d.snacksMinutes + d.refreshmentMinutes;
      const config = METRIC_CONFIG[metricKey];
      return d[config.key] as number;
    };

    const maxVal = Math.max(...filteredData.map(d => Math.max(getValue(d), 60)));
    const width = 1000, height = 240, padding = 60;

    return points.map((d, i) => {
      const val = getValue(d);
      const x = (i / (points.length - 1)) * (width - 2 * padding) + padding;
      const y = height - ((val / maxVal) * (height - 2 * padding) + padding);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
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
              <button 
                onClick={exportBreakReport} 
                className="px-6 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-2"
              >
                <Coffee className="w-4 h-4" /> Break Report
              </button>
              <button 
                onClick={exportActivityReport} 
                className="px-6 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2"
              >
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
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(v => !v)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 transition-all shadow-sm dark:text-white flex items-center justify-between"
                >
                  <span className="truncate">
                    {selectedUserId === 'all'
                      ? 'Global (All Users)'
                      : (users.find(u => u.id === selectedUserId)?.name || 'Select User')}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-90' : 'rotate-0'}`} />
                </button>

                {isUserMenuOpen && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div className="absolute left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-2xl overflow-hidden">
                      <div className="max-h-64 overflow-auto py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserId('all');
                            setIsUserMenuOpen(false);
                          }}
                          className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedUserId === 'all' ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}
                        >
                          Global (All Users)
                        </button>
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setIsUserMenuOpen(false);
                            }}
                            className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${selectedUserId === u.id ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}
                          >
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
              {['7D', '30D', 'All', 'Custom'].map(r => (
                <button 
                  key={r}
                  onClick={() => setRange(r as any)} 
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${range === r ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
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
                  <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl shadow-sm focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 transition-all flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                    <button
                      type="button"
                      onClick={() => { setShowStartCal(v => !v); setShowEndCal(false); }}
                      className="w-full text-left text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-0"
                    >
                      {startDate || 'Pick a date'}
                    </button>
                  </div>
                  {showStartCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-40" onClick={() => setShowStartCal(false)} />
                      <CalendarPopup
                        month={startMonth}
                        onMonthChange={setStartMonth}
                        value={startDate}
                        onSelect={(v) => { setStartDate(v); }}
                        onClose={() => setShowStartCal(false)}
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">End</label>
                <div className="relative">
                  <div className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-5 py-4 rounded-2xl shadow-sm focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/30 transition-all flex items-center gap-3">
                    <CalendarDays className="w-4 h-4 text-indigo-500 shrink-0" />
                    <button
                      type="button"
                      onClick={() => { setShowEndCal(v => !v); setShowStartCal(false); }}
                      className="w-full text-left text-xs font-bold text-slate-700 dark:text-white outline-none focus:ring-0"
                    >
                      {endDate || 'Pick a date'}
                    </button>
                  </div>
                  {showEndCal && (
                    <>
                      <button type="button" className="fixed inset-0 z-40" onClick={() => setShowEndCal(false)} />
                      <CalendarPopup
                        month={endMonth}
                        onMonthChange={setEndMonth}
                        value={endDate}
                        onSelect={(v) => { setEndDate(v); }}
                        onClose={() => setShowEndCal(false)}
                      />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-white dark:bg-slate-800 p-12 rounded-[4rem] border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-16 relative z-10">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-sm">
                <LineChartIcon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">{activeMetric} Velocity</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Temporal performance mapping</p>
              </div>
            </div>
          </div>

          <div className="relative h-[320px] w-full">
            <svg viewBox="0 0 1000 240" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              {[0, 1, 2, 3].map(i => (
                <line key={i} x1="40" y1={40 + i * 53.3} x2="960" y2={40 + i * 53.3} stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.15" />
              ))}
              
              <path 
                d={generateLinePath(activeMetric)} 
                fill="none" 
                stroke={METRIC_CONFIG[activeMetric].color} 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="transition-all duration-1000 ease-in-out" 
              />

              {filteredData.slice(-15).map((d, i) => {
                const getValue = (day: DaySummary) => {
                  if (activeMetric === 'Breaks') return day.lunchMinutes + day.snacksMinutes + day.refreshmentMinutes;
                  return day[METRIC_CONFIG[activeMetric].key] as number;
                };
                const maxVal = Math.max(...filteredData.map(day => Math.max(getValue(day), 60)));
                const x = (i / (Math.max(filteredData.slice(-15).length - 1, 1))) * (1000 - 120) + 60;
                const val = getValue(d);
                const y = 240 - ((val / maxVal) * (240 - 80) + 40);
                const isHovered = hoveredPoint?.x === x;

                return (
                  <g key={i}>
                    <line x1={x} y1="40" x2={x} y2="200" stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.1" strokeDasharray="4 4" />
                    <circle 
                      cx={x} cy={y} r="35" 
                      fill="transparent" 
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint({ x, y, value: val, label: activeMetric })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                    <circle 
                      cx={x} cy={y} r={isHovered ? "10" : "5"} 
                      fill="white" stroke={METRIC_CONFIG[activeMetric].color} strokeWidth="2.5" 
                      className="transition-all duration-300 pointer-events-none shadow-sm"
                    />
                    <text x={x} y="235" textAnchor="middle" className={`text-[12px] font-black transition-colors ${isHovered ? 'fill-indigo-600 dark:fill-indigo-400' : 'fill-slate-300 dark:fill-slate-600'}`}>
                      {d.date.split('-')[2]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hoveredPoint && (
              <div 
                className="absolute z-50 pointer-events-none transition-all duration-300"
                style={{ left: `${(hoveredPoint.x / 1000) * 100}%`, top: `${(hoveredPoint.y / 240) * 100}%`, transform: 'translate(-50%, -160%)' }}
              >
                <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl px-7 py-5 rounded-[2rem] shadow-2xl border border-white/10 text-white flex flex-col items-center min-w-[120px]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">{hoveredPoint.label}</span>
                  <div className="text-2xl font-black tabular-nums">{formatHnM(hoveredPoint.value)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Object.entries(METRIC_CONFIG).map(([label, config]) => (
            <button
              key={label}
              onClick={() => setActiveMetric(label)}
              className={`flex items-center gap-8 p-10 rounded-[2.5rem] border transition-all duration-500 group relative overflow-hidden text-left ${
                activeMetric === label 
                  ? 'bg-white dark:bg-slate-700 border-indigo-200 dark:border-indigo-800 shadow-2xl shadow-indigo-100/50 dark:shadow-none scale-[1.03] ring-2 ring-indigo-500/5' 
                  : 'bg-slate-50 dark:bg-slate-900 border-transparent text-slate-400 opacity-60 hover:opacity-100 hover:bg-white dark:hover:bg-slate-800'
              }`}
            >
              <div className={`p-5 rounded-2xl transition-all shadow-sm ${activeMetric === label ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                 {config.icon}
              </div>
              <div>
                <p className="text-[12px] font-black uppercase tracking-widest mb-1">{label}</p>
                <p className={`text-xs font-bold leading-tight ${activeMetric === label ? 'text-slate-500 dark:text-slate-300' : 'text-slate-400'}`}>
                  {config.desc}
                </p>
              </div>
              {activeMetric === label && (
                <div className="absolute right-10 opacity-20"><ChevronRight className="w-10 h-10" /></div>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-[3rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-10 py-8 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Daily Logs</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Login / Logout and available time per day</p>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {filteredData.length} Records
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  {selectedUserId === 'all' && (
                    <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">User</th>
                  )}
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Login</th>
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Logout</th>
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Available</th>
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Breaks</th>
                  <th className="px-10 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={selectedUserId === 'all' ? 7 : 6}
                      className="px-10 py-12 text-center text-slate-300 dark:text-slate-700 font-black uppercase tracking-widest text-[10px]"
                    >
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredData
                    .slice()
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((d, idx) => {
                      const breakMins = d.lunchMinutes + d.snacksMinutes + d.refreshmentMinutes;
                      return (
                        <tr key={`${d.name}-${d.date}-${idx}`} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/30">
                          {selectedUserId === 'all' && (
                            <td className="px-10 py-6">
                              <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{getUserName(d.userId)}</span>
                            </td>
                          )}
                          <td className="px-10 py-6">
                            <span className="text-xs font-black text-slate-800 dark:text-white">{d.date}</span>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-mono font-black text-slate-600 dark:text-slate-300">{d.loginTime}</span>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-mono font-black text-slate-600 dark:text-slate-300">{d.logoutTime}</span>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-black text-emerald-600">{formatHnM(d.productiveMinutes)}</span>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-black text-rose-600">{formatHnM(breakMins)}</span>
                          </td>
                          <td className="px-10 py-6">
                            <span className="text-xs font-black text-slate-800 dark:text-white">{formatHnM(d.totalMinutes)}</span>
                          </td>
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
