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
  Zap
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

const STORAGE_KEY_PREFIX = 'officely_session_';
const SESSION_STATS_KEY = 'officely_session_stats_';
const IDLE_TRACK_KEY = 'officely_idle_track_v1';

interface SessionStats {
  date: string;
  productiveMinutes: number;
  lunchMinutes: number;
  snacksMinutes: number;
  refreshmentMinutes: number;
  feedbackMinutes: number;
  crossUtilMinutes: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  settings,
  realtimeStatuses,
  setRealtimeStatuses,
  socket,
  hasSynced,
  serverOffsetMs
}) => {
  const [currentStatus, setCurrentStatus] = useState<OfficeStatus>(OfficeStatus.AVAILABLE);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusDuration, setStatusDuration] = useState(0);
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

  const saveSessionStats = (stats: SessionStats) => {
    const statsKey = `${SESSION_STATS_KEY}${user.id}`;
    try {
      localStorage.setItem(statsKey, JSON.stringify(stats));
    } catch (e) {
      console.error('[Dashboard] Failed to save session stats:', e);
    }
  };

  const loadSessionStats = (today: string): SessionStats => {
    const statsKey = `${SESSION_STATS_KEY}${user.id}`;
    try {
      const stored = localStorage.getItem(statsKey);
      if (stored) {
        const stats: SessionStats = JSON.parse(stored);
        if (stats.date === today) return stats;
      }
    } catch (e) {
      console.error('[Dashboard] Failed to load session stats:', e);
    }
    
    return {
      date: today,
      productiveMinutes: 0,
      lunchMinutes: 0,
      snacksMinutes: 0,
      refreshmentMinutes: 0,
      feedbackMinutes: 0,
      crossUtilMinutes: 0,
    };
  };

  // ✅ Fixed: Now properly emits initial status when socket connects
  useEffect(() => {
    if (!socket || !hasSynced) return;
    
    const sessionKey = `${STORAGE_KEY_PREFIX}${user.id}`;
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    
    const stored = localStorage.getItem(sessionKey);
    let initialStatus = OfficeStatus.AVAILABLE;
    
    if (stored) {
      try {
        const data = JSON.parse(stored);
        
        if (data.date === today && data.startTime) {
          setSessionStartTime(data.startTime);
          setCurrentStatus(data.status || OfficeStatus.AVAILABLE);
          statusChangeTimeRef.current = data.statusChangeTime || data.startTime;
          initialStatus = data.status || OfficeStatus.AVAILABLE;
        } else {
          const newStartTime = now;
          setSessionStartTime(newStartTime);
          setCurrentStatus(OfficeStatus.AVAILABLE);
          statusChangeTimeRef.current = newStartTime;
          
          localStorage.setItem(sessionKey, JSON.stringify({
            date: today,
            startTime: newStartTime,
            status: OfficeStatus.AVAILABLE,
            statusChangeTime: newStartTime
          }));
          
          saveSessionStats({
            date: today,
            productiveMinutes: 0,
            lunchMinutes: 0,
            snacksMinutes: 0,
            refreshmentMinutes: 0,
            feedbackMinutes: 0,
            crossUtilMinutes: 0,
          });
        }
      } catch (e) {
        console.error('[Dashboard] Failed to restore session:', e);
      }
    } else {
      const newStartTime = now;
      setSessionStartTime(newStartTime);
      setCurrentStatus(OfficeStatus.AVAILABLE);
      statusChangeTimeRef.current = newStartTime;
      
      localStorage.setItem(sessionKey, JSON.stringify({
        date: today,
        startTime: newStartTime,
        status: OfficeStatus.AVAILABLE,
        statusChangeTime: newStartTime
      }));
      
      saveSessionStats({
        date: today,
        productiveMinutes: 0,
        lunchMinutes: 0,
        snacksMinutes: 0,
        refreshmentMinutes: 0,
        feedbackMinutes: 0,
        crossUtilMinutes: 0,
      });
    }
    
    // ✅ CRITICAL FIX: Emit initial status to socket so LiveMonitor can see this user
    socket.emit('status_change', {
      userId: user.id,
      userName: user.name,
      status: initialStatus,
      role: user.role,
      activity: 1,
    });
    
    console.log('[Dashboard] ✅ Emitted initial status:', initialStatus, 'for user:', user.name);
  }, [user.id, user.name, user.role, serverOffsetMs, socket, hasSynced]);

  useEffect(() => {
    if (!sessionStartTime) return;
    
    const sessionKey = `${STORAGE_KEY_PREFIX}${user.id}`;
    const now = Date.now() + serverOffsetMs;
    
    localStorage.setItem(sessionKey, JSON.stringify({
      date: toISTDateString(new Date(now)),
      startTime: sessionStartTime,
      status: currentStatus,
      statusChangeTime: statusChangeTimeRef.current
    }));
  }, [currentStatus, sessionStartTime, user.id, serverOffsetMs]);

  useEffect(() => {
    if (!sessionStartTime) return;

    const updateTimer = () => {
      const now = Date.now() + serverOffsetMs;
      setElapsedTime(now - sessionStartTime);
      setStatusDuration(now - statusChangeTimeRef.current);
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionStartTime, serverOffsetMs]);

  useEffect(() => {
    if (!sessionStartTime) return;

    const calculateStats = () => {
      const currentTime = Date.now() + serverOffsetMs;
      const todayDate = toISTDateString(new Date(currentTime));
      
      const sessionStats = loadSessionStats(todayDate);
      
      let stats = {
        productiveMinutes: sessionStats.productiveMinutes,
        lunchMinutes: sessionStats.lunchMinutes,
        snacksMinutes: sessionStats.snacksMinutes,
        refreshmentMinutes: sessionStats.refreshmentMinutes,
        feedbackMinutes: sessionStats.feedbackMinutes,
        crossUtilMinutes: sessionStats.crossUtilMinutes,
        totalMinutes: 0,
        idleMinutes: 0,
      };

      const currentSessionDuration = Math.floor((currentTime - statusChangeTimeRef.current) / 60000);
      
      switch (currentStatus) {
        case OfficeStatus.AVAILABLE:
          stats.productiveMinutes += currentSessionDuration;
          break;
        case OfficeStatus.LUNCH:
          stats.lunchMinutes += currentSessionDuration;
          break;
        case OfficeStatus.SNACKS:
          stats.snacksMinutes += currentSessionDuration;
          break;
        case OfficeStatus.REFRESHMENT_BREAK:
          stats.refreshmentMinutes += currentSessionDuration;
          break;
        case OfficeStatus.QUALITY_FEEDBACK:
          stats.feedbackMinutes += currentSessionDuration;
          break;
        case OfficeStatus.CROSS_UTILIZATION:
          stats.crossUtilMinutes += currentSessionDuration;
          break;
      }

      try {
        const idleStore = JSON.parse(localStorage.getItem(IDLE_TRACK_KEY) || '{}');
        const dayBucket = idleStore[todayDate] || {};
        const userIdle = dayBucket[user.id] || {};
        
        let totalIdleMs = userIdle.idleTotalMs || 0;
        if (typeof userIdle.idleStartMs === 'number') {
          const delta = Math.max(0, currentTime - userIdle.idleStartMs);
          totalIdleMs += delta;
        }
        
        stats.idleMinutes = Math.floor(totalIdleMs / 60000);
      } catch (e) {
        console.error('[Dashboard] Failed to get idle data:', e);
      }

      stats.totalMinutes = stats.productiveMinutes + stats.lunchMinutes + stats.snacksMinutes +
        stats.refreshmentMinutes + stats.feedbackMinutes + stats.crossUtilMinutes;

      setTodayStats(stats);
    };

    calculateStats();
    const interval = setInterval(calculateStats, 1000);
    
    return () => clearInterval(interval);
  }, [sessionStartTime, currentStatus, statusChangeTimeRef.current, user.id, serverOffsetMs]);

  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket || !socket.connected) {
      alert('Not connected to server. Please wait...');
      return;
    }

    if (newStatus === currentStatus) return;
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    
    const timeInCurrentStatus = Math.floor((now - statusChangeTimeRef.current) / 60000);
    const sessionStats = loadSessionStats(today);
    
    switch (currentStatus) {
      case OfficeStatus.AVAILABLE:
        sessionStats.productiveMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.LUNCH:
        sessionStats.lunchMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.SNACKS:
        sessionStats.snacksMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.REFRESHMENT_BREAK:
        sessionStats.refreshmentMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.QUALITY_FEEDBACK:
        sessionStats.feedbackMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.CROSS_UTILIZATION:
        sessionStats.crossUtilMinutes += timeInCurrentStatus;
        break;
    }
    
    saveSessionStats(sessionStats);
    setCurrentStatus(newStatus);
    statusChangeTimeRef.current = now;
    
    socket.emit('status_change', {
      userId: user.id,
      userName: user.name,
      status: newStatus,
      role: user.role,
      activity: 1,
    });
    
    console.log('[Dashboard] Status changed to:', newStatus);
  };

  useEffect(() => {
    const myStatus = realtimeStatuses.find(s => s.userId === user.id);
    if (!myStatus || myStatus.status === currentStatus) return;
    
    const newStatus = myStatus.status;
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    
    const timeInCurrentStatus = Math.floor((now - statusChangeTimeRef.current) / 60000);
    const sessionStats = loadSessionStats(today);
    
    switch (currentStatus) {
      case OfficeStatus.AVAILABLE:
        sessionStats.productiveMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.LUNCH:
        sessionStats.lunchMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.SNACKS:
        sessionStats.snacksMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.REFRESHMENT_BREAK:
        sessionStats.refreshmentMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.QUALITY_FEEDBACK:
        sessionStats.feedbackMinutes += timeInCurrentStatus;
        break;
      case OfficeStatus.CROSS_UTILIZATION:
        sessionStats.crossUtilMinutes += timeInCurrentStatus;
        break;
    }
    
    saveSessionStats(sessionStats);
    setCurrentStatus(newStatus);
    statusChangeTimeRef.current = now;
    
    console.log('[Dashboard] Status updated from server:', newStatus);
  }, [realtimeStatuses, user.id, currentStatus, serverOffsetMs]);

  // ✅ Listen for server command to clear idle data
  useEffect(() => {
    if (!socket) return;

    const handleClearIdleData = () => {
      try {
        localStorage.removeItem(IDLE_TRACK_KEY);
        console.log('✅ [Dashboard] Cleared idle tracking data');
        
        // Reset idle minutes in current stats display
        setTodayStats(prev => ({ ...prev, idleMinutes: 0 }));
      } catch (e) {
        console.error('❌ [Dashboard] Failed to clear idle data:', e);
      }
    };

    socket.on('clear_idle_data', handleClearIdleData);

    return () => {
      socket.off('clear_idle_data', handleClearIdleData);
    };
  }, [socket]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusConfig = (status: OfficeStatus) => {
    switch (status) {
      case OfficeStatus.AVAILABLE:
        return { icon: CheckCircle2, color: 'from-emerald-500 to-teal-600', textColor: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', label: 'Available' };
      case OfficeStatus.LUNCH:
        return { icon: Coffee, color: 'from-orange-500 to-amber-600', textColor: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/20', label: 'Lunch' };
      case OfficeStatus.SNACKS:
        return { icon: Cookie, color: 'from-yellow-500 to-orange-500', textColor: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', label: 'Snacks' };
      case OfficeStatus.REFRESHMENT_BREAK:
        return { icon: Sparkles, color: 'from-blue-500 to-cyan-600', textColor: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/20', label: 'Break' };
      case OfficeStatus.QUALITY_FEEDBACK:
        return { icon: MessageSquare, color: 'from-purple-500 to-pink-600', textColor: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/20', label: 'Feedback' };
      case OfficeStatus.CROSS_UTILIZATION:
        return { icon: Users, color: 'from-indigo-500 to-purple-600', textColor: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/20', label: 'Cross-Util' };
      default:
        return { icon: Activity, color: 'from-slate-500 to-slate-600', textColor: 'text-slate-600', bgColor: 'bg-slate-50 dark:bg-slate-900/20', label: status };
    }
  };

  const currentConfig = getStatusConfig(currentStatus);
  const CurrentIcon = currentConfig.icon;

  const availableStatuses = settings.availableStatuses || [
    OfficeStatus.AVAILABLE,
    OfficeStatus.LUNCH,
    OfficeStatus.SNACKS,
    OfficeStatus.REFRESHMENT_BREAK,
    OfficeStatus.QUALITY_FEEDBACK,
    OfficeStatus.CROSS_UTILIZATION,
  ];

  const myStatus = realtimeStatuses.find(s => s.userId === user.id);
  const activityStatus = myStatus?.activity;
  const isActive = activityStatus === 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white mb-2">
          Welcome back, {user.name}! 👋
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track your productivity and manage your status
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Status */}
        <div className="lg:col-span-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current Status</h2>
            {!hasSynced && (
              <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse font-medium">Syncing...</span>
            )}
          </div>

          <div className={`flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br ${currentConfig.color} mb-6 shadow-lg`}>
            <div className="w-16 h-16 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl flex items-center justify-center shadow-lg">
              <CurrentIcon className={`w-8 h-8 ${currentConfig.textColor}`} strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-semibold text-white mb-1">{currentConfig.label}</h3>
              <p className="text-sm text-white/80 font-medium">{formatTime(statusDuration)}</p>
            </div>
            {isActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-xl border border-white/30">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-xs font-semibold text-white">Active</span>
              </div>
            )}
          </div>

          {/* Status Grid */}
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
                  className={`relative p-4 rounded-2xl border-2 transition-all duration-200 ${
                    isSelected 
                      ? `bg-gradient-to-br ${config.color} border-transparent text-white shadow-lg` 
                      : `bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 ${config.textColor}`
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icon className="w-6 h-6" strokeWidth={2.5} />
                    <span className="text-sm font-semibold">{config.label}</span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-lg" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Session Timer */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Session Timer</h2>
          
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-32 h-32 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-2xl shadow-indigo-500/25">
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
                  hour: '2-digit', 
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata'
                }) : '--:--'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Current</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                {new Date(Date.now() + serverOffsetMs).toLocaleTimeString('en-IN', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Stats */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Today's Activity</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Productive', value: todayStats.productiveMinutes, icon: CheckCircle2, color: 'from-emerald-500 to-teal-600', textColor: 'text-emerald-600' },
            { label: 'Lunch', value: todayStats.lunchMinutes, icon: Coffee, color: 'from-orange-500 to-amber-600', textColor: 'text-orange-600' },
            { label: 'Snacks', value: todayStats.snacksMinutes, icon: Cookie, color: 'from-yellow-500 to-orange-500', textColor: 'text-yellow-600' },
            { label: 'Break', value: todayStats.refreshmentMinutes, icon: Sparkles, color: 'from-blue-500 to-cyan-600', textColor: 'text-blue-600' },
            { label: 'Feedback', value: todayStats.feedbackMinutes, icon: MessageSquare, color: 'from-purple-500 to-pink-600', textColor: 'text-purple-600' },
            { label: 'Cross-Util', value: todayStats.crossUtilMinutes, icon: Users, color: 'from-indigo-500 to-purple-600', textColor: 'text-indigo-600' },
            { label: 'Idle Time', value: todayStats.idleMinutes, icon: Timer, color: 'from-slate-500 to-slate-600', textColor: 'text-slate-600' },
          ].map((stat) => (
            <div key={stat.label} className="relative group">
              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
