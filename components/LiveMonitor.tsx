import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { User, OfficeStatus, RealtimeStatus, AppSettings } from '../types';
import { getStatusConfig } from '../constants';
import { RefreshCcw, Activity, UserCog, Clock, Users } from 'lucide-react';

interface LiveMonitorProps {
  user: User;
  realtimeStatuses: RealtimeStatus[];
  setRealtimeStatuses: (statuses: RealtimeStatus[] | ((prev: RealtimeStatus[]) => RealtimeStatus[])) => void;
  users?: User[];
  settings: AppSettings;
  socket?: Socket | null;
  hasSynced?: boolean;
  serverOffsetMs?: number;
}

const LiveMonitor: React.FC<LiveMonitorProps> = ({
  user,
  realtimeStatuses,
  setRealtimeStatuses,
  users = [],
  settings,
  socket,
  hasSynced,
  serverOffsetMs = 0,
}) => {
  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  const toISTDateString = (ms: number) => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toISOString().slice(0, 10);
    }
  };

  const getIdleInfo = (userId: string, fallbackStartMs?: number) => {
    try {
      const raw = localStorage.getItem('officely_idle_track_v1');
      if (!raw) return { idleStartMs: null as number | null, idleTotalMs: 0 };
      const parsed = JSON.parse(raw);
      const dayKey = toISTDateString(now);
      const dayBucket = parsed?.[dayKey];
      const row = dayBucket?.[userId];
      const idleStartMs = (typeof row?.idleStartMs === 'number' && Number.isFinite(row.idleStartMs)) ? row.idleStartMs : null;
      const idleTotalMs = (typeof row?.idleTotalMs === 'number' && Number.isFinite(row.idleTotalMs)) ? row.idleTotalMs : 0;

      if (!idleStartMs && typeof fallbackStartMs === 'number' && Number.isFinite(fallbackStartMs)) {
        try {
          const store = parsed && typeof parsed === 'object' ? parsed : {};
          const bucket = store?.[dayKey] && typeof store[dayKey] === 'object' ? store[dayKey] : {};
          bucket[userId] = { ...(bucket[userId] || {}), idleStartMs: fallbackStartMs, idleTotalMs };
          store[dayKey] = bucket;
          localStorage.setItem('officely_idle_track_v1', JSON.stringify(store));
        } catch (err) {}
        return { idleStartMs: fallbackStartMs, idleTotalMs };
      }
      return { idleStartMs, idleTotalMs };
    } catch (e) {
      return { idleStartMs: null as number | null, idleTotalMs: 0 };
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() + serverOffsetMs), 1000);
    return () => clearInterval(interval);
  }, [serverOffsetMs]);

  const formatElapsedTime = (seconds: number) => {
    if (!seconds || seconds < 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  useEffect(() => {
    if (!hasSynced) return;
    const self = realtimeStatuses.find((r) => r.userId === user.id);
    if (!self && socket) {
      socket.emit('status_change', {
        userId: user.id,
        userName: user.name,
        role: user.role,
        status: OfficeStatus.AVAILABLE,
        activity: 1,
      });
    }
  }, [user.id, socket, hasSynced, realtimeStatuses]);

  const updateStatus = (targetUserId: string, newStatus: string) => {
    let targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser && targetUserId === user.id) targetUser = user;
    if (!targetUser) {
      const fromPresence = realtimeStatuses.find((r) => r.userId === targetUserId);
      if (fromPresence) {
        targetUser = {
          id: fromPresence.userId,
          name: fromPresence.userName,
          email: '',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${fromPresence.userName}`,
          role: fromPresence.role as any,
          createdAt: '',
        } as User;
      }
    }
    if (!targetUser) return;

    const statusData = {
      userId: targetUserId,
      userName: targetUser.name,
      role: targetUser.role,
      status: newStatus as OfficeStatus,
      lastUpdate: new Date().toISOString(),
      activity: targetUserId === user.id ? 1 : undefined,
    } as RealtimeStatus;

    if (socket) {
      socket.emit('status_change', statusData);
    }

    setRealtimeStatuses(prev => {
      const filtered = prev.filter(s => s.userId !== targetUserId);
      return [...filtered, statusData];
    });
  };

  const visibleUsers = realtimeStatuses.filter((r) => r.userId !== user.id);

  const getDisplayName = (u: RealtimeStatus) => {
    const fromUsers = users.find((x) => x.id === u.userId);
    const name = (fromUsers?.name || u.userName || u.userId || '').trim();
    if (name.includes('@')) return name.split('@')[0] || name;
    return name;
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Live Monitor</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Real-time user activity tracking</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{visibleUsers.length}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Active</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 overflow-hidden">
        {visibleUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-6">
              <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700" strokeWidth={2} />
            </div>
            <p className="text-lg font-semibold text-slate-400 dark:text-slate-600 mb-2">No Active Users</p>
            <p className="text-sm text-slate-400 dark:text-slate-600">Users will appear here when they're online</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 overflow-visible">
            {visibleUsers
              .slice()
              .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
              .map((u) => {
                const config = getStatusConfig(u.status);
                const displayName = getDisplayName(u);
                const rawActivity = typeof u.activity === 'number' ? u.activity : 2;
                const lastAt = typeof u.lastActivityAt === 'number'
                  ? u.lastActivityAt
                  : (typeof u.activityUpdatedAt === 'number' ? u.activityUpdatedAt : undefined);
                const isFresh = typeof lastAt === 'number' && Number.isFinite(lastAt) && (now - lastAt) <= 60_000;
                const activity = isFresh ? rawActivity : 2;
                const activityDotClass = activity === 1
                  ? 'bg-emerald-500'
                  : activity === 0
                    ? 'bg-amber-500'
                    : 'bg-slate-400';

                const shouldShowIdle = activity === 0 && u.status === OfficeStatus.AVAILABLE;
                const idleInfo = shouldShowIdle ? getIdleInfo(u.userId, now) : { idleStartMs: null as number | null, idleTotalMs: 0 };
                const idleElapsedSec = (shouldShowIdle && typeof idleInfo.idleStartMs === 'number')
                  ? Math.max(0, Math.floor((now - idleInfo.idleStartMs) / 1000))
                  : 0;

                const isHovered = hoveredUserId === u.userId;

                return (
                  <div 
                    key={u.userId} 
                    className="group px-6 py-5 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-all duration-200 relative z-10"
                    onMouseEnter={() => setHoveredUserId(u.userId)}
                    onMouseLeave={() => setHoveredUserId(null)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* User Info */}
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        {/* Avatar */}
                        <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center font-semibold text-white shadow-lg transition-all duration-200 ${config.bg || 'bg-gradient-to-br from-slate-600 to-slate-700'} ${isHovered ? 'scale-110' : 'scale-100'}`}>
                          {displayName?.charAt(0).toUpperCase() || 'U'}
                          {/* Activity Indicator */}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${activityDotClass} ring-2 ring-white dark:ring-slate-800 transition-all duration-200`} />
                        </div>

                        {/* Name & Status */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{displayName || u.userId}</p>
                            {shouldShowIdle && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-xs font-semibold">
                                Idle {formatElapsedTime(idleElapsedSec)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg} ${config.color} text-xs font-semibold`}>
                              {React.cloneElement(config.icon as any, { className: 'w-3.5 h-3.5', strokeWidth: 2.5 })}
                              {u.status}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                              {formatElapsedTime(Math.floor((now - new Date(u.lastUpdate).getTime()) / 1000))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="relative flex-shrink-0">
                        <button className={`flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold transition-all duration-200 border border-slate-200/50 dark:border-slate-700/50 ${isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <UserCog className="w-4 h-4" strokeWidth={2.5} />
                          Override
                        </button>

                        {/* Dropdown Menu - FIXED: Added z-[100] to appear above all content */}
                        <div className={`absolute right-0 top-full mt-2 min-w-[200px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 z-[100] ${isHovered ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2 pointer-events-none'}`}>
                          <div className="py-2">
                            {settings.availableStatuses.map((status) => (
                              <button
                                key={status}
                                onClick={() => updateStatus(u.userId, status)}
                                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150"
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMonitor;
