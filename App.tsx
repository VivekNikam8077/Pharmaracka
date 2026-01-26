
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, DaySummary, OfficeStatus, StatusLogEntry, UserRole, RealtimeStatus, AppSettings } from './types';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import Login from './components/Login';
import Management from './components/Management';
import LiveMonitor from './components/LiveMonitor';
import Settings from './components/Settings';

const DEFAULT_SETTINGS: AppSettings = {
  siteName: 'Pharmarack',
  logoUrl: '',
  loginBgUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
  darkMode: false,
  availableStatuses: Object.values(OfficeStatus).filter(s => s !== OfficeStatus.LEAVE)
};

function istStartOfDayMs(ms: number) {
  const day = toISTDateString(new Date(ms));
  return new Date(`${day}T00:00:00+05:30`).getTime();
}

const ARCHIVE_STORAGE_KEY = 'officely_archive_data';
const ARCHIVE_SEED_VERSION_KEY = 'officely_archive_seed_version';
const ARCHIVE_SEED_VERSION = '2';
const LAST_VIEW_KEY = 'officely_last_view';
const SETTINGS_STORAGE_KEY = 'officely_settings';

const toISTDateString = (d: Date) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (e) {
    return toDateString(d);
  }
};

const toISTTimeHHMM = (d: Date) => {
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
};

