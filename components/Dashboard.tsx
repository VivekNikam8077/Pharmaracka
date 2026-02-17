import React, { useState, useEffect, useRef } from 'react';
import { User, AppSettings, RealtimeStatus, OfficeStatus } from '../types';
import { Socket } from 'socket.io-client';
import { 
  Clock, 
  Activity, 
  Coffee, 
  Cookie, 
  Sparkles, 
  MessageSquare, 
  Users, 
  CheckCircle2,
  Timer,
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

const SESSION_STATS_KEY = 'officely_session_stats_';
const IDLE_TRACK_KEY = 'officely_idle_track_v1';
const TIME_UPDATE_INTERVAL = 30_000;

interface SessionStats {
  date: string;
  loginTime: string;
  productiveMinutes: number;
  lunchMinutes: number;
  snacksMinutes: number;
  refreshmentMinutes: number;
  feedbackMinutes: number;
  crossUtilMinutes: number;
  lastSavedAt: number;
  currentStatus?: OfficeStatus;
  statusChangeMs?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  settings,
  socket,
  hasSynced,
  serverOffsetMs,
  realtimeStatuses,
}) => {
  const [currentStatus, setCurrentStatus] = useState<OfficeStatus>(OfficeStatus.AVAILABLE);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusDuration, setStatusDuration] = useState(0);
  const [dbSnapshot, setDbSnapshot] = useState<any>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [todayStats, setTodayStats] = useState({
    productiveMinutes: 0,
    lunchMinutes: 0,
    snacksMinutes: 0,
    refreshmentMinutes: 0,
    feedbackMinutes: 0,
    crossUtilMinutes: 0,
    totalMinutes: 0,
    idleMinutes: 0,
  });

  const statusChangeTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStatusRef = useRef<OfficeStatus>(OfficeStatus.AVAILABLE);
  const isChangingStatusRef = useRef(false);
  const didInitRef = useRef(false);

  const toISTDateString = (d: Date): string => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch (e) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  };

  const normalizeDbSessionState = (raw: any) => {
    if (!raw) return null;
    return {
      loginTime: raw.loginTime ?? raw.logintime,
      logoutTime: raw.logoutTime ?? raw.logouttime,
      productiveMinutes: raw.productiveMinutes ?? raw.productiveminutes,
      lunchMinutes: raw.lunchMinutes ?? raw.lunchminutes,
      snacksMinutes: raw.snacksMinutes ?? raw.snacksminutes,
      refreshmentMinutes: raw.refreshmentMinutes ?? raw.refreshmentminutes,
      feedbackMinutes: raw.feedbackMinutes ?? raw.feedbackminutes,
      crossUtilMinutes: raw.crossUtilMinutes ?? raw.crossutilminutes,
      totalMinutes: raw.totalMinutes ?? raw.totalminutes,
      isLeave: raw.isLeave ?? raw.isleave,
      lastupdate: raw.lastupdate ?? raw.lastUpdate,
    };
  };

  const normalizeOfficeStatus = (value: any): OfficeStatus => {
    const v = String(value || '').trim();
    if (!v) return OfficeStatus.AVAILABLE;

    // Handle common aliases / older labels
    const lower = v.toLowerCase();
    if (lower === 'feedback') return OfficeStatus.QUALITY_FEEDBACK;
    if (lower === 'quality feedback') return OfficeStatus.QUALITY_FEEDBACK;
    if (lower === 'break') return OfficeStatus.REFRESHMENT_BREAK;
    if (lower === 'refreshment') return OfficeStatus.REFRESHMENT_BREAK;
    if (lower === 'cross util') return OfficeStatus.CROSS_UTILIZATION;
    if (lower === 'cross-util') return OfficeStatus.CROSS_UTILIZATION;
    if (lower === 'cross utilization') return OfficeStatus.CROSS_UTILIZATION;

    // If it's already one of the enum values, keep it
    const all = Object.values(OfficeStatus) as string[];
    if (all.includes(v)) return v as OfficeStatus;
    return OfficeStatus.AVAILABLE;
  };

  const toISTTimeString = (d: Date): string => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const fetchDbSnapshot = async (todayOverride?: string) => {
    try {
      const now = Date.now() + serverOffsetMs;
      const today = todayOverride || toISTDateString(new Date(now));
      const serverIp = getBackendUrl();
      const response = await fetch(`${serverIp}/api/Office/session-state?userId=${user.id}&date=${today}`);
      const data = await response.json();
      if (data?.ok) {
        setDbSnapshot(normalizeDbSessionState(data.sessionState));
      }
    } catch (e) {
      // ignore
    }
  };

  const manualSyncNow = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    try {
      await saveToDatabase();
      await fetchDbSnapshot();
    } finally {
      setIsManualSyncing(false);
    }
  };

  const getBackendUrl = (): string => {
    try {
      const savedServer = localStorage.getItem('officely_server_ip');
      const isIpv4 = (v: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v);
      const envServer = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
      const localhostDefault = 'https://server2-e3p9.onrender.com';

      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isHttps = window.location.protocol === 'https:';
      const isRenderHost = /\.onrender\.com$/i.test(window.location.hostname);

      if (savedServer) {
        return (savedServer.startsWith('http://') || savedServer.startsWith('https://'))
          ? savedServer
          : (isIpv4(savedServer)
            ? `${isHttps ? 'https' : 'http'}://${savedServer}:3001`
            : `https://${savedServer}`);
      }

      if (envServer) return envServer;

      return isLocalhost
        ? localhostDefault
        : (isHttps || isRenderHost ? localhostDefault : `http://${window.location.hostname}:3001`);
    } catch (e) {}

    return 'https://server2-e3p9.onrender.com';
  };

  const parseISTLoginMs = (dateStr: string, loginTime: string): number | null => {
    try {
      const parts = String(loginTime || '').split(':').map((x) => Number(x));
      if (parts.length < 2) return null;
      const hh = String(parts[0] ?? 0).padStart(2, '0');
      const mm = String(parts[1] ?? 0).padStart(2, '0');
      const ss = String(parts[2] ?? 0).padStart(2, '0');
      const ms = new Date(`${dateStr}T${hh}:${mm}:${ss}+05:30`).getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch (e) {
      return null;
    }
  };

  const getCurrentSessionMinutes = (now: number): number => {
    return Math.floor((now - statusChangeTimeRef.current) / 60000);
  };

  const saveToLocalStorage = (stats: SessionStats) => {
    try {
      localStorage.setItem(`${SESSION_STATS_KEY}${user.id}`, JSON.stringify(stats));
    } catch (e) {
      console.error('[Dashboard] localStorage save failed:', e);
    }
  };

  const loadFromLocalStorage = (today: string): SessionStats | null => {
    try {
      const stored = localStorage.getItem(`${SESSION_STATS_KEY}${user.id}`);
      if (stored) {
        const stats: SessionStats = JSON.parse(stored);
        if (stats.date === today) return stats;
      }
    } catch (e) {}
    return null;
  };

  // ✅ SAVE TO DATABASE (called frequently)
  const saveToDatabase = async () => {
    if (!socket || !sessionStartTime) return;
    if (!socket.connected) return;
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const existing = loadFromLocalStorage(today);
    const base: SessionStats = existing || {
      date: today,
      loginTime: toISTTimeString(new Date(sessionStartTime)),
      productiveMinutes: 0,
      lunchMinutes: 0,
      snacksMinutes: 0,
      refreshmentMinutes: 0,
      feedbackMinutes: 0,
      crossUtilMinutes: 0,
      // Important: if we have no local cache yet, seed lastSavedAt from sessionStartTime.
      // This lets the first autosave catch up minutes since login instead of staying at 0.
      lastSavedAt: sessionStartTime,
    };

    // Keep local status timer fields up to date (for tab switch / reload stability)
    base.currentStatus = currentStatusRef.current;
    base.statusChangeMs = statusChangeTimeRef.current;

    // Persist only the new whole minutes since the last save
    const deltaMinutes = Math.max(0, Math.floor((now - (base.lastSavedAt || now)) / 60000));

    if (deltaMinutes > 0) {
      switch (normalizeOfficeStatus(currentStatusRef.current)) {
        case OfficeStatus.AVAILABLE:
          base.productiveMinutes += deltaMinutes;
          break;
        case OfficeStatus.LUNCH:
          base.lunchMinutes += deltaMinutes;
          break;
        case OfficeStatus.SNACKS:
          base.snacksMinutes += deltaMinutes;
          break;
        case OfficeStatus.REFRESHMENT_BREAK:
          base.refreshmentMinutes += deltaMinutes;
          break;
        case OfficeStatus.QUALITY_FEEDBACK:
          base.feedbackMinutes += deltaMinutes;
          break;
        case OfficeStatus.CROSS_UTILIZATION:
          base.crossUtilMinutes += deltaMinutes;
          break;
      }

      base.lastSavedAt = now;
    }

    // Always persist the latest status timer fields even if no whole minute elapsed.
    // This prevents statusDuration from resetting to 0 on tab switch/remount.
    saveToLocalStorage(base);

    const totalMinutes =
      base.productiveMinutes +
      base.lunchMinutes +
      base.snacksMinutes +
      base.refreshmentMinutes +
      base.feedbackMinutes +
      base.crossUtilMinutes;
    
    const loginTime = new Date(sessionStartTime).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Kolkata'
    });
    
    const logoutTime = new Date(now).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Kolkata'
    });
    
    socket.emit('save_daily_stats', {
      userId: user.id,
      userName: user.name,
      date: today,
      loginTime,
      logoutTime,
      productiveMinutes: base.productiveMinutes,
      lunchMinutes: base.lunchMinutes,
      snacksMinutes: base.snacksMinutes,
      refreshmentMinutes: base.refreshmentMinutes,
      feedbackMinutes: base.feedbackMinutes,
      crossUtilMinutes: base.crossUtilMinutes,
      totalMinutes,
      isLeave: false
    });

    setTimeout(() => {
      fetchDbSnapshot(today);
    }, 600);
    
    console.log('[Dashboard] 💾 Saved to DB:', { totalMinutes, deltaMinutes });
  };

  // ✅ INITIALIZE SESSION (load from DB and localStorage, use whichever is newer)
  useEffect(() => {
    if (!user.id || !socket) return;
    if (didInitRef.current) return;

    didInitRef.current = true;
    
    const initSession = async () => {
      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));

      // Load from localStorage
      const localStats = loadFromLocalStorage(today);

      const myPresence = Array.isArray(realtimeStatuses)
        ? realtimeStatuses.find((r) => String(r?.userId) === String(user.id))
        : undefined;
      const presenceStatus = myPresence?.status as OfficeStatus | undefined;
      const presenceLastUpdateMs = myPresence?.lastUpdate
        ? new Date(myPresence.lastUpdate).getTime()
        : NaN;
      const localInitialStatus = localStats?.currentStatus ? normalizeOfficeStatus(localStats.currentStatus) : undefined;
      const initialStatus: OfficeStatus = localInitialStatus || presenceStatus || OfficeStatus.AVAILABLE;
      const initialStatusTs = Number.isFinite(presenceLastUpdateMs)
        ? Math.min(now, presenceLastUpdateMs)
        : now;
      
      console.log('[Dashboard] 🔄 Initializing session...');
      
      // Load from database
      let dbStats: any = null;
      try {
        const serverIp = getBackendUrl();
        const response = await fetch(`${serverIp}/api/Office/session-state?userId=${user.id}&date=${today}`);
        const data = await response.json();
        if (data.ok) dbStats = normalizeDbSessionState(data.sessionState);
      } catch (e) {
        console.error('[Dashboard] DB fetch failed:', e);
      }

      setDbSnapshot(dbStats);
      
      // Local-first (for stability): if local cache exists for today, use it immediately.
      // We'll keep syncing to DB in the background.
      const useLocal = Boolean(localStats);
      
      console.log('[Dashboard] Data sources:', { 
        local: localStats?.productiveMinutes || 0, 
        db: dbStats?.productiveMinutes || 0,
        using: useLocal ? 'LOCAL' : 'DB'
      });
      
      if (useLocal && localStats) {
        // Use localStorage data
        const loginMs = parseISTLoginMs(today, localStats.loginTime);
        setSessionStartTime(loginMs ?? now);
        setCurrentStatus(initialStatus);
        currentStatusRef.current = initialStatus;
        const localStatusChangeMs = (typeof localStats.statusChangeMs === 'number' && Number.isFinite(localStats.statusChangeMs))
          ? Math.min(now, localStats.statusChangeMs)
          : NaN;
        statusChangeTimeRef.current = Number.isFinite(localStatusChangeMs) ? localStatusChangeMs : initialStatusTs;
        
        console.log('[Dashboard] ✅ Restored from localStorage:', localStats.productiveMinutes, 'mins');
        
      } else if (dbStats) {
        // Use database data (DB is source of truth). Some DBs may store blank/00:00:00 loginTime.
        const safeLoginTime = (dbStats.loginTime && dbStats.loginTime !== '00:00:00')
          ? dbStats.loginTime
          : toISTTimeString(new Date(now));

        const loginMs = parseISTLoginMs(today, safeLoginTime);
        setSessionStartTime(loginMs ?? now);
        setCurrentStatus(initialStatus);
        currentStatusRef.current = initialStatus;
        statusChangeTimeRef.current = initialStatusTs;
        
        // Save to localStorage
        const dbLastUpdateMs = dbStats.lastupdate ? new Date(dbStats.lastupdate).getTime() : NaN;
        const seededLastSavedAt = Number.isFinite(dbLastUpdateMs) ? Math.min(now, dbLastUpdateMs) : now;
        saveToLocalStorage({
          date: today,
          loginTime: safeLoginTime,
          productiveMinutes: dbStats.productiveMinutes || 0,
          lunchMinutes: dbStats.lunchMinutes || 0,
          snacksMinutes: dbStats.snacksMinutes || 0,
          refreshmentMinutes: dbStats.refreshmentMinutes || 0,
          feedbackMinutes: dbStats.feedbackMinutes || 0,
          crossUtilMinutes: dbStats.crossUtilMinutes || 0,
          lastSavedAt: seededLastSavedAt,
          currentStatus: initialStatus,
          statusChangeMs: initialStatusTs,
        });
        
        console.log('[Dashboard] ✅ Restored from database:', dbStats.productiveMinutes, 'mins');
        
      } else {
        // New session
        const loginTime = toISTTimeString(new Date(now));
        
        setSessionStartTime(now);
        setCurrentStatus(initialStatus);
        currentStatusRef.current = initialStatus;
        statusChangeTimeRef.current = initialStatusTs;
        
        saveToLocalStorage({
          date: today,
          loginTime,
          productiveMinutes: 0,
          lunchMinutes: 0,
          snacksMinutes: 0,
          refreshmentMinutes: 0,
          feedbackMinutes: 0,
          crossUtilMinutes: 0,
          lastSavedAt: now,
          currentStatus: initialStatus,
          statusChangeMs: initialStatusTs,
        });
        
        socket.emit('status_change', {
          userId: user.id,
          userName: user.name,
          status: initialStatus,
          role: user.role,
          activity: 1,
        });
        
        console.log('[Dashboard] 🆕 New session started');
      }
      
      // Start auto-save
      saveToDatabase();
    };
    
    initSession();
  }, [user.id, socket, serverOffsetMs]);

  // ✅ PERIODIC SAVE (every 30 seconds)
  useEffect(() => {
    if (!socket || !sessionStartTime) return;

    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
    }

    saveIntervalRef.current = setInterval(() => {
      saveToDatabase();
    }, TIME_UPDATE_INTERVAL);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [socket, sessionStartTime, currentStatus]);

  // ✅ UPDATE TIMER DISPLAY
  useEffect(() => {
    if (!sessionStartTime) return;

    const updateTimer = () => {
      const now = Date.now() + serverOffsetMs;
      setElapsedTime(Math.max(0, now - sessionStartTime));
      setStatusDuration(Math.max(0, now - statusChangeTimeRef.current));
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [sessionStartTime, serverOffsetMs]);

  // ✅ UPDATE STATS DISPLAY
  useEffect(() => {
    const updateStats = () => {
      if (!sessionStartTime) return;

      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));
      const localStats = loadFromLocalStorage(today);
      const dbBase = normalizeDbSessionState(dbSnapshot);

      const baseStats = localStats || (dbBase ? {
        date: today,
        loginTime: dbBase.loginTime || toISTTimeString(new Date(sessionStartTime)),
        productiveMinutes: dbBase.productiveMinutes || 0,
        lunchMinutes: dbBase.lunchMinutes || 0,
        snacksMinutes: dbBase.snacksMinutes || 0,
        refreshmentMinutes: dbBase.refreshmentMinutes || 0,
        feedbackMinutes: dbBase.feedbackMinutes || 0,
        crossUtilMinutes: dbBase.crossUtilMinutes || 0,
        lastSavedAt: (() => {
          const ms = dbBase.lastupdate ? new Date(dbBase.lastupdate).getTime() : NaN;
          return Number.isFinite(ms) ? Math.min(now, ms) : sessionStartTime;
        })(),
      } as SessionStats : null);

      let idleMinutes = 0;
      try {
        const raw = localStorage.getItem(IDLE_TRACK_KEY);
        const store = raw ? JSON.parse(raw) : null;
        const dayBucket = store && typeof store === 'object' ? (store as any)[today] : null;
        const userBucket = dayBucket && typeof dayBucket === 'object' ? (dayBucket as any)[user.id] : null;
        const idleTotalMs = (userBucket && typeof userBucket.idleTotalMs === 'number' && Number.isFinite(userBucket.idleTotalMs))
          ? userBucket.idleTotalMs
          : 0;
        const idleStartMs = (userBucket && typeof userBucket.idleStartMs === 'number' && Number.isFinite(userBucket.idleStartMs))
          ? userBucket.idleStartMs
          : null;
        const runningMs = (typeof idleStartMs === 'number') ? Math.max(0, now - idleStartMs) : 0;
        idleMinutes = Math.max(0, Math.floor((idleTotalMs + runningMs) / 60000));
      } catch (e) {}

      // Fallback: if idle store isn't present/populated, derive current idle time from realtime status.
      if (idleMinutes <= 0) {
        const myStatus = Array.isArray(realtimeStatuses)
          ? realtimeStatuses.find((r) => String(r?.userId) === String(user.id))
          : undefined;
        const rawActivity = typeof myStatus?.activity === 'number' ? myStatus.activity : 2;
        const lastAt = typeof myStatus?.activityUpdatedAt === 'number'
          ? myStatus.activityUpdatedAt
          : (typeof myStatus?.lastActivityAt === 'number' ? myStatus.lastActivityAt : undefined);

        if (rawActivity === 0 && typeof lastAt === 'number' && Number.isFinite(lastAt) && now >= lastAt) {
          idleMinutes = Math.max(0, Math.floor((now - lastAt) / 60000));
        }
      }

      const stats = {
        productiveMinutes: baseStats?.productiveMinutes || 0,
        lunchMinutes: baseStats?.lunchMinutes || 0,
        snacksMinutes: baseStats?.snacksMinutes || 0,
        refreshmentMinutes: baseStats?.refreshmentMinutes || 0,
        feedbackMinutes: baseStats?.feedbackMinutes || 0,
        crossUtilMinutes: baseStats?.crossUtilMinutes || 0,
        totalMinutes: 0,
        idleMinutes,
      };

      // If this tab is force-logged-out, the server disconnects the socket.
      // In that case we must NOT keep accumulating minutes locally.
      const canAccumulate = Boolean(socket && socket.connected);
      const deltaMinutes = canAccumulate && baseStats?.lastSavedAt
        ? Math.max(0, Math.floor((now - baseStats.lastSavedAt) / 60000))
        : 0;

      if (deltaMinutes > 0) {
        switch (normalizeOfficeStatus(currentStatusRef.current)) {
          case OfficeStatus.AVAILABLE:
            stats.productiveMinutes += deltaMinutes;
            break;
          case OfficeStatus.LUNCH:
            stats.lunchMinutes += deltaMinutes;
            break;
          case OfficeStatus.SNACKS:
            stats.snacksMinutes += deltaMinutes;
            break;
          case OfficeStatus.REFRESHMENT_BREAK:
            stats.refreshmentMinutes += deltaMinutes;
            break;
          case OfficeStatus.QUALITY_FEEDBACK:
            stats.feedbackMinutes += deltaMinutes;
            break;
          case OfficeStatus.CROSS_UTILIZATION:
            stats.crossUtilMinutes += deltaMinutes;
            break;
        }
      }

      stats.totalMinutes =
        stats.productiveMinutes +
        stats.lunchMinutes +
        stats.snacksMinutes +
        stats.refreshmentMinutes +
        stats.feedbackMinutes +
        stats.crossUtilMinutes;

      setTodayStats(stats);
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime, user.id, serverOffsetMs, socket]);

  // ✅ HANDLE STATUS CHANGE
  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket || !sessionStartTime) return;
    if (!socket.connected) return;

    const nextStatus = normalizeOfficeStatus(newStatus);
    if (nextStatus === currentStatusRef.current) return;

    isChangingStatusRef.current = true;

    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const localStats = loadFromLocalStorage(today) || {
      date: today,
      loginTime: toISTTimeString(new Date(sessionStartTime)),
      productiveMinutes: 0,
      lunchMinutes: 0,
      snacksMinutes: 0,
      refreshmentMinutes: 0,
      feedbackMinutes: 0,
      crossUtilMinutes: 0,
      lastSavedAt: now,
    };

    const prevSavedAt = localStats.lastSavedAt || now;
    const deltaMinutes = Math.max(0, Math.floor((now - prevSavedAt) / 60000));

    if (deltaMinutes > 0) {
      switch (normalizeOfficeStatus(currentStatusRef.current)) {
        case OfficeStatus.AVAILABLE:
          localStats.productiveMinutes += deltaMinutes;
          break;
        case OfficeStatus.LUNCH:
          localStats.lunchMinutes += deltaMinutes;
          break;
        case OfficeStatus.SNACKS:
          localStats.snacksMinutes += deltaMinutes;
          break;
        case OfficeStatus.REFRESHMENT_BREAK:
          localStats.refreshmentMinutes += deltaMinutes;
          break;
        case OfficeStatus.QUALITY_FEEDBACK:
          localStats.feedbackMinutes += deltaMinutes;
          break;
        case OfficeStatus.CROSS_UTILIZATION:
          localStats.crossUtilMinutes += deltaMinutes;
          break;
      }
    }

    localStats.lastSavedAt = now;
    saveToLocalStorage(localStats);

    setCurrentStatus(nextStatus);
    currentStatusRef.current = nextStatus;
    statusChangeTimeRef.current = now;

    // Persist status timer locally immediately so the state timer won't reset on tab switch.
    saveToLocalStorage({
      ...localStats,
      lastSavedAt: now,
      currentStatus: nextStatus,
      statusChangeMs: now,
    });

    socket.emit('status_change', {
      userId: user.id,
      userName: user.name,
      status: nextStatus,
      role: user.role,
      activity: 1,
    });

    setTimeout(() => {
      saveToDatabase();
      isChangingStatusRef.current = false;
    }, 500);
  };

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusConfig = (status: OfficeStatus) => {
    switch (status) {
      case OfficeStatus.AVAILABLE:
        return { icon: CheckCircle2, color: 'from-emerald-500 to-teal-600', textColor: 'text-emerald-600', label: 'Available' };
      case OfficeStatus.LUNCH:
        return { icon: Coffee, color: 'from-orange-500 to-amber-600', textColor: 'text-orange-600', label: 'Lunch' };
      case OfficeStatus.SNACKS:
        return { icon: Cookie, color: 'from-yellow-500 to-orange-500', textColor: 'text-yellow-600', label: 'Snacks' };
      case OfficeStatus.REFRESHMENT_BREAK:
        return { icon: Sparkles, color: 'from-blue-500 to-cyan-600', textColor: 'text-blue-600', label: 'Break' };
      case OfficeStatus.QUALITY_FEEDBACK:
        return { icon: MessageSquare, color: 'from-purple-500 to-pink-600', textColor: 'text-purple-600', label: 'Feedback' };
      case OfficeStatus.CROSS_UTILIZATION:
        return { icon: Users, color: 'from-indigo-500 to-purple-600', textColor: 'text-indigo-600', label: 'Cross-Util' };
      default:
        return { icon: Activity, color: 'from-slate-500 to-slate-600', textColor: 'text-slate-600', label: status };
    }
  };

  const currentConfig = getStatusConfig(currentStatus);
  const CurrentIcon = currentConfig.icon;
  const availableStatuses = settings.availableStatuses || [
    OfficeStatus.AVAILABLE, OfficeStatus.LUNCH, OfficeStatus.SNACKS,
    OfficeStatus.REFRESHMENT_BREAK, OfficeStatus.QUALITY_FEEDBACK, OfficeStatus.CROSS_UTILIZATION,
  ];

  const myStatus = realtimeStatuses.find(s => s.userId === user.id);
  const allowIdleTracking = currentStatus === OfficeStatus.AVAILABLE;
  const rawActivity = typeof myStatus?.activity === 'number' ? myStatus.activity : 2;
  const lastAt = typeof myStatus?.activityUpdatedAt === 'number'
    ? myStatus.activityUpdatedAt
    : (typeof myStatus?.lastActivityAt === 'number' ? myStatus.lastActivityAt : undefined);
  const hasActivityTs = allowIdleTracking && typeof lastAt === 'number' && Number.isFinite(lastAt);
  const activity = hasActivityTs ? rawActivity : 2;
  const isIdle = allowIdleTracking && activity === 0;
  const isActive = allowIdleTracking && activity === 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white mb-2">
          Welcome back, {user.name}! 👋
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Auto-saves every 30 seconds • Data persists across devices
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Current Status</h2>

          <div className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br ${currentConfig.color} mb-6 shadow-lg`}>
            <div className="w-16 h-16 rounded-2xl bg-white/90 flex items-center justify-center shadow-lg">
              <CurrentIcon className={`w-8 h-8 ${currentConfig.textColor}`} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-semibold text-white mb-1">{currentConfig.label}</h3>
              <p className="text-sm text-white/80 font-medium">{formatTime(statusDuration)}</p>
            </div>
            {(isActive || isIdle) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-xs font-semibold text-white">
                  {isIdle ? 'Idle' : 'Active'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {availableStatuses.map((status) => {
              const config = getStatusConfig(status);
              const Icon = config.icon;
              const isSelected = status === currentStatus;

              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={isSelected}
                  className={`relative p-4 rounded-2xl border-2 transition-all ${
                    isSelected 
                      ? `bg-gradient-to-br ${config.color} border-transparent text-white shadow-lg` 
                      : `bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 ${config.textColor}`
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icon className="w-6 h-6" strokeWidth={2.5} />
                    <span className="text-sm font-semibold">{config.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Session Timer</h2>
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-2xl">
              <Clock className="w-16 h-16 text-white" strokeWidth={2} />
            </div>
            <div className="text-4xl font-semibold text-slate-900 dark:text-white mb-2 font-mono">
              {formatTime(elapsedTime)}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total session time</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Login</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                {sessionStartTime ? new Date(sessionStartTime).toLocaleTimeString('en-IN', { 
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                }) : '--:--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Today's Activity</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              <span className="font-mono">
                {sessionStartTime
                  ? new Date(sessionStartTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                  : '--:--'}
              </span>
              <span className="mx-2">-</span>
              <span className="font-mono">{formatMinutes(todayStats.productiveMinutes)}</span>
              <span className="ml-1">productive</span>
            </div>
          </div>
          <button
            onClick={manualSyncNow}
            disabled={!socket?.connected || isManualSyncing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Timer className="w-4 h-4" />
            {isManualSyncing ? 'Syncing…' : 'Manual Sync'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Productive', value: todayStats.productiveMinutes, icon: CheckCircle2, color: 'from-emerald-500 to-teal-600' },
            { label: 'Idle', value: todayStats.idleMinutes, icon: Activity, color: 'from-slate-600 to-slate-800' },
            { label: 'Lunch', value: todayStats.lunchMinutes, icon: Coffee, color: 'from-orange-500 to-amber-600' },
            { label: 'Snacks', value: todayStats.snacksMinutes, icon: Cookie, color: 'from-yellow-500 to-orange-500' },
            { label: 'Break', value: todayStats.refreshmentMinutes, icon: Sparkles, color: 'from-blue-500 to-cyan-600' },
            { label: 'Feedback', value: todayStats.feedbackMinutes, icon: MessageSquare, color: 'from-purple-500 to-pink-600' },
            { label: 'Cross-Util', value: todayStats.crossUtilMinutes, icon: Users, color: 'from-indigo-500 to-purple-600' },
          ].map((stat) => (
            <div key={stat.label} className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
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

        {dbSnapshot && (
          <div className="mt-6 p-4 rounded-2xl bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">DB (Last Saved)</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {dbSnapshot.lastupdate ? String(dbSnapshot.lastupdate) : ''}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">Prod: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.productiveMinutes || 0)}</span></div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Lunch: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.lunchMinutes || 0)}</span></div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Snacks: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.snacksMinutes || 0)}</span></div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Break: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.refreshmentMinutes || 0)}</span></div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Feedback: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.feedbackMinutes || 0)}</span></div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Cross: <span className="font-mono text-slate-900 dark:text-white">{formatMinutes(dbSnapshot.crossUtilMinutes || 0)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
