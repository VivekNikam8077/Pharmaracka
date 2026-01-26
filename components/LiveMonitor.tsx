
import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { User, OfficeStatus, RealtimeStatus, UserRole, AppSettings } from '../types';
import { getStatusConfig } from '../constants';
import { RefreshCcw, Activity, UserCog, Clock, CheckCircle2 } from 'lucide-react';

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

const LiveMonitor: React.FC<LiveMonitorProps> = ({ user, realtimeStatuses, setRealtimeStatuses, users = [], settings, socket, hasSynced, serverOffsetMs = 0 }) => {
  const refreshData = () => {};

  const [now, setNow] = useState(() => Date.now() + serverOffsetMs);

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

    // Emit to socket server
    if (socket) {
      socket.emit('status_change', statusData);
    }

    // Update local state immediately for snappy UI
    setRealtimeStatuses(prev => {
      const filtered = prev.filter(s => s.userId !== targetUserId);
      return [...filtered, statusData];
    });
  };

  const visibleUsers = realtimeStatuses;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Active Users</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Single list of currently active presence</p>
            </div>
          </div>
          <button onClick={refreshData} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-slate-500 dark:text-slate-400 transition-all text-xs font-black uppercase shadow-sm">
            <RefreshCcw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {visibleUsers.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[3rem] m-6 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 font-bold italic">
            <Activity className="w-12 h-12 mb-4 opacity-10" />
            <p className="text-sm">No users currently active on the network.</p>
            <button onClick={refreshData} className="mt-4 text-indigo-500 hover:text-indigo-600 font-black uppercase text-[10px] tracking-[0.2em] underline underline-offset-8">Scan Again</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {visibleUsers
              .slice()
              .sort((a, b) => a.userName.localeCompare(b.userName))
              .map((u) => {
                const config = getStatusConfig(u.status);
                const rawActivity = typeof u.activity === 'number' ? u.activity : 2;
                const lastAt = typeof u.lastActivityAt === 'number'
                  ? u.lastActivityAt
                  : (typeof u.activityUpdatedAt === 'number' ? u.activityUpdatedAt : undefined);
                const isFresh = typeof lastAt === 'number' && Number.isFinite(lastAt) && (now - lastAt) <= 60_000;
                const activity = isFresh ? rawActivity : 2;
                const activityDotClass = activity === 1
                  ? 'bg-emerald-500'
                  : activity === 0
                    ? 'bg-red-500'
                    : 'bg-slate-400';
                return (
                  <div key={u.userId} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white ${config.bg || 'bg-slate-700'}`}>
                        {u.userName?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full ${activityDotClass} ring-2 ring-white dark:ring-slate-900`} title={activity === 1 ? 'Active' : activity === 0 ? 'Idle' : 'Offline'} />
                          <p className="text-sm font-black text-slate-900 dark:text-white truncate">{u.userName || u.userId}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl ${config.bg} ${config.color} ring-1 ring-current/10`}>
                        {React.cloneElement(config.icon as any, { className: 'w-4 h-4' })}
                        <span className="text-[10px] font-black uppercase tracking-widest">{u.status}</span>
                      </div>

                      <div className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        <Clock className="w-3 h-3" />
                        {new Date(u.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      <div className="hidden md:flex items-center gap-2 text-[10px] font-black text-slate-500 dark:text-slate-400">
                        <span className="uppercase tracking-widest">Timer</span>
                        <span className="font-mono">{formatElapsedTime(Math.floor((now - new Date(u.lastUpdate).getTime()) / 1000))}</span>
                      </div>

                      <div className="relative group/menu">
                        <button className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                          <UserCog className="w-4 h-4" /> Override
                        </button>

                        <div className="absolute right-0 top-full mt-3 min-w-[220px] bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-2xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 overflow-hidden py-2">
                          {settings.availableStatuses.map((status) => (
                            <button
                              key={status}
                              onClick={() => updateStatus(u.userId, status)}
                              className="w-full text-left px-5 py-2.5 text-[10px] font-black text-slate-500 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                            >
                              {status}
                            </button>
                          ))}
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
