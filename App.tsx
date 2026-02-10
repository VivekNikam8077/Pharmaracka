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
  SESSION_ID_PREFIX: 'officely_session_id_',
} as const;

const ARCHIVE_SEED_VERSION = '2';

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

  getSessionKey: (identifier: string, isEmail: boolean): string => {
    const prefix = isEmail
      ? STORAGE_KEYS.SESSION_EMAIL_PREFIX
      : STORAGE_KEYS.SESSION_ID_PREFIX;
    return `${prefix}${String(identifier || '').toLowerCase().trim()}`;
  },

  clearAllSessionData: (user?: User | null) => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.LAST_VIEW);

    if (user?.id) {
      const sessionIdKey = utils.getSessionKey(user.id, false);
      localStorage.removeItem(sessionIdKey);
    }
    if (user?.email) {
      const sessionEmailKey = utils.getSessionKey(user.email, true);
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

  static getOrCreateSessionId(identifier: string, isEmail: boolean): string {
    const key = utils.getSessionKey(identifier, isEmail);
    const existing = localStorage.getItem(key);
    if (existing) return existing;

    const newSessionId = utils.createSessionId();
    localStorage.setItem(key, newSessionId);
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
  // FIX: track login error to show inline instead of alert()
  const [loginError, setLoginError] = useState<string>('');

  // ==================== REFS ====================
  const socketRef = useRef<Socket | null>(null);
  const realtimeStatusesRef = useRef<RealtimeStatus[]>([]);
  const serverOffsetRef = useRef(0);
  const activityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoggingOutRef = useRef(false);
  // FIX: keep applyLogout always fresh inside the socket useEffect (stale closure fix)
  const applyLogoutRef = useRef<(opts?: any) => void>(() => {});

  // ==================== LOGOUT HANDLER ====================
  const applyLogout = useCallback((opts?: {
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
    const auth = opts?.auth || user;
    const broadcast = Boolean(opts?.broadcast);
    const skipEmit = Boolean(opts?.skipEmit);

    console.log('[logout] Starting logout process', {
      userId: auth?.id,
      reason: opts?.reason,
      broadcast,
      skipEmit
    });

    try {
      // FIX: Null the ref FIRST before removeAllListeners so no in-flight
      // socket event (like auth_success) can fire after we start cleaning up
      const sock = socketRef.current;
      socketRef.current = null;

      // 1. Emit logout event to server (unless explicitly skipped)
      if (!skipEmit && auth?.id && sock?.connected) {
        console.log('[logout] Emitting user_logout to server');
        sock.emit('user_logout', auth.id);
      }

      // 2. Disconnect socket completely
      if (sock) {
        console.log('[logout] Disconnecting socket');
        sock.removeAllListeners();
        sock.disconnect();
      }

      // 3. Clear all storage
      console.log('[logout] Clearing storage');
      utils.clearAllSessionData(auth);

      // 4. Reset all state
      console.log('[logout] Resetting state');
      setSocket(null);
      setUser(null);
      setView('dashboard');
      setRealtimeStatuses([]);
      setPerformanceHistory([]);
      setHasSynced(false);
      setLoginError('');
      realtimeStatusesRef.current = [];

      // 5. Broadcast to other tabs
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

  // FIX: Keep the ref always pointing to the latest applyLogout
  useEffect(() => {
    applyLogoutRef.current = applyLogout;
  }, [applyLogout]);

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

      if (user?.id && e.key === utils.getSessionKey(user.id, false) && e.newValue !== e.oldValue) {
        console.log('[storage] Session ID changed, another tab took over');
        applyLogoutRef.current({ auth: user, broadcast: false, reason: 'session_takeover', skipEmit: true });
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

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

    // ==================== ACTIVITY POLLING ====================
    // FIX: capture pollId locally to avoid Strict Mode double-invoke leak
    const pollId = setInterval(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/Office/status`);
        if (!res.ok) {
          console.warn('[activity] Poll failed', res.status);
          return;
        }
        const json = await res.json();
        const snapshot = Array.isArray(json?.snapshot) ? json.snapshot : [];
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
            const userId = String(s?.user_id ?? '').trim();
            if (!userId) continue;

            const existing = byId.get(userId);
            if (!existing) continue;

            const nextActivityRaw = Number(s?.status);
            const nextActivity = (nextActivityRaw === 0 || nextActivityRaw === 1 || nextActivityRaw === 2)
              ? (nextActivityRaw as 0 | 1 | 2)
              : undefined;
            const updatedAtRaw = (s as any)?.updatedAt ?? (s as any)?.updated_at;
            const nextUpdatedAt = (typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw))
              ? updatedAtRaw
              : undefined;

            const prevActivity = (existing && typeof existing.activity === 'number') ? existing.activity : undefined;
            const prevIdleStart = dayBucket?.[userId]?.idleStartMs;
            const prevIdleStartMs = (typeof prevIdleStart === 'number' && Number.isFinite(prevIdleStart)) ? prevIdleStart : null;
            const prevIdleTotalMsRaw = dayBucket?.[userId]?.idleTotalMs;
            const prevIdleTotalMs = (typeof prevIdleTotalMsRaw === 'number' && Number.isFinite(prevIdleTotalMsRaw)) ? prevIdleTotalMsRaw : 0;

            const effectiveTs = (typeof nextUpdatedAt === 'number' && Number.isFinite(nextUpdatedAt)) ? nextUpdatedAt : nowMs;
            const nextIsIdle = nextActivity === 0;
            const prevIsIdle = prevActivity === 0;

            const currentStatus = (existing?.status || OfficeStatus.AVAILABLE) as OfficeStatus;
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
            } else if (!nextIsIdle && prevIsIdle) {
              if (typeof prevIdleStartMs === 'number') {
                const delta = Math.max(0, effectiveTs - prevIdleStartMs);
                dayBucket[userId] = {
                  ...(dayBucket[userId] || {}),
                  idleStartMs: null,
                  idleTotalMs: prevIdleTotalMs + delta,
                };
              } else {
                dayBucket[userId] = {
                  ...(dayBucket[userId] || {}),
                  idleStartMs: null,
                  idleTotalMs: prevIdleTotalMs,
                };
              }
            }

            const existingLast = typeof existing.lastActivityAt === 'number' ? existing.lastActivityAt : undefined;
            const shouldBump = typeof nextUpdatedAt === 'number' && (!existingLast || nextUpdatedAt > existingLast);

            byId.set(userId, {
              ...existing,
              activity: nextActivity,
              ...(shouldBump ? { lastActivityAt: nextUpdatedAt, activityUpdatedAt: nextUpdatedAt } : {}),
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

      try {
        const storedAuth = StorageManager.getAuth();
        if (storedAuth?.id) {
          const sessionId = storedAuth?.email
            ? StorageManager.getOrCreateSessionId(storedAuth.email, true)
            : StorageManager.getOrCreateSessionId(storedAuth.id, false);

          console.log('[socket] Resuming session for user:', storedAuth.id);
          newSocket.emit('auth_resume', { userId: storedAuth.id, sessionId });
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
      console.log('[socket] System sync received');

      setUsers(users);
      StorageManager.saveUsers(users);

      setRealtimeStatuses(presence);
      realtimeStatusesRef.current = presence;
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

      setRealtimeStatuses(prev => {
        const existing = prev.find((p) => p.userId === data.userId);
        const incomingLastAt = (data as any)?.lastActivityAt;
        const normalizedLastAt = (typeof incomingLastAt === 'number' && Number.isFinite(incomingLastAt))
          ? incomingLastAt
          : (existing?.lastActivityAt);

        const normalized: RealtimeStatus = {
          ...(data as any),
          ...(typeof normalizedLastAt === 'number' ? {
            lastActivityAt: normalizedLastAt,
            activityUpdatedAt: normalizedLastAt
          } : {}),
        } as RealtimeStatus;

        const filtered = prev.filter(s => s.userId !== data.userId);
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
      // FIX: use applyLogoutRef (always fresh) and read auth from storage (not stale closure)
      const currentUser = StorageManager.getAuth();
      alert(message || 'You have been logged out.');
      applyLogoutRef.current({ auth: currentUser, broadcast: true, reason: 'force_logout' });
    });

    newSocket.on('auth_success', (authenticatedUser: User) => {
      // FIX: guard against auth_success firing during/after logout
      // This is the root cause of the 5s ghost user bug on SuperUser dashboard
      if (isLoggingOutRef.current) {
        console.log('[auth] Ignoring auth_success — logout in progress');
        return;
      }

      // FIX: also ignore if socketRef was nulled (logout completed)
      if (socketRef.current === null) {
        console.log('[auth] Ignoring auth_success — socket already cleaned up');
        return;
      }

      console.log('[socket] Auth success:', authenticatedUser.id);
      setLoginError('');
      setUser(authenticatedUser);
      setView('dashboard');
      StorageManager.saveAuth(authenticatedUser);
    });

    newSocket.on('auth_failure', ({ message }) => {
      console.log('[socket] Auth failure:', message);
      // FIX: set inline error state instead of alert()
      setLoginError(message || 'Authentication failed.');
      setLoading(false);
    });

    // Cleanup
    return () => {
      console.log('[socket] Cleaning up connection');
      // FIX: use captured pollId, not ref (handles Strict Mode double-invoke)
      clearInterval(pollId);
      activityPollRef.current = null;

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []); // Empty deps - only run once

  // ==================== VIEW MANAGEMENT ====================
  useEffect(() => {
    if (!user) return;
    // FIX: don't update view during logout — prevents view flashing for SuperUser
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

    const sessionId = StorageManager.getOrCreateSessionId(credentials?.email, true);
    console.log('[login] Attempting login');
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
