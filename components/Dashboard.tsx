import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, AppSettings, RealtimeStatus, OfficeStatus } from '../types';
import { Socket } from 'socket.io-client';
import {
  Clock, Activity, Coffee, Cookie, Sparkles,
  MessageSquare, Users, CheckCircle2, RefreshCw,
} from 'lucide-react';

interface DashboardProps {
  user: User;
  settings: AppSettings;
  realtimeStatuses: RealtimeStatus[];
  setRealtimeStatuses: React.Dispatch<React.SetStateAction<RealtimeStatus[]>>;
  socket: Socket | null;
  hasSynced: boolean;
  serverOffsetMs: number;
}

interface TodayStats {
  productiveMinutes: number;
  lunchMinutes: number;
  snacksMinutes: number;
  refreshmentMinutes: number;
  feedbackMinutes: number;
  crossUtilMinutes: number;
  totalMinutes: number;
  loginTime: string;
}

const EMPTY_STATS: TodayStats = {
  productiveMinutes: 0, lunchMinutes: 0, snacksMinutes: 0,
  refreshmentMinutes: 0, feedbackMinutes: 0, crossUtilMinutes: 0,
  totalMinutes: 0, loginTime: '',
};

const POLL_MS = 30_000;

const getServerIp = () =>
  localStorage.getItem('officely_server_ip') || 'https://server2-e3p9.onrender.com';

const formatTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const getStatusConfig = (status: OfficeStatus) => {
  switch (status) {
    case OfficeStatus.AVAILABLE:
      return { icon: CheckCircle2,  color: 'from-emerald-500 to-teal-600',  textColor: 'text-emerald-600', label: 'Available' };
    case OfficeStatus.LUNCH:
      return { icon: Coffee,        color: 'from-orange-500 to-amber-600',  textColor: 'text-orange-600',  label: 'Lunch' };
    case OfficeStatus.SNACKS:
      return { icon: Cookie,        color: 'from-yellow-500 to-orange-500', textColor: 'text-yellow-600',  label: 'Snacks' };
    case OfficeStatus.REFRESHMENT_BREAK:
      return { icon: Sparkles,      color: 'from-blue-500 to-cyan-600',     textColor: 'text-blue-600',    label: 'Break' };
    case OfficeStatus.QUALITY_FEEDBACK:
      return { icon: MessageSquare, color: 'from-purple-500 to-pink-600',   textColor: 'text-purple-600',  label: 'Feedback' };
    case OfficeStatus.CROSS_UTILIZATION:
      return { icon: Users,         color: 'from-indigo-500 to-purple-600', textColor: 'text-indigo-600',  label: 'Cross-Util' };
    default:
      return { icon: Activity,      color: 'from-slate-500 to-slate-600',   textColor: 'text-slate-600',   label: status };
  }
};

