import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Socket } from 'socket.io-client';
import { User, OfficeStatus, RealtimeStatus, AppSettings } from '../types';
import { getStatusConfig } from '../constants';
import { Activity, UserCog, Clock, Users, RefreshCw } from 'lucide-react';

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

interface OverrideDropdownProps {
  anchorRef: React.RefObject<HTMLButtonElement>;
  statuses: string[];
  onSelect: (status: string) => void;
  onClose: () => void;
}

const OverrideDropdown: React.FC<OverrideDropdownProps> = ({ anchorRef, statuses, onSelect, onClose }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getStyle = (): React.CSSProperties => {
    if (!anchorRef.current) return { position: 'fixed', top: 0, left: 0, zIndex: 99999 };
    const rect = anchorRef.current.getBoundingClientRect();
    const dropdownWidth = 200;
    const left = Math.max(8, rect.right - dropdownWidth);
    return {
      position: 'fixed',
      top: rect.bottom + 6,
      left,
      width: dropdownWidth,
      zIndex: 99999,
    };
  };

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose, anchorRef]);

  const menu = (
    <div
      ref={dropdownRef}
      style={getStyle()}
      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
    >
      <div className="py-2">
        {statuses.map((status) => (
          <button
            key={status}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(status);
              onClose();
            }}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150"
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
};

interface UserRowProps {
  u: RealtimeStatus;
  displayName: string;
  now: number;
  settings: AppSettings;
  onUpdateStatus: (userId: string, status: string) => void;
  formatElapsedTime: (s: number) => string;
}

const UserRow: React.FC<UserRowProps> = ({
  u,
  displayName,
  now,
  settings,
  onUpdateStatus,
  formatElapsedTime,
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const config = getStatusConfig(u.status);
  
  // ✅ Activity state comes from server/Dashboard
  const rawActivity = typeof u.activity === 'number' ? u.activity : 2;
  const lastAt = typeof u.lastActivityAt === 'number'
    ? u.lastActivityAt
    : (typeof u.activityUpdatedAt === 'number' ? u.activityUpdatedAt : undefined);
  const isFresh = typeof lastAt === 'number' && Number.isFinite(lastAt) && (now - lastAt) <= 60_000;
  const activity = isFresh ? rawActivity : 2;

  const activityDotClass =
    activity === 1 ? 'bg-emerald-500' :
    activity === 0 ? 'bg-amber-500' :
    'bg-slate-400';

  // ✅ Show idle badge only if activity is 0 (idle)
  const isIdle = activity === 0;

  // ✅ Time since last update from database
  const timeSinceUpdate = Math.max(0, Math.floor((now - new Date(u.lastUpdate).getTime()) / 1000));

  return (
    <div className="group px-6 py-5 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-all duration-200">
      <div className="flex items-center justify-between gap-4">
        {/* Avatar + Info */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center font-semibold text-white shadow-lg ${config.bg || 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
            {displayName?.charAt(0).toUpperCase() || 'U'}
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${activityDotClass} ring-2 ring-white dark:ring-slate-800`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {displayName || u.userId}
              </p>
              {isIdle && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-xs font-semibold whitespace-nowrap">
                  Idle
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
                {formatElapsedTime(timeSinceUpdate)}
              </div>
            </div>
          </div>
        </div>

        {/* Override Button - Only for changing status, NOT timing */}
        <div className="relative flex-shrink-0">
          <button
            ref={btnRef}
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold transition-all duration-200 border border-slate-200/50 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <UserCog className="w-4 h-4" strokeWidth={2.5} />
            Override
          </button>

          {open && (
            <OverrideDropdown
              anchorRef={btnRef}
              statuses={settings.availableStatuses}
              onSelect={(status) => onUpdateStatus(u.userId, status)}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const formatElapsedTime = (seconds: number) => {
    if (!seconds || seconds < 0) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // ✅ Clock updates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() + serverOffsetMs), 1000);
    return () => clearInterval(interval);
  }, [serverOffsetMs]);

  // ✅ Ensure current user appears in presence
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
  }, [user.id, socket, hasSynced, realtimeStatuses, user.name, user.role]);

  // ✅ Status change - ONLY changes state, timing is tracked by Dashboard
  const updateStatus = useCallback((targetUserId: string, newStatus: string) => {
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

    console.log('[LiveMonitor] 🔄 Changing status for', targetUserId, 'to', newStatus);

    const statusData = {
      userId: targetUserId,
      userName: targetUser.name,
      role: targetUser.role,
      status: newStatus as OfficeStatus,
      lastUpdate: new Date().toISOString(),
      activity: targetUserId === user.id ? 1 : undefined,
    } as RealtimeStatus;

    // ✅ Send to backend - timing will be calculated by Dashboard component
    if (socket) {
      socket.emit('status_change', statusData);
    }

    // ✅ Update local state immediately for UI responsiveness
    setRealtimeStatuses(prev => {
      const filtered = prev.filter(s => s.userId !== targetUserId);
      return [...filtered, statusData];
    });

    console.log('[LiveMonitor] ✅ Status change sent to server');
  }, [users, user, realtimeStatuses, socket, setRealtimeStatuses]);

  // ✅ Manual refresh - gets latest data from server
  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    console.log('[LiveMonitor] 🔄 Refreshing data from server...');
    
    // The system_sync event will automatically update realtimeStatuses
    // Just trigger a re-sync by emitting a status change for current user
    if (socket?.connected) {
      const self = realtimeStatuses.find(r => r.userId === user.id);
      if (self) {
        socket.emit('status_change', {
          userId: user.id,
          userName: user.name,
          role: user.role,
          status: self.status,
          activity: 1,
          periodicUpdate: true,
        });
      }
    }
    
    setTimeout(() => {
      setIsRefreshing(false);
      console.log('[LiveMonitor] ✅ Refresh complete');
    }, 1000);
  }, [isRefreshing, socket, realtimeStatuses, user]);

  const visibleUsers = realtimeStatuses.filter((r) => r.userId !== user.id);

  const getDisplayName = (u: RealtimeStatus) => {
    const fromUsers = users.find((x) => x.id === u.userId);
    const name = (fromUsers?.name || u.userName || u.userId || '').trim();
    if (name.includes('@')) return name.split('@')[0] || name;
    return name;
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1">
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Live Monitor</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time status tracking • Timing data from Dashboard
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
          <span className="text-sm font-semibold">Refresh</span>
        </button>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{visibleUsers.length}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Active</span>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Data Source: Real-time Database
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Status changes update immediately. Time tracking is calculated by each user's Dashboard and auto-saved to database every 5 minutes.
            </p>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5">
        {visibleUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-6">
              <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700" strokeWidth={2} />
            </div>
            <p className="text-lg font-semibold text-slate-400 dark:text-slate-600 mb-2">No Active Users</p>
            <p className="text-sm text-slate-400 dark:text-slate-600">Users will appear here when they're online</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50 rounded-3xl overflow-hidden">
            {visibleUsers
              .slice()
              .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
              .map((u) => (
                <UserRow
                  key={u.userId}
                  u={u}
                  displayName={getDisplayName(u)}
                  now={now}
                  settings={settings}
                  onUpdateStatus={updateStatus}
                  formatElapsedTime={formatElapsedTime}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMonitor;
