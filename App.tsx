import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, DaySummary, OfficeStatus, StatusLogEntry, UserRole, RealtimeStatus, AppSettings } from './types';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import Login from './components/Login';
import Management from './components/Management';
import LiveMonitor from './components/LiveMonitor';
import Settings from './components/Settings';

// ==================== CONSTANTS ====================
const DEFAULT_SETTINGS: AppSettings = {
  siteName: 'Pharmarack',
  logoUrl: '',
  loginBgUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
  darkMode: false,
  availableStatuses: Object.values(OfficeStatus).filter(s => s !== OfficeStatus.LEAVE)
};

const STORAGE_KEYS = {
  ARCHIVE: 'officely_archive_data',
  ARCHIVE_VERSION: 'officely_archive_seed_version',
  LAST_VIEW: 'officely_last_view',
  SETTINGS: 'officely_settings',
  LOGOUT_BROADCAST: 'officely_logout_broadcast',
  IDLE_TRACK: 'officely_idle_track_v1',
  AUTH: 'officely_auth',
  USER: 'officely_user',
  USERS: 'officely_users',
  SERVER_IP: 'officely_server_ip',
  SESSION_EMAIL_PREFIX: 'officely_session_email_',
} as const;

// ==================== UTILITY FUNCTIONS ====================
const utils = {
  toISTDateString: (d: Date): string => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch (e) {
      return utils.toDateString(d);
    }
  },

  toISTTimeHHMM: (d: Date): string => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch (e) {
      return d.toTimeString().slice(0, 5);
    }
  },

  toDateString: (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  safeParseJson: (raw: string | null): any => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  istStartOfDayMs: (ms: number): number => {
    const day = utils.toISTDateString(new Date(ms));
    return new Date(`${day}T00:00:00+05:30`).getTime();
  },

  createSessionId: (): string => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
      }
    } catch (e) {}
    return `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  },

  // FIX: Always use email for session key
  getSessionKey: (email: string): string => {
    return `${STORAGE_KEYS.SESSION_EMAIL_PREFIX}${String(email || '').toLowerCase().trim()}`;
  },

  clearAllSessionData: (user?: User | null) => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.LAST_VIEW);

    if (user?.email) {
      const sessionEmailKey = utils.getSessionKey(user.email);
      localStorage.removeItem(sessionEmailKey);
    }
  },
};

// ==================== ARCHIVE COMPUTATION ====================
const computeArchiveFromHistory = (
  historyRows: any[],
  presence: RealtimeStatus[],
  nowMs: number
): DaySummary[] => {
  const byUser = new Map<string, Array<{ status: string; ts: number }>>();

  for (const row of Array.isArray(historyRows) ? historyRows : []) {
    const userId = String(row?.userId || '');
    const rawStatus = String(row?.status || '');
    const status = rawStatus === 'Feedback' ? OfficeStatus.QUALITY_FEEDBACK : rawStatus;
    const ts = new Date(row?.timestamp).getTime();

    if (!userId || !status || !Number.isFinite(ts)) continue;

    const arr = byUser.get(userId) || [];
    arr.push({ status, ts });
    byUser.set(userId, arr);
  }

  const presenceByUser = new Map<string, RealtimeStatus>();
  for (const p of Array.isArray(presence) ? presence : []) {
    if (p?.userId) presenceByUser.set(p.userId, p);
  }

  const summaries = new Map<string, {
    userId: string;
    date: string;
    startTs: number;
    endTs: number;
    productiveMinutes: number;
    lunchMinutes: number;
    snacksMinutes: number;
    refreshmentMinutes: number;
    feedbackMinutes: number;
    crossUtilMinutes: number;
    isLeave?: boolean;
  }>();

  const addMinutes = (s: any, status: string, minutes: number) => {
    if (minutes <= 0) return;
    if (status === OfficeStatus.AVAILABLE) s.productiveMinutes += minutes;
    else if (status === OfficeStatus.LUNCH) s.lunchMinutes += minutes;
    else if (status === OfficeStatus.SNACKS) s.snacksMinutes += minutes;
    else if (status === OfficeStatus.REFRESHMENT_BREAK) s.refreshmentMinutes += minutes;
    else if (status === OfficeStatus.QUALITY_FEEDBACK) s.feedbackMinutes += minutes;
    else if (status === OfficeStatus.CROSS_UTILIZATION) s.crossUtilMinutes += minutes;
    else if (status === OfficeStatus.LEAVE) s.isLeave = true;
  };

  for (const [userId, events] of byUser.entries()) {
    const sorted = events.slice().sort((a, b) => a.ts - b.ts);

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];

      const startTs = cur.ts;
      let endTs = next ? next.ts : startTs;

      if (!next) {
        const pres = presenceByUser.get(userId);
        if (pres) {
          const presTs = new Date((pres as any).lastUpdate).getTime();
          if (Number.isFinite(presTs) && presTs === startTs && String((pres as any).status) === cur.status) {
            endTs = nowMs;
          }
        }
      }

      let cursor = startTs;
      while (cursor < endTs) {
        const dayStart = utils.istStartOfDayMs(cursor);
        const dayEnd = dayStart + 86400000;
        const chunkEnd = Math.min(endTs, dayEnd);
        const minutes = Math.max(0, Math.floor((chunkEnd - cursor) / 60000));

        if (minutes > 0) {
          const key2 = `${userId}::${utils.toISTDateString(new Date(cursor))}`;
          const existing2 = summaries.get(key2);
          const s2 = existing2 || {
            userId,
            date: utils.toISTDateString(new Date(cursor)),
            startTs: cursor,
            endTs: chunkEnd,
            productiveMinutes: 0,
            lunchMinutes: 0,
            snacksMinutes: 0,
            refreshmentMinutes: 0,
            feedbackMinutes: 0,
            crossUtilMinutes: 0,
          };
          s2.startTs = Math.min(s2.startTs, cursor);
          s2.endTs = Math.max(s2.endTs, chunkEnd);
          addMinutes(s2, cur.status, minutes);
          summaries.set(key2, s2);
        }
        cursor = chunkEnd;
      }
    }
  }

  const result: DaySummary[] = [];
  for (const s of summaries.values()) {
    const totalMinutes = s.productiveMinutes + s.lunchMinutes + s.snacksMinutes +
      s.refreshmentMinutes + s.feedbackMinutes + s.crossUtilMinutes;
    result.push({
      userId: s.userId,
      date: s.date,
      loginTime: utils.toISTTimeHHMM(new Date(s.startTs)),
      logoutTime: utils.toISTTimeHHMM(new Date(s.endTs)),
      productiveMinutes: s.productiveMinutes,
      lunchMinutes: s.lunchMinutes,
      snacksMinutes: s.snacksMinutes,
      refreshmentMinutes: s.refreshmentMinutes,
      feedbackMinutes: s.feedbackMinutes,
      crossUtilMinutes: s.crossUtilMinutes,
      totalMinutes,
      isLeave: s.isLeave,
    });
  }

  return result;
};

// ==================== STORAGE MANAGER ====================
class StorageManager {
  static getAuth(): User | null {
    const stored = localStorage.getItem(STORAGE_KEYS.AUTH);
    return utils.safeParseJson(stored);
  }

  static saveAuth(user: User) {
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(user));
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  static getUsers(): User[] {
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    const parsed = utils.safeParseJson(stored);
    return Array.isArray(parsed) ? parsed : [];
  }

  static saveUsers(users: User[]) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }

  static getSettings(): AppSettings {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const parsed = utils.safeParseJson(stored);
    return parsed || DEFAULT_SETTINGS;
  }

  static saveSettings(settings: AppSettings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  static getArchive(): DaySummary[] {
    const stored = localStorage.getItem(STORAGE_KEYS.ARCHIVE);
    const parsed = utils.safeParseJson(stored);
    return Array.isArray(parsed) ? parsed : [];
  }

  static saveArchive(archive: DaySummary[]) {
    localStorage.setItem(STORAGE_KEYS.ARCHIVE, JSON.stringify(archive));
  }

  static getLastView(): 'dashboard' | 'monitor' | 'analytics' | 'management' | 'settings' {
    const saved = localStorage.getItem(STORAGE_KEYS.LAST_VIEW);
    if (saved === 'dashboard' || saved === 'monitor' || saved === 'analytics' ||
      saved === 'management' || saved === 'settings') {
      return saved;
    }
    return 'dashboard';
  }

  static saveLastView(view: string) {
    localStorage.setItem(STORAGE_KEYS.LAST_VIEW, view);
  }

  // FIX: Always use email for session ID storage
  static getOrCreateSessionId(email: string): string {
    const key = utils.getSessionKey(email);
    const existing = localStorage.getItem(key);
    if (existing) {
      console.log('[storage] Using existing sessionId for email:', email);
      return existing;
    }

    const newSessionId = utils.createSessionId();
    localStorage.setItem(key, newSessionId);
    console.log('[storage] Created new sessionId for email:', email, newSessionId);
    return newSessionId;
  }
}

// ==================== MAIN APP COMPONENT ====================
const App: React.FC = () => {
  // ==================== STATE ====================
  const [user, setUser] = useState<User | null>(() => StorageManager.getAuth());
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState<'dashboard' | 'monitor' | 'analytics' | 'management' | 'settings'>(
    () => StorageManager.getLastView()
  );
  const [users, setUsers] = useState<User[]>(() => StorageManager.getUsers());
  const [performanceHistory, setPerformanceHistory] = useState<DaySummary[]>(() => StorageManager.getArchive());
  const [hasSynced, setHasSynced] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => StorageManager.getSettings());
  const [realtimeStatuses, setRealtimeStatuses] = useState<RealtimeStatus[]>([]);
  const [forceLogoutFlags, setForceLogoutFlags] = useState<Set<string>>(new Set());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loginError, setLoginError] = useState<string>('');
  const [socketReconnectTrigger, setSocketReconnectTrigger] = useState(0);

  // ==================== REFS ====================
  const socketRef = useRef<Socket | null>(null);
  const realtimeStatusesRef = useRef<RealtimeStatus[]>([]);
  const serverOffsetRef = useRef(0);
  const activityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoggingOutRef = useRef(false);
  const isLoggedInRef = useRef(false);
  const freshLoginRef = useRef(false); // FIX: Track fresh login
  const applyLogoutRef = useRef<(opts?: any) => void>(() => {});

  const clearDashboardSessionStatsCache = useCallback((userId?: string | null) => {
    if (!userId) return;
    try {
      localStorage.removeItem(`officely_session_stats_${userId}`);
    } catch (e) {}
  }, []);

  // ==================== LOGOUT HANDLER ====================
  const applyLogout = useCallback(async (opts?: {
    auth?: User | null;
    broadcast?: boolean;
    reason?: string;
    skipEmit?: boolean;
  }) => {
    if (isLoggingOutRef.current) {
      console.log('[logout] Already logging out, skipping...');
      return;
    }

    isLoggingOutRef.current = true;
    isLoggedInRef.current = false;
    freshLoginRef.current = false; // FIX: Clear fresh login flag

    const auth = opts?.auth || user;
    const broadcast = Boolean(opts?.broadcast);
    const skipEmit = Boolean(opts?.skipEmit);

    console.log('[logout] Starting logout process', {
      userId: auth?.id,
      email: auth?.email,
      reason: opts?.reason,
      broadcast,
      skipEmit
    });

    try {
      if (activityPollRef.current) {
        console.log('[logout] Stopping activity poll');
        clearInterval(activityPollRef.current);
        activityPollRef.current = null;
      }

      const sock = socketRef.current;
      
      if (!skipEmit && auth?.id && sock?.connected) {
        console.log('[logout] Emitting user_logout to server');
        sock.emit('user_logout', auth.id);
        
        // Give time for logout message to be sent
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (sock) {
        console.log('[logout] Disconnecting socket');
        sock.removeAllListeners();
        sock.disconnect();
      }

      // FIX: Clear socketRef AFTER disconnect completes to allow reconnection
      setTimeout(() => {
        socketRef.current = null;
        setSocket(null);
        console.log('[logout] Socket ref cleared, triggering reconnection');
        
        // Trigger socket recreation
        setSocketReconnectTrigger(prev => prev + 1);
      }, 300);

      console.log('[logout] Clearing storage');
      utils.clearAllSessionData(auth);

      console.log('[logout] Clearing presence state');
      setRealtimeStatuses([]);
      realtimeStatusesRef.current = [];

      console.log('[logout] Resetting state');
      // Don't set socket to null here - let the timeout handle it
      setUser(null);
      setView('dashboard');
      setPerformanceHistory([]);
      setHasSynced(false);
      setLoginError('');
      setIsConnected(false);

      if (broadcast) {
        console.log('[logout] Broadcasting to other tabs');
        try {
          localStorage.setItem(STORAGE_KEYS.LOGOUT_BROADCAST, JSON.stringify({
            ts: Date.now(),
            reason: opts?.reason || 'logout',
            userId: auth?.id || null,
            email: auth?.email || null,
          }));
          setTimeout(() => {
            localStorage.removeItem(STORAGE_KEYS.LOGOUT_BROADCAST);
          }, 1000);
        } catch (e) {
          console.error('[logout] Failed to broadcast:', e);
        }
      }

      console.log('[logout] Logout complete');
    } catch (error) {
      console.error('[logout] Error during logout:', error);
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 500);
    }
  }, [user]);

  useEffect(() => {
    applyLogoutRef.current = applyLogout;
  }, [applyLogout]);

  useEffect(() => {
    isLoggedInRef.current = user !== null;
  }, [user]);

  // ==================== STORAGE EVENT LISTENER (CROSS-TAB SYNC) ====================
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (isLoggingOutRef.current) return;

      if (e.key === STORAGE_KEYS.AUTH && e.newValue === null) {
        console.log('[storage] Auth removed in another tab');
        let oldAuth: User | null = null;
        try {
          if (e.oldValue) oldAuth = JSON.parse(e.oldValue);
        } catch (err) {}
        applyLogoutRef.current({ auth: oldAuth, broadcast: false, reason: 'auth_removed', skipEmit: true });
        return;
      }

      if (e.key === STORAGE_KEYS.LOGOUT_BROADCAST && e.newValue) {
        console.log('[storage] Logout broadcast received');
        let payload: any = null;
        try {
          payload = JSON.parse(e.newValue);
        } catch (err) {}

        if (!user || !payload?.userId || payload.userId === user.id) {
          applyLogoutRef.current({ auth: payload, broadcast: false, reason: 'logout_broadcast', skipEmit: true });
        }
      }

      // FIX: Check email-based session key
      if (user?.email && e.key === utils.getSessionKey(user.email) && e.newValue !== e.oldValue) {
        console.log('[storage] Session ID changed, another tab took over');
        applyLogoutRef.current({ auth: user, broadcast: false, reason: 'session_takeover', skipEmit: true });
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  // ==================== DEBUG SESSION FUNCTION ====================
  const debugSession = useCallback(async () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) return;

    const auth = StorageManager.getAuth();
    if (!auth?.email) {
      console.log('[debug] No stored auth or email');
      return;
    }

    const emailSessionId = StorageManager.getOrCreateSessionId(auth.email);
    
    console.log('[debug] Session IDs:', {
      userId: auth.id,
      email: auth.email,
      emailSessionId,
    });

    try {
      const serverIp = localStorage.getItem(STORAGE_KEYS.SERVER_IP) || 'https://server2-e3p9.onrender.com';
      const res = await fetch(`${serverIp}/api/Office/debug_session?userId=${auth.id}`);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        return;
      }
      if (!ct.toLowerCase().includes('application/json')) {
        return;
      }
      const data = await res.json();
      console.log('[debug] Server state:', data);
    } catch (e) {
      console.error('[debug] Failed to fetch server state:', e);
    }
  }, []);

  // ==================== SOCKET CONNECTION ====================
  useEffect(() => {
    if (socketRef.current) return;

    console.log('[socket] Initializing connection');

    const storedArchive = StorageManager.getArchive();
    if (storedArchive.length > 0) {
      setPerformanceHistory(storedArchive);
    }

    const savedServer = localStorage.getItem(STORAGE_KEYS.SERVER_IP);
    const isIpv4 = (v: string) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v);
    const envServer = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
    const localhostDefault = 'https://server2-e3p9.onrender.com';

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';
    const isRenderHost = /\.onrender\.com$/i.test(window.location.hostname);

    const serverUrl = savedServer
      ? (savedServer.startsWith('http://') || savedServer.startsWith('https://')
        ? savedServer
        : (isIpv4(savedServer)
          ? `http://${savedServer}:3001`
          : `https://${savedServer}`))
      : (envServer
        ? envServer
        : ((isHttps || isRenderHost)
          ? localhostDefault
          : (isLocalhost
            ? localhostDefault
            : `http://${window.location.hostname}:3001`)));

    console.log(`[socket] Connecting to: ${serverUrl}`);

    const newSocket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    setRealtimeStatuses([]);
    realtimeStatusesRef.current = [];

    // ==================== ACTIVITY POLLING ====================
    const pollId = setInterval(async () => {
      if (!isLoggedInRef.current) {
        console.log('[activity] Skipping poll - not logged in');
        return;
      }

      try {
        const res = await fetch(`${serverUrl}/api/Office/status`);
        if (!res.ok) {
          console.warn('[activity] Poll failed', res.status);
          return;
        }
        const json = await res.json();
        const snapshot = Array.isArray(json?.snapshot)
          ? json.snapshot
          : (Array.isArray(json?.presence) ? json.presence : []);
        if (snapshot.length === 0) return;

        setRealtimeStatuses((prev) => {
          const nowMs = Date.now() + serverOffsetRef.current;
          const dayKey = utils.toISTDateString(new Date(nowMs));
          const idleStoreRaw = utils.safeParseJson(localStorage.getItem(STORAGE_KEYS.IDLE_TRACK));
          const idleStore: any = (idleStoreRaw && typeof idleStoreRaw === 'object') ? idleStoreRaw : {};
          const dayBucket: any = (idleStore[dayKey] && typeof idleStore[dayKey] === 'object') ? idleStore[dayKey] : {};

          const byId = new Map<string, RealtimeStatus>(
            prev.map((p) => [p.userId, p] as const)
          );

          for (const s of snapshot) {
            const userId = String((s as any)?.userId ?? (s as any)?.user_id ?? '').trim();
            if (!userId) continue;

            const existing = byId.get(userId);

            const rawActivityOrStatus = (s as any)?.activity;
            const rawStatusField = (s as any)?.status;
            const nextActivityRaw = Number(
              (typeof rawActivityOrStatus === 'number' || typeof rawActivityOrStatus === 'string')
                ? rawActivityOrStatus
                : ((typeof rawStatusField === 'number' || typeof rawStatusField === 'string') ? rawStatusField : undefined)
            );
            const nextActivity = (nextActivityRaw === 0 || nextActivityRaw === 1 || nextActivityRaw === 2)
              ? (nextActivityRaw as 0 | 1 | 2)
              : undefined;
            const updatedAtRaw = (s as any)?.lastActivityAt ?? (s as any)?.updatedAt ?? (s as any)?.updated_at;
            let nextUpdatedAt: number | undefined;
            if (typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw)) {
              nextUpdatedAt = updatedAtRaw;
            } else if (typeof updatedAtRaw === 'string' && updatedAtRaw.trim()) {
              const raw = updatedAtRaw.trim();
              // Postgres bigint can arrive as numeric string
              if (/^\d+$/.test(raw)) {
                const n = Number(raw);
                nextUpdatedAt = Number.isFinite(n) ? n : undefined;
              } else {
                const parsed = Date.parse(raw);
                nextUpdatedAt = Number.isFinite(parsed) ? parsed : undefined;
              }
            }

            // Normalize seconds -> ms
            if (typeof nextUpdatedAt === 'number' && Number.isFinite(nextUpdatedAt) && nextUpdatedAt < 10_000_000_000) {
              nextUpdatedAt = nextUpdatedAt * 1000;
            }

            const prevActivity = (existing && typeof existing.activity === 'number') ? existing.activity : undefined;
            const prevIdleStart = dayBucket?.[userId]?.idleStartMs;
            const prevIdleStartMs = (typeof prevIdleStart === 'number' && Number.isFinite(prevIdleStart)) ? prevIdleStart : null;
            const prevIdleTotalMsRaw = dayBucket?.[userId]?.idleTotalMs;
            const prevIdleTotalMs = (typeof prevIdleTotalMsRaw === 'number' && Number.isFinite(prevIdleTotalMsRaw)) ? prevIdleTotalMsRaw : 0;

            const effectiveTs = (typeof nextUpdatedAt === 'number' && Number.isFinite(nextUpdatedAt)) ? nextUpdatedAt : nowMs;
            const nextIsIdle = nextActivity === 0;
            const prevIsIdle = prevActivity === 0;

            const payloadStatusRaw = (s as any)?.status;
            const payloadStatus = (typeof payloadStatusRaw === 'string' && payloadStatusRaw.trim())
              ? payloadStatusRaw.trim()
              : undefined;
            const currentStatus = ((existing?.status || payloadStatus || OfficeStatus.AVAILABLE) as OfficeStatus);
            const allowIdleTracking = currentStatus === OfficeStatus.AVAILABLE;

            if (!allowIdleTracking) {
              if (typeof prevIdleStartMs === 'number') {
                const delta = Math.max(0, effectiveTs - prevIdleStartMs);
                dayBucket[userId] = {
                  ...(dayBucket[userId] || {}),
                  idleStartMs: null,
                  idleTotalMs: prevIdleTotalMs + delta,
                };
              }
            } else if (nextIsIdle && (typeof prevIdleStartMs !== 'number')) {
              dayBucket[userId] = {
                ...(dayBucket[userId] || {}),
                idleStartMs: effectiveTs,
                idleTotalMs: prevIdleTotalMs,
              };
            } else if (nextIsIdle && !prevIsIdle) {
              dayBucket[userId] = {
                ...(dayBucket[userId] || {}),
                idleStartMs: effectiveTs,
                idleTotalMs: prevIdleTotalMs,
              };
            } else if (!nextIsIdle) {
              // Close any open idle window as soon as we are not idle,
              // even if prevActivity is missing (common after reload).
              if (typeof prevIdleStartMs === 'number') {
                const delta = Math.max(0, effectiveTs - prevIdleStartMs);
                dayBucket[userId] = {
                  ...(dayBucket[userId] || {}),
                  idleStartMs: null,
                  idleTotalMs: prevIdleTotalMs + delta,
                };
              } else if (prevIsIdle) {
                dayBucket[userId] = {
                  ...(dayBucket[userId] || {}),
                  idleStartMs: null,
                  idleTotalMs: prevIdleTotalMs,
                };
              }
            }

            const existingLast = typeof existing?.lastActivityAt === 'number' ? existing.lastActivityAt : undefined;
            const shouldBump = typeof nextUpdatedAt === 'number' && (!existingLast || nextUpdatedAt > existingLast);

            const didActivityChange = typeof nextActivity === 'number'
              && typeof prevActivity === 'number'
              && nextActivity !== prevActivity;

            const shouldInitActivityUpdatedAt = typeof (existing as any)?.activityUpdatedAt !== 'number'
              && typeof nextActivity === 'number'
              && typeof nextUpdatedAt === 'number';

            const nextUserName = String((s as any)?.userName ?? (s as any)?.user_name ?? existing?.userName ?? '').trim();
            const nextRole = (s as any)?.role ?? existing?.role;
            const nextLastUpdate = String((s as any)?.lastUpdate ?? (s as any)?.last_update ?? existing?.lastUpdate ?? '').trim();

            byId.set(userId, {
              userId,
              userName: nextUserName || existing?.userName || userId,
              role: nextRole || existing?.role,
              status: currentStatus,
              lastUpdate: nextLastUpdate || existing?.lastUpdate || new Date(nowMs).toISOString(),
              ...(existing || {}),
              activity: nextActivity,
              ...(shouldBump ? { lastActivityAt: nextUpdatedAt } : {}),
              ...(((didActivityChange || shouldInitActivityUpdatedAt) && typeof nextUpdatedAt === 'number')
                ? { activityUpdatedAt: nextUpdatedAt }
                : {}),
            });
          }

          const next = Array.from(byId.values());
          realtimeStatusesRef.current = next;

          try {
            idleStore[dayKey] = dayBucket;
            localStorage.setItem(STORAGE_KEYS.IDLE_TRACK, JSON.stringify(idleStore));
          } catch (e) {}

          return next;
        });
      } catch (e) {
        console.warn('[activity] Poll error', e);
      }
    }, 2000);

    activityPollRef.current = pollId;

    // ==================== SOCKET EVENT HANDLERS ====================

    newSocket.on('connect', () => {
      console.log('[socket] Connected');
      setIsConnected(true);
      setLoading(false);

      // FIX: Don't auto-resume if this is a fresh login attempt
      if (freshLoginRef.current) {
        console.log('[socket] Fresh login in progress, skipping auto-resume');
        return;
      }

      try {
        const storedAuth = StorageManager.getAuth();
        
        // Only resume if we have complete user data with email
        if (storedAuth?.id && storedAuth?.email) {
          // FIX: Always use email for session ID
          const sessionId = StorageManager.getOrCreateSessionId(storedAuth.email);

          console.log('[socket] Resuming session', {
            userId: storedAuth.id,
            email: storedAuth.email,
            sessionId
          });
          
          newSocket.emit('auth_resume', { 
            userId: storedAuth.id, 
            sessionId 
          });
        } else {
          console.log('[socket] No stored auth or incomplete data, skipping resume');
        }
      } catch (e) {
        console.error('[socket] Failed to resume session:', e);
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
      setLoading(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('system_sync', ({ users, presence, history, settings: syncedSettings, serverTime }) => {
      console.log('[socket] System sync received', { presenceCount: presence.length });

      setUsers(users);
      StorageManager.saveUsers(users);

      if (Array.isArray(presence) && presence.length > 0) {
        setRealtimeStatuses(presence);
        realtimeStatusesRef.current = presence;
      } else {
        console.log('[socket] Empty presence from server - clearing UI');
        setRealtimeStatuses([]);
        realtimeStatusesRef.current = [];
      }
      
      setHasSynced(true);

      if (typeof serverTime === 'number' && Number.isFinite(serverTime)) {
        const offset = serverTime - Date.now();
        serverOffsetRef.current = offset;
        setServerOffsetMs(offset);
      }

      if (syncedSettings) {
        console.log('[socket] Settings sync:', syncedSettings);
        setSettings(syncedSettings);
        StorageManager.saveSettings(syncedSettings);
      }

      if (Array.isArray(history) && history.length > 0) {
        const computed = computeArchiveFromHistory(history, presence, Date.now() + serverOffsetRef.current);
        StorageManager.saveArchive(computed);
        setPerformanceHistory(computed);
      }
    });

    newSocket.on('users_update', (updatedUsers) => {
      console.log('[socket] Users update');
      setUsers(updatedUsers);
      StorageManager.saveUsers(updatedUsers);
    });

    newSocket.on('history_update', (historyRows) => {
      try {
        const computed = computeArchiveFromHistory(
          historyRows,
          realtimeStatusesRef.current,
          Date.now() + serverOffsetRef.current
        );
        StorageManager.saveArchive(computed);
        setPerformanceHistory(computed);
      } catch (e) {
        console.error('[socket] Failed to update history:', e);
      }
    });

    newSocket.on('presence_update', (data: RealtimeStatus) => {
      try {
        const st = (data as any)?.serverTime;
        if (typeof st === 'number' && Number.isFinite(st)) {
          const offset = st - Date.now();
          serverOffsetRef.current = offset;
          setServerOffsetMs(offset);
        }
      } catch (e) {}

      setRealtimeStatuses((prev) => {
        const existing = prev.find((p) => p.userId === data.userId);
        const incomingLastAt = (data as any)?.lastActivityAt;
        let normalizedLastAt: number | undefined;
        if (typeof incomingLastAt === 'number' && Number.isFinite(incomingLastAt)) {
          normalizedLastAt = incomingLastAt;
        } else if (typeof incomingLastAt === 'string' && incomingLastAt.trim() && /^\d+$/.test(incomingLastAt.trim())) {
          const n = Number(incomingLastAt.trim());
          normalizedLastAt = Number.isFinite(n) ? n : undefined;
        } else {
          normalizedLastAt = existing?.lastActivityAt;
        }

        if (typeof normalizedLastAt === 'number' && Number.isFinite(normalizedLastAt) && normalizedLastAt < 10_000_000_000) {
          normalizedLastAt = normalizedLastAt * 1000;
        }

        const incomingActivity = (data as any)?.activity;
        const nextActivity = (typeof incomingActivity === 'number' && Number.isFinite(incomingActivity))
          ? incomingActivity
          : existing?.activity;
        const prevActivity = existing?.activity;
        const didActivityChange = (typeof nextActivity === 'number' && typeof prevActivity === 'number')
          ? nextActivity !== prevActivity
          : false;

        const shouldInitActivityUpdatedAt = typeof (existing as any)?.activityUpdatedAt !== 'number'
          && typeof nextActivity === 'number'
          && typeof normalizedLastAt === 'number';

        const normalized: RealtimeStatus = {
          ...(existing || {}),
          ...(data as any),
          ...(typeof normalizedLastAt === 'number' ? { lastActivityAt: normalizedLastAt } : {}),
          ...(((didActivityChange || shouldInitActivityUpdatedAt) && typeof normalizedLastAt === 'number')
            ? { activityUpdatedAt: normalizedLastAt }
            : {}),
        } as RealtimeStatus;

        const filtered = prev.filter((s) => s.userId !== data.userId);
        const next = [...filtered, normalized];
        realtimeStatusesRef.current = next;
        return next;
      });
    });

    newSocket.on('user_offline', (userId: string) => {
      console.log('[socket] User offline:', userId);

      try {
        const nowMs = Date.now() + serverOffsetRef.current;
        const dayKey = utils.toISTDateString(new Date(nowMs));
        const idleStoreRaw = utils.safeParseJson(localStorage.getItem(STORAGE_KEYS.IDLE_TRACK));
        const idleStore: any = (idleStoreRaw && typeof idleStoreRaw === 'object') ? idleStoreRaw : {};
        const dayBucket: any = (idleStore[dayKey] && typeof idleStore[dayKey] === 'object') ? idleStore[dayKey] : {};
        const row = dayBucket?.[userId];
        const idleStartMs = (typeof row?.idleStartMs === 'number' && Number.isFinite(row.idleStartMs)) ? row.idleStartMs : null;
        const idleTotalMs = (typeof row?.idleTotalMs === 'number' && Number.isFinite(row.idleTotalMs)) ? row.idleTotalMs : 0;

        if (typeof idleStartMs === 'number') {
          const delta = Math.max(0, nowMs - idleStartMs);
          dayBucket[userId] = { ...(row || {}), idleStartMs: null, idleTotalMs: idleTotalMs + delta };
          idleStore[dayKey] = dayBucket;
          localStorage.setItem(STORAGE_KEYS.IDLE_TRACK, JSON.stringify(idleStore));
        }
      } catch (e) {}

      setRealtimeStatuses(prev => {
        const next = prev.filter(s => s.userId !== userId);
        realtimeStatusesRef.current = next;
        console.log(`[user_offline] Removed ${userId} from presence, ${next.length} users remaining`);
        return next;
      });
    });

    newSocket.on('settings_update', (nextSettings: AppSettings) => {
      if (!nextSettings) return;
      console.log('[socket] Settings update:', nextSettings);
      setSettings(nextSettings);
      StorageManager.saveSettings(nextSettings);
    });

    newSocket.on('force_logout', ({ message }) => {
      console.log('[socket] Force logout received');
      const currentUser = StorageManager.getAuth();

      setRealtimeStatuses([]);
      realtimeStatusesRef.current = [];
      setHasSynced(false);

      alert(message || 'You have been logged out.');
      applyLogoutRef.current({ auth: currentUser, broadcast: true, reason: 'force_logout' });
    });

    newSocket.on('auth_success', (authenticatedUser: User) => {
      if (isLoggingOutRef.current) {
        console.log('[auth] Ignoring auth_success — logout in progress');
        return;
      }

      if (socketRef.current === null) {
        console.log('[auth] Ignoring auth_success — socket already cleaned up');
        return;
      }

      console.log('[socket] Auth success:', authenticatedUser.id);
      
      // FIX: Clear fresh login flag AFTER successful auth
      freshLoginRef.current = false;
      isLoggedInRef.current = true;
      
      setLoginError('');
      setUser(authenticatedUser);
      setView('dashboard');
      StorageManager.saveAuth(authenticatedUser);
    });

    newSocket.on('auth_failure', ({ message }) => {
      console.log('[socket] Auth failure:', message);
      
      // FIX: Clear fresh login flag on auth failure
      freshLoginRef.current = false;
      isLoggedInRef.current = false;
      
      setLoginError(message || 'Authentication failed.');
      setLoading(false);

      setRealtimeStatuses([]);
      realtimeStatusesRef.current = [];
      setHasSynced(false);
    });

    return () => {
      console.log('[socket] Cleaning up connection');
      
      if (activityPollRef.current) {
        clearInterval(activityPollRef.current);
        activityPollRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [debugSession, socketReconnectTrigger]);

  // ==================== VIEW MANAGEMENT ====================
  useEffect(() => {
    if (!user) return;
    if (isLoggingOutRef.current) return;

    const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;
    const isSuper = user.role === UserRole.SUPER_USER;

    const saved = StorageManager.getLastView();

    const allowed = (v: typeof view) => {
      if (v === 'monitor' || v === 'management') return isPrivileged;
      if (v === 'settings') return isSuper;
      if (v === 'dashboard') return !isPrivileged;
      if (v === 'analytics') return true;
      return false;
    };

    if (allowed(saved)) {
      setView(saved);
    } else {
      setView(isPrivileged ? 'monitor' : 'dashboard');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    StorageManager.saveLastView(view);
  }, [view, user]);

  // ==================== SETTINGS EFFECTS ====================
  useEffect(() => {
    if (settings?.siteName) document.title = settings.siteName;
  }, [settings?.siteName]);

  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // ==================== EVENT HANDLERS ====================
  const handleLogin = useCallback((credentials: any) => {
    if (!isConnected) {
      alert("System Offline: Cannot authorize at this time.");
      return;
    }

    setLoginError('');

    try {
      const storedAuth = StorageManager.getAuth();
      const incomingEmail = String(credentials?.email || '').toLowerCase().trim();

      if (!incomingEmail) {
        setLoginError('Email is required');
        return;
      }

      if (storedAuth && incomingEmail) {
        const existingEmail = String(storedAuth?.email || '').toLowerCase().trim();

        if (existingEmail && existingEmail !== incomingEmail) {
          alert(`Already logged in as ${storedAuth?.name || storedAuth?.id}. Please logout first to switch accounts.`);
          return;
        }
      }
    } catch (e) {
      console.error('[login] Error checking existing auth:', e);
    }

    // FIX: Set fresh login flag and always use email for session ID
    freshLoginRef.current = true;
    const email = String(credentials?.email || '').toLowerCase().trim();
    const sessionId = StorageManager.getOrCreateSessionId(email);
    
    console.log('[login] Attempting login', { email, sessionId });
    socket?.emit('auth_login', { ...credentials, sessionId });
  }, [isConnected, socket]);

  const handleLogout = useCallback(() => {
    console.log('[logout] Manual logout triggered');
    applyLogout({ auth: user, broadcast: true, reason: 'manual_logout' });
  }, [applyLogout, user]);

  const setServerIp = useCallback(() => {
    const ip = prompt(
      "Enter Server URL (https://server2-e3p9.onrender.com) or Server IP (192.168.1.5):",
      localStorage.getItem(STORAGE_KEYS.SERVER_IP) || 'https://server2-e3p9.onrender.com'
    );
    if (ip !== null) {
      localStorage.setItem(STORAGE_KEYS.SERVER_IP, ip);
      window.location.reload();
    }
  }, []);

  // ==================== RENDER ====================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-800 rounded-full"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">
            Establishing Secure Node...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        users={users}
        settings={settings}
        onSetIp={setServerIp}
        loginError={loginError}
        onClearError={() => setLoginError('')}
      />
    );
  }

  const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;
  const isSuper = user.role === UserRole.SUPER_USER;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <Layout
        user={user}
        currentView={view}
        setView={setView}
        onLogout={handleLogout}
        isPrivileged={isPrivileged}
        isSuper={isSuper}
        settings={settings}
        isConnected={isConnected}
      >
        {view === 'dashboard' && !isPrivileged && (
          <Dashboard
            user={user}
            settings={settings}
            realtimeStatuses={realtimeStatuses}
            setRealtimeStatuses={setRealtimeStatuses}
            socket={socket}
            hasSynced={hasSynced}
            serverOffsetMs={serverOffsetMs}
          />
        )}
        {view === 'monitor' && isPrivileged && (
          <LiveMonitor
            user={user}
            realtimeStatuses={realtimeStatuses}
            setRealtimeStatuses={setRealtimeStatuses}
            users={users}
            settings={settings}
            socket={socket}
            hasSynced={hasSynced}
            serverOffsetMs={serverOffsetMs}
          />
        )}
        {view === 'analytics' && (
          <Analytics
            data={performanceHistory}
            setData={setPerformanceHistory}
            user={user}
            users={users}
          />
        )}
        {view === 'management' && isPrivileged && (
          <Management
            currentUser={user}
            users={users}
            setUsers={setUsers}
            history={performanceHistory}
            setHistory={setPerformanceHistory}
            setForceLogoutFlags={setForceLogoutFlags}
            socket={socket}
          />
        )}
        {view === 'settings' && isSuper && (
          <Settings
            settings={settings}
            setSettings={setSettings}
            users={users}
            socket={socket}
          />
        )}
      </Layout>
    </div>
  );
};

export default App;