// ─────────────────────────────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({
  user, settings, realtimeStatuses, socket, hasSynced, serverOffsetMs,
}) => {
  const [currentStatus, setCurrentStatus]     = useState<OfficeStatus>(OfficeStatus.AVAILABLE);
  const [todayStats, setTodayStats]           = useState<TodayStats>(EMPTY_STATS);
  const [isFetching, setIsFetching]           = useState(false);
  const [sessionStartMs, setSessionStartMs]   = useState<number | null>(null);
  const [elapsedTime, setElapsedTime]         = useState(0);
  const [statusDuration, setStatusDuration]   = useState(0);

  const currentStatusRef    = useRef<OfficeStatus>(OfficeStatus.AVAILABLE);
  const statusChangeTimeRef = useRef<number>(Date.now());
  const isChangingRef       = useRef(false);
  const pollRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef      = useRef(false);

  // ── fetch today's stats from DB ──────────────────────────────────────────
  const fetchToday = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setIsFetching(true);
      const res  = await fetch(`${getServerIp()}/api/Office/today?userId=${encodeURIComponent(user.id)}`);
      if (!res.ok) return;
      const json = await res.json();
      if (!json.ok) return;

      const row = json.data;
      if (!row) { setTodayStats(EMPTY_STATS); return; }

      setTodayStats({
        productiveMinutes:  row.productiveminutes  || 0,
        lunchMinutes:       row.lunchminutes       || 0,
        snacksMinutes:      row.snacksminutes      || 0,
        refreshmentMinutes: row.refreshmentminutes || 0,
        feedbackMinutes:    row.feedbackminutes    || 0,
        crossUtilMinutes:   row.crossutilminutes   || 0,
        totalMinutes:       row.totalminutes       || 0,
        loginTime:          row.logintime          || '',
      });

      // Derive session start from server-recorded logintime (IST)
      if (row.logintime && !sessionStartMs) {
        const today      = json.date; // "YYYY-MM-DD"
        const loginEpoch = new Date(`${today}T${row.logintime}+05:30`).getTime();
        if (Number.isFinite(loginEpoch)) setSessionStartMs(loginEpoch);
      }
    } catch (e) {
      console.error('[Dashboard] fetchToday:', e);
    } finally {
      if (showSpinner) setIsFetching(false);
    }
  }, [user.id, sessionStartMs]);

  // ── initialise once after sync ────────────────────────────────────────────
  useEffect(() => {
    if (!hasSynced || !socket || initializedRef.current) return;
    initializedRef.current = true;

    // Pick up status from live presence if available
    const myPresence = realtimeStatuses.find(s => s.userId === user.id);
    const initStatus = (myPresence?.status as OfficeStatus) || OfficeStatus.AVAILABLE;
    setCurrentStatus(initStatus);
    currentStatusRef.current    = initStatus;
    statusChangeTimeRef.current = Date.now() + serverOffsetMs;

    // Tell server we're here (it already recorded login; this confirms status)
    socket.emit('status_change', {
      userId: user.id, userName: user.name,
      status: initStatus, role: user.role, activity: 1,
    });

    // Fetch stats & start polling
    fetchToday(true);
    pollRef.current = setInterval(() => fetchToday(false), POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasSynced, socket]); // eslint-disable-line

  // ── elapsed / status-duration ticking (display only) ─────────────────────
  useEffect(() => {
    if (!sessionStartMs) return;
    const tick = () => {
      const now = Date.now() + serverOffsetMs;
      setElapsedTime(now - sessionStartMs);
      setStatusDuration(now - statusChangeTimeRef.current);
    };
    tick();
    elapsedRef.current = setInterval(tick, 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [sessionStartMs, serverOffsetMs]);

  // ── sync status from server presence (admin-forced changes) ──────────────
  useEffect(() => {
    if (isChangingRef.current) return;
    const mine = realtimeStatuses.find(s => s.userId === user.id);
    if (!mine) return;
    const srv = mine.status as OfficeStatus;
    if (srv === currentStatusRef.current) return;
    setCurrentStatus(srv);
    currentStatusRef.current    = srv;
    statusChangeTimeRef.current = Date.now() + serverOffsetMs;
  }, [realtimeStatuses, user.id, serverOffsetMs]);

  // ── handle button click ───────────────────────────────────────────────────
  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket?.connected) { alert('Not connected. Please wait...'); return; }
    if (newStatus === currentStatus) return;

    isChangingRef.current = true;
    const now = Date.now() + serverOffsetMs;

    // Optimistic UI update
    setCurrentStatus(newStatus);
    currentStatusRef.current    = newStatus;
    statusChangeTimeRef.current = now;

    // Server computes the time delta and writes to day_summary immediately
    socket.emit('status_change', {
      userId: user.id, userName: user.name,
      status: newStatus, role: user.role, activity: 1,
    });

    // Refresh stats from DB after server has written (~800ms)
    setTimeout(() => {
      fetchToday(false);
      isChangingRef.current = false;
    }, 800);
  };

  // ── render ────────────────────────────────────────────────────────────────
  const cfg         = getStatusConfig(currentStatus);
  const CurrentIcon = cfg.icon;
  const myPresence  = realtimeStatuses.find(s => s.userId === user.id);
  const isActive    = myPresence?.activity === 1;

  const availableStatuses = (settings.availableStatuses || [
    OfficeStatus.AVAILABLE, OfficeStatus.LUNCH, OfficeStatus.SNACKS,
    OfficeStatus.REFRESHMENT_BREAK, OfficeStatus.QUALITY_FEEDBACK, OfficeStatus.CROSS_UTILIZATION,
  ]) as OfficeStatus[];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white mb-2">
            Welcome back, {user.name}! 👋
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            All timing tracked server-side · saved to database on every status change
          </p>
        </div>
        <button
          onClick={() => fetchToday(true)}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={2.5} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Status panel */}
        <div className="lg:col-span-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current Status</h2>
            {!hasSynced && <span className="text-xs text-amber-500 animate-pulse font-medium">Syncing…</span>}
          </div>

          {/* Active status banner */}
          <div className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br ${cfg.color} mb-6 shadow-lg`}>
            <div className="w-16 h-16 rounded-2xl bg-white/90 dark:bg-slate-900/90 flex items-center justify-center shadow-lg">
              <CurrentIcon className={`w-8 h-8 ${cfg.textColor}`} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-semibold text-white mb-1">{cfg.label}</h3>
              <p className="text-sm text-white/80 font-medium">{formatTime(statusDuration)}</p>
            </div>
            {isActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-xs font-semibold text-white">Active</span>
              </div>
            )}
          </div>

          {/* Status buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {availableStatuses.map((status) => {
              const sc = getStatusConfig(status);
              const SI = sc.icon;
              const sel = status === currentStatus;
              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={sel}
                  className={`relative p-4 rounded-2xl border-2 transition-all duration-200 ${
                    sel
                      ? `bg-gradient-to-br ${sc.color} border-transparent text-white shadow-lg`
                      : `bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ${sc.textColor}`
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <SI className="w-6 h-6" strokeWidth={2.5} />
                    <span className="text-sm font-semibold">{sc.label}</span>
                  </div>
                  {sel && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-lg" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Session timer */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Session Timer</h2>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-2xl shadow-indigo-500/25">
              <Clock className="w-16 h-16 text-white" strokeWidth={2} />
            </div>
            <div className="text-4xl font-semibold text-slate-900 dark:text-white mb-2 font-mono">
              {sessionStartMs ? formatTime(elapsedTime) : '--:--'}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total session time</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Login</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                {todayStats.loginTime
                  ? todayStats.loginTime.slice(0, 5)
                  : '--:--'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Now</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                {new Date(Date.now() + serverOffsetMs).toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's activity — from DB */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Today's Activity</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">Live from database · auto-refreshes every 30s</span>
        </div>

        {isFetching ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" strokeWidth={2} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Productive', value: todayStats.productiveMinutes,  icon: CheckCircle2,  color: 'from-emerald-500 to-teal-600' },
              { label: 'Lunch',      value: todayStats.lunchMinutes,       icon: Coffee,        color: 'from-orange-500 to-amber-600' },
              { label: 'Snacks',     value: todayStats.snacksMinutes,      icon: Cookie,        color: 'from-yellow-500 to-orange-500' },
              { label: 'Break',      value: todayStats.refreshmentMinutes, icon: Sparkles,      color: 'from-blue-500 to-cyan-600' },
              { label: 'Feedback',   value: todayStats.feedbackMinutes,    icon: MessageSquare, color: 'from-purple-500 to-pink-600' },
              { label: 'Cross-Util', value: todayStats.crossUtilMinutes,   icon: Users,         color: 'from-indigo-500 to-purple-600' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                    <stat.icon className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{stat.label}</span>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white font-mono">
                  {formatMinutes(stat.value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