const computeArchiveFromHistory = (historyRows: any[], presence: RealtimeStatus[], nowMs: number) => {
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
        const dayStart = istStartOfDayMs(cursor);
        const dayEnd = dayStart + 86400000;
        const chunkEnd = Math.min(endTs, dayEnd);
        const minutes = Math.max(0, Math.floor((chunkEnd - cursor) / 60000));
        if (minutes > 0) {
          const key2 = `${userId}::${toISTDateString(new Date(cursor))}`;
          const existing2 = summaries.get(key2);
          const s2 = existing2 || {
            userId,
            date: toISTDateString(new Date(cursor)),
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
    const totalMinutes = s.productiveMinutes + s.lunchMinutes + s.snacksMinutes + s.refreshmentMinutes + s.feedbackMinutes + s.crossUtilMinutes;
    result.push({
      userId: s.userId,
      date: s.date,
      loginTime: toISTTimeHHMM(new Date(s.startTs)),
      logoutTime: toISTTimeHHMM(new Date(s.endTs)),
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

const toDateString = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const seedArchiveData = (users: User[]): DaySummary[] => {
  const base = new Date();
  const days = 2;
  const results: DaySummary[] = [];
  for (const u of users) {
    for (let i = 0; i < days; i++) {
      const day = new Date(base);
      day.setDate(base.getDate() - i);
      const productiveMinutes = 360 + ((i * 23 + u.id.length * 11) % 121);
      const lunchMinutes = 30 + ((i * 7) % 21);
      const snacksMinutes = 15 + ((i * 5) % 16);
      const refreshmentMinutes = 10 + ((i * 3) % 11);
      const feedbackMinutes = 20 + ((i * 9) % 26);
      const crossUtilMinutes = 25 + ((i * 11) % 36);
      const totalMinutes = productiveMinutes + lunchMinutes + snacksMinutes + refreshmentMinutes + feedbackMinutes + crossUtilMinutes;
      results.push({
        userId: u.id,
        date: toDateString(day),
        loginTime: '09:30',
        logoutTime: '18:30',
        productiveMinutes,
        lunchMinutes,
        snacksMinutes,
        refreshmentMinutes,
        feedbackMinutes,
        crossUtilMinutes,
        totalMinutes,
      });
    }
  }
  return results;
};

const ensureArchiveForUsers = (existing: DaySummary[], users: User[]) => {
  let merged = Array.isArray(existing) ? existing.slice() : [];
  let changed = false;

  for (const u of Array.isArray(users) ? users : []) {
    const email = (u.email || '').toLowerCase();
    const hasAny = merged.some(d => d.userId === u.id || (email && d.userId.toLowerCase() === email));
    if (!hasAny) continue;
  }

  return { merged, changed };
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const storedAuth = localStorage.getItem('officely_auth');
    if (!storedAuth) return null;
    try {
      return JSON.parse(storedAuth);
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState<'dashboard' | 'monitor' | 'analytics' | 'management' | 'settings'>(() => {
    const saved = localStorage.getItem(LAST_VIEW_KEY);
    if (!saved) return 'dashboard';
    if (saved === 'dashboard' || saved === 'monitor' || saved === 'analytics' || saved === 'management' || saved === 'settings') return saved;
    return 'dashboard';
  });
  const [users, setUsers] = useState<User[]>(() => {
    const stored = localStorage.getItem('officely_users');
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [performanceHistory, setPerformanceHistory] = useState<DaySummary[]>([]);
  const [hasSynced, setHasSynced] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    try {
      return JSON.parse(stored);
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });
  const [realtimeStatuses, setRealtimeStatuses] = useState<RealtimeStatus[]>([]);
  const [forceLogoutFlags, setForceLogoutFlags] = useState<Set<string>>(new Set());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const realtimeStatusesRef = useRef<RealtimeStatus[]>([]);
  const serverOffsetRef = useRef(0);

  const createSessionId = () => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    } catch (e) {}
    return `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  };

  const getOrCreateSessionIdForEmail = (email: string) => {
    const key = `officely_session_email_${String(email || '').toLowerCase().trim()}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = createSessionId();
    localStorage.setItem(key, next);
    return next;
  };

  const getOrCreateSessionIdForUserId = (userId: string) => {
    const key = `officely_session_id_${userId}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = createSessionId();
    localStorage.setItem(key, next);
    return next;
  };

  // Connection logic
  useEffect(() => {
    const storedArchive = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (storedArchive) {
      try {
        setPerformanceHistory(JSON.parse(storedArchive));
      } catch (e) {}
    }

    // Check for a saved server address in localStorage.
    // - Full URL: use as-is
    // - IPv4: assume local network and port 3001 over http
    // - Hostname/domain: assume deployed server over https (no port)
    const savedServer = localStorage.getItem('officely_server_ip');
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
    
    console.log(`Connecting to Officely Backend: ${serverUrl}`);
    
    socketRef.current = io(serverUrl, { 
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 10000 
    });

    const activityPoll = window.setInterval(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/Office/status`);
        if (!res.ok) {
          console.warn('[activity] poll failed', res.status);
          return;
        }
        const json = await res.json();
        const snapshot = Array.isArray(json?.snapshot) ? json.snapshot : [];
        if (snapshot.length === 0) return;

        setRealtimeStatuses((prev) => {
          const byId = new Map<string, RealtimeStatus>(
            prev.map((p) => [p.userId, p] as const)
          );
          for (const s of snapshot) {
            const userId = String(s?.user_id ?? '').trim();
            if (!userId) continue;
            const existing = byId.get(userId);
            const nextActivityRaw = Number(s?.status);
            const nextActivity = (nextActivityRaw === 0 || nextActivityRaw === 1 || nextActivityRaw === 2)
              ? (nextActivityRaw as 0 | 1 | 2)
              : undefined;
            const updatedAtRaw = (s as any)?.updatedAt ?? (s as any)?.updated_at;
            const nextUpdatedAt = (typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw))
              ? updatedAtRaw
              : undefined;

            if (existing) {
              const existingLast = typeof existing.lastActivityAt === 'number' ? existing.lastActivityAt : undefined;
              const shouldBump = typeof nextUpdatedAt === 'number' && (!existingLast || nextUpdatedAt > existingLast);
              byId.set(userId, {
                ...existing,
                activity: nextActivity,
                ...(shouldBump ? { lastActivityAt: nextUpdatedAt, activityUpdatedAt: nextUpdatedAt } : {}),
              });
              continue;
            }

            // If the user isn't present in realtimeStatuses yet (no socket presence), create a minimal entry
            // so LiveMonitor can still show the activity dot.
            byId.set(userId, {
              userId,
              userName: userId,
              role: UserRole.STANDARD,
              status: OfficeStatus.AVAILABLE,
              lastUpdate: new Date().toISOString(),
              activity: nextActivity,
              ...(typeof nextUpdatedAt === 'number' ? { lastActivityAt: nextUpdatedAt, activityUpdatedAt: nextUpdatedAt } : {}),
            });
          }
          const next = Array.from(byId.values());
          console.debug('[activity] poll applied', snapshot.length);
          realtimeStatusesRef.current = next;
          return next;
        });
      } catch (e) {
        console.warn('[activity] poll error', e);
      }
    }, 2000);

    setSocket(socketRef.current);

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setLoading(false);

      // Restore socket identity for persisted sessions so server can authorize settings updates
      try {
        const storedAuth = localStorage.getItem('officely_auth');
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed?.id) {
            const sessionId = parsed?.email
              ? getOrCreateSessionIdForEmail(parsed.email)
              : getOrCreateSessionIdForUserId(parsed.id);
            socketRef.current?.emit('auth_resume', { userId: parsed.id, sessionId });
          }
        }
      } catch (e) {}
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Connection Failed:', err.message);
      // Even if it fails, we stop the loader to show the connection error state in Layout if logged in
      setLoading(false);
    });

    socketRef.current.on('disconnect', () => setIsConnected(false));

    socketRef.current.on('system_sync', ({ users, presence, history, settings: syncedSettings, serverTime }) => {
      setUsers(users);
      localStorage.setItem('officely_users', JSON.stringify(users));
      setRealtimeStatuses(presence);
      realtimeStatusesRef.current = presence;
      setHasSynced(true);

      if (typeof serverTime === 'number' && Number.isFinite(serverTime)) {
        const offset = serverTime - Date.now();
        serverOffsetRef.current = offset;
        setServerOffsetMs(offset);
      }

      if (syncedSettings) {
        console.log('[settings] system_sync', syncedSettings);
        setSettings(syncedSettings);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(syncedSettings));
      }

      if (Array.isArray(history) && history.length > 0) {
        const computed = computeArchiveFromHistory(history, presence, Date.now() + serverOffsetRef.current);
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(computed));
        setPerformanceHistory(computed);
      } else {
        const existing = localStorage.getItem(ARCHIVE_STORAGE_KEY);
        if (existing) {
          try {
            setPerformanceHistory(JSON.parse(existing));
          } catch (e) {}
        } else {
          setPerformanceHistory([]);
        }
      }
    });

    socketRef.current.on('users_update', (updatedUsers) => {
      setUsers(updatedUsers);
      localStorage.setItem('officely_users', JSON.stringify(updatedUsers));
    });

    socketRef.current.on('history_update', (historyRows) => {
      try {
        const computed = computeArchiveFromHistory(historyRows, realtimeStatusesRef.current, Date.now() + serverOffsetRef.current);
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(computed));
        setPerformanceHistory(computed);
      } catch (e) {}
    });
    
    socketRef.current.on('presence_update', (data: RealtimeStatus) => {
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
          ...(typeof normalizedLastAt === 'number' ? { lastActivityAt: normalizedLastAt, activityUpdatedAt: normalizedLastAt } : {}),
        } as RealtimeStatus;
        const filtered = prev.filter(s => s.userId !== data.userId);
        const next = [...filtered, normalized];
        realtimeStatusesRef.current = next;
        return next;
      });
    });

    socketRef.current.on('user_offline', (userId: string) => {
      setRealtimeStatuses(prev => {
        const next = prev.filter(s => s.userId !== userId);
        realtimeStatusesRef.current = next;
        return next;
      });
    });

    socketRef.current.on('settings_update', (nextSettings: AppSettings) => {
      if (!nextSettings) return;
      console.log('[settings] settings_update', nextSettings);
      setSettings(nextSettings);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    });

    socketRef.current.on('session_exists', ({ message }) => {
      const shouldTakeover = window.confirm(`${message || 'Already logged in elsewhere.'}\n\nDo you want to logout the previous session and continue?`);
      if (shouldTakeover) socketRef.current?.emit('session_takeover');
      else socketRef.current?.emit('session_takeover_cancel');
    });

    socketRef.current.on('force_logout', ({ message }) => {
      alert(message || 'You have been logged out.');
      try {
        const storedAuth = localStorage.getItem('officely_auth');
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed?.id) localStorage.removeItem(`officely_session_id_${parsed.id}`);
          if (parsed?.email) localStorage.removeItem(`officely_session_email_${String(parsed.email).toLowerCase().trim()}`);
        }
      } catch (e) {}
      localStorage.removeItem('officely_auth');
      localStorage.removeItem('officely_user');
      localStorage.removeItem(LAST_VIEW_KEY);
      setUser(null);
      setView('dashboard');
      setRealtimeStatuses([]);
      setPerformanceHistory([]);
    });

    socketRef.current.on('auth_success', (authenticatedUser: User) => {
      setUser(authenticatedUser);
      setView('dashboard');
      localStorage.setItem('officely_auth', JSON.stringify(authenticatedUser));
      localStorage.setItem('officely_user', JSON.stringify(authenticatedUser));
    });

    socketRef.current.on('auth_failure', ({ message }) => {
      alert(message);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      window.clearInterval(activityPoll);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;
    const isSuper = user.role === UserRole.SUPER_USER;

    const saved = localStorage.getItem(LAST_VIEW_KEY);
    const desired = (saved === 'dashboard' || saved === 'monitor' || saved === 'analytics' || saved === 'management' || saved === 'settings')
      ? saved
      : null;

    // Enforce role-allowed views
    const allowed = (v: typeof view) => {
      if (v === 'monitor' || v === 'management') return isPrivileged;
      if (v === 'settings') return isSuper;
      if (v === 'dashboard') return !isPrivileged;
      if (v === 'analytics') return true;
      return false;
    };

    if (desired && allowed(desired as any)) {
      setView(desired as any);
    } else {
      setView(isPrivileged ? 'monitor' : 'dashboard');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    localStorage.setItem(LAST_VIEW_KEY, view);
  }, [view, user]);

  useEffect(() => {
    if (settings?.siteName) document.title = settings.siteName;
  }, [settings?.siteName]);

  useEffect(() => {
    if (settings.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings.darkMode]);

  const handleLogin = (credentials: any) => {
    if (!isConnected) return alert("System Offline: Cannot authorize at this time.");

    // Prevent logging into a different account in the same browser profile without explicit logout.
    try {
      const storedAuth = localStorage.getItem('officely_auth');
      const incomingEmail = String(credentials?.email || '').toLowerCase().trim();
      if (storedAuth && incomingEmail) {
        const parsed = JSON.parse(storedAuth);
        const existingId = String(parsed?.id || '').toLowerCase().trim();
        const existingEmail = String(parsed?.email || '').toLowerCase().trim();
        const isDifferentUser = (existingId && existingId !== incomingEmail) && (existingEmail && existingEmail !== incomingEmail);
        if (isDifferentUser) {
          alert(`Already logged in as ${parsed?.name || parsed?.id}. Please logout first to switch accounts.`);
          return;
        }
      }
    } catch (e) {}

    const sessionId = getOrCreateSessionIdForEmail(credentials?.email);
    socket?.emit('auth_login', { ...credentials, sessionId });
  };

  const handleLogout = () => {
    if (user && socket) socket.emit('user_logout', user.id);
    if (user) {
      localStorage.removeItem(`officely_session_id_${user.id}`);
      if (user?.email) localStorage.removeItem(`officely_session_email_${String(user.email).toLowerCase().trim()}`);
    }
    localStorage.removeItem('officely_auth');
    localStorage.removeItem('officely_user');
    localStorage.removeItem(LAST_VIEW_KEY);
    setUser(null);
    setView('dashboard');
    setRealtimeStatuses([]);
    setPerformanceHistory([]);
  };

  // Special config for manual server IP setting
  const setServerIp = () => {
    const ip = prompt(
      "Enter Server URL (https://server2-e3p9.onrender.com) or Server IP (192.168.1.5):",
      localStorage.getItem('officely_server_ip') || 'https://server2-e3p9.onrender.com'
    );
    if (ip !== null) {
      localStorage.setItem('officely_server_ip', ip);
      window.location.reload();
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-800 rounded-full"></div>
          <div className="absolute inset-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Establishing Secure Node...</p>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={handleLogin as any} users={users} settings={settings} onSetIp={setServerIp} />;

  const isPrivileged = user.role === UserRole.SUPER_USER || user.role === UserRole.ADMIN;
  const isSuper = user.role === UserRole.SUPER_USER;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <Layout 
        user={user} 
        currentView={view as any} 
        setView={setView as any} 
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
        {view === 'analytics' && <Analytics data={performanceHistory} setData={setPerformanceHistory} user={user} users={users} />}
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
        {view === 'settings' && isSuper && <Settings settings={settings} setSettings={setSettings} users={users} socket={socket} />}
      </Layout>
    </div>
  );
};

export default App;
