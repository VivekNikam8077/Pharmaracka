
import React, { useState, useEffect, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { OfficeStatus, StatusLogEntry, User, RealtimeStatus, AppSettings } from '../types';
import { getStatusConfig } from '../constants';
import { 
  History, 
  Clock,
  Zap,
  ClipboardCheck,
  Shuffle,
  Coffee
} from 'lucide-react';

interface DashboardProps { 
  user: User; 
  settings: AppSettings;
  realtimeStatuses: RealtimeStatus[];
  setRealtimeStatuses: (statuses: RealtimeStatus[] | ((prev: RealtimeStatus[]) => RealtimeStatus[])) => void;
  socket?: Socket | null;
  hasSynced?: boolean;
  serverOffsetMs?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ user, settings, realtimeStatuses, setRealtimeStatuses, socket, hasSynced, serverOffsetMs = 0 }) => {
  const [currentStatus, setCurrentStatus] = useState<string>(OfficeStatus.AVAILABLE);
  const [history, setHistory] = useState<StatusLogEntry[]>([]);
  const [timer, setTimer] = useState(0);
  const [indiaTime, setIndiaTime] = useState(new Date());

  const storageKey = `officely_session_${user.id}`;

  // Find user's status in the global presence list provided by the server
  const myRealtimeData = useMemo(() => {
    return realtimeStatuses.find(s => s.userId === user.id);
  }, [realtimeStatuses, user.id]);

  // Sync state with server data
  useEffect(() => {
    if (myRealtimeData) {
      setCurrentStatus(myRealtimeData.status);

      const nowMs = Date.now() + serverOffsetMs;
      const todayStartMs = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))}T00:00:00+05:30`).getTime();
      
      // Calculate timer from the server's update timestamp
      const serverTimestamp = new Date(myRealtimeData.lastUpdate).getTime();
      const elapsed = Math.floor((nowMs - Math.max(serverTimestamp, todayStartMs)) / 1000);
      setTimer(elapsed > 0 ? elapsed : 0);

      // Make server presence authoritative for the latest segment.
      // This fixes cases where an Admin overrides the user's status but local timers/history keep running.
      setHistory(prev => {
        const nextTs = new Date(myRealtimeData.lastUpdate);
        if (!Number.isFinite(nextTs.getTime())) return prev;

        const latest = prev[0];
        if (!latest) {
          return [{
            id: Math.random().toString(36).substr(2, 9),
            userId: user.id,
            status: myRealtimeData.status,
            timestamp: nextTs,
          }];
        }

        const latestTs = latest.timestamp instanceof Date ? latest.timestamp.getTime() : new Date(latest.timestamp as any).getTime();
        const serverTs = nextTs.getTime();

        const serverStatusChanged = latest.status !== myRealtimeData.status;
        const serverNewer = serverTs > latestTs + 500;

        if (!serverStatusChanged && !serverNewer) return prev;

        const newEntry: StatusLogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          userId: user.id,
          status: myRealtimeData.status,
          timestamp: nextTs,
        };

        const withServer = [newEntry, ...prev];

        // If status spans across IST midnight, create a synthetic entry at day start
        // so timers/log durations reset for the new day.
        const latestAfter = withServer[0];
        const latestAfterTs = latestAfter?.timestamp instanceof Date
          ? latestAfter.timestamp.getTime()
          : new Date(latestAfter?.timestamp as any).getTime();

        if (Number.isFinite(latestAfterTs) && latestAfterTs < todayStartMs && String(myRealtimeData.status) !== 'Offline') {
          const synthetic: StatusLogEntry = {
            id: `day_${user.id}_${todayStartMs}`,
            userId: user.id,
            status: myRealtimeData.status,
            timestamp: new Date(todayStartMs),
          };
          return [synthetic, ...withServer];
        }

        return withServer;
      });
    }
  }, [myRealtimeData, serverOffsetMs]);

  // Handle local initialization and history
  useEffect(() => {
    if (!hasSynced) return;
    const savedSession = localStorage.getItem(storageKey);
    let lastKnownStatus: string | null = null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        const nextHistory = parsed.map((entry: any) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
        setHistory(nextHistory);
        const latest = nextHistory && nextHistory[0] ? nextHistory[0] : null;
        if (latest?.status) lastKnownStatus = String(latest.status);
      } catch (e) {}
    }

    if (!myRealtimeData && lastKnownStatus) {
      setCurrentStatus(lastKnownStatus);
    }

    // Inform server we are online if not already in presence
    if (!myRealtimeData && socket) {
      socket.emit('status_change', {
        userId: user.id,
        userName: user.name,
        role: user.role,
        status: (lastKnownStatus || OfficeStatus.AVAILABLE) as OfficeStatus
      });
    }
  }, [user.id, socket, hasSynced, myRealtimeData]);

  // Authoritative shift log from server history (MySQL)
  useEffect(() => {
    if (!socket) return;

    const onHistoryUpdate = (rows: any[]) => {
      try {
        let next = (Array.isArray(rows) ? rows : [])
          .filter((r) => String(r?.userId) === String(user.id))
          .map((r) => ({
            id: String(r?.id || Math.random().toString(36).substr(2, 9)),
            userId: String(r?.userId || user.id),
            status: r?.status as OfficeStatus,
            timestamp: new Date(r?.timestamp),
          }))
          .filter((e) => Number.isFinite(e.timestamp.getTime()));

        if (next.length > 0 && myRealtimeData) {
          const nowMs = Date.now() + serverOffsetMs;
          const todayStartMs = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))}T00:00:00+05:30`).getTime();
          const latestTs = next[0].timestamp.getTime();
          if (Number.isFinite(latestTs) && latestTs < todayStartMs && String(myRealtimeData.status) !== 'Offline') {
            const synthetic: StatusLogEntry = {
              id: `day_${user.id}_${todayStartMs}`,
              userId: user.id,
              status: myRealtimeData.status,
              timestamp: new Date(todayStartMs),
            };
            next = [synthetic, ...next];
          }
        }

        if (next.length > 0) setHistory(next);
      } catch (e) {}
    };

    socket.on('history_update', onHistoryUpdate);
    return () => {
      socket.off('history_update', onHistoryUpdate);
    };
  }, [socket, user.id, myRealtimeData, serverOffsetMs]);

  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nowMs = Date.now() + serverOffsetMs;
      setIndiaTime(new Date(nowMs));
      if (myRealtimeData) {
        const todayStartMs = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))}T00:00:00+05:30`).getTime();
        const serverTimestamp = new Date(myRealtimeData.lastUpdate).getTime();
        const elapsed = Math.floor((nowMs - Math.max(serverTimestamp, todayStartMs)) / 1000);
        setTimer(elapsed > 0 ? elapsed : 0);
      } else {
        setTimer(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [serverOffsetMs, myRealtimeData]);

  const changeStatus = (newStatus: string) => {
    if (newStatus === currentStatus) return;
    
    const statusData = {
      userId: user.id,
      userName: user.name,
      role: user.role,
      status: newStatus as OfficeStatus
    };
    
    // Broadcast to server
    if (socket) {
      socket.emit('status_change', statusData);
    }

    // Local history log update
    const newEntry: StatusLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      status: newStatus as OfficeStatus,
      timestamp: new Date()
    };
    setHistory(prev => [newEntry, ...prev]);
    
    // Timer will reset via the myRealtimeData useEffect when the server responds
  };

  const stats = useMemo(() => {
    const totals: Record<string, number> = {};
    if (history.length === 0) return totals;

    const nowMs = Date.now() + serverOffsetMs;
    const todayStartMs = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))}T00:00:00+05:30`).getTime();
    const todayEndMs = todayStartMs + 86400000;

    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const startTime = current.timestamp.getTime();

      let endTime = i === 0 ? startTime : history[i - 1].timestamp.getTime();
      if (i === 0 && myRealtimeData) {
        // Treat presence as authoritative for the currently running segment.
        // Do NOT require timestamp equality (can drift due to network/DB precision).
        const sameStatus = String(myRealtimeData.status) === String(current.status);
        if (sameStatus) endTime = nowMs;
      }

      const clippedStart = Math.max(startTime, todayStartMs);
      const clippedEnd = Math.min(endTime, todayEndMs);
      const durationSeconds = Math.max(0, Math.floor((clippedEnd - clippedStart) / 1000));
      totals[current.status] = (totals[current.status] || 0) + durationSeconds;
    }
    return totals;
  }, [history, indiaTime, myRealtimeData, serverOffsetMs]);

  const todayHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    const nowMs = Date.now() + serverOffsetMs;
    const todayStartMs = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs))}T00:00:00+05:30`).getTime();
    const todayEndMs = todayStartMs + 86400000;
    return history.filter((h) => {
      const ts = h.timestamp.getTime();
      return ts >= todayStartMs && ts < todayEndMs;
    });
  }, [history, serverOffsetMs]);

  const totalBreakSeconds = (stats[OfficeStatus.LUNCH] || 0) + (stats[OfficeStatus.REFRESHMENT_BREAK] || 0) + (stats[OfficeStatus.SNACKS] || 0);

  const formatElapsedTime = (seconds: number) => {
    if (!seconds || seconds < 0) return "0s";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatIST = (date: Date) => {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(date);
  };

  const currentConfig = getStatusConfig(currentStatus);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <section className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Work Console</h2>
              <div className="flex items-center gap-2 mt-1 text-slate-500 font-semibold">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span className="text-xs">IST: {formatIST(indiaTime)}</span>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {settings.availableStatuses.map((status) => {
              const config = getStatusConfig(status);
              const isActive = currentStatus === status;
              return (
                <button
                  key={status}
                  onClick={() => changeStatus(status)}
                  className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 group ${
                    isActive ? `${config.bg} border-indigo-200 dark:border-indigo-800 shadow-xl scale-[1.03]` : 'border-slate-100 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className={`p-3 rounded-xl mb-3 transition-transform group-hover:scale-110 ${isActive ? config.color : 'text-slate-400 dark:text-slate-600'}`}>
                    {config.icon}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-tighter text-center ${isActive ? 'text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {status}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-lg"><Zap className="w-4 h-4" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Productive</span>
            </div>
            <p className="text-xl font-black text-slate-800 dark:text-white">{formatElapsedTime(stats[OfficeStatus.AVAILABLE] || 0)}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 rounded-lg"><ClipboardCheck className="w-4 h-4" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Feedback</span>
            </div>
            <p className="text-xl font-black text-slate-800 dark:text-white">{formatElapsedTime(stats[OfficeStatus.QUALITY_FEEDBACK] || 0)}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><Shuffle className="w-4 h-4" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cross-Util</span>
            </div>
            <p className="text-xl font-black text-slate-800 dark:text-white">{formatElapsedTime(stats[OfficeStatus.CROSS_UTILIZATION] || 0)}</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 rounded-lg"><Coffee className="w-4 h-4" /></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Breaks</span>
            </div>
            <p className="text-xl font-black text-slate-800 dark:text-white">{formatElapsedTime(totalBreakSeconds)}</p>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800 z-10">
            <h3 className="font-black text-slate-800 dark:text-white uppercase text-sm tracking-tight">Shift Log</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400">{todayHistory.length} Logs</span>
          </div>

          <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100 dark:before:bg-slate-700">
              {todayHistory.map((entry, idx) => {
                const config = getStatusConfig(entry.status);
                const nextTime = idx === 0 ? indiaTime : todayHistory[idx - 1].timestamp;
                const dur = Math.max(0, Math.floor((nextTime.getTime() - entry.timestamp.getTime()) / 1000));
                return (
                  <div key={entry.id} className="relative flex items-center gap-6 group">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full border-4 border-white dark:border-slate-800 shadow-sm flex items-center justify-center z-10 ${config.bg} ${config.color}`}>
                      {React.cloneElement(config.icon as any, { className: 'w-4 h-4' })}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tighter truncate">{entry.status}</p>
                        <span className="text-[10px] font-bold text-slate-400 ml-2">{formatElapsedTime(dur)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatIST(new Date(entry.timestamp))}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
