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

const STORAGE_KEY_PREFIX = 'officely_session_';
const SESSION_STATS_KEY = 'officely_session_stats_';
const IDLE_TRACK_KEY = 'officely_idle_track_v1';
const TIME_UPDATE_INTERVAL = 5 * 60 * 1000;
const DEBOUNCE_SAVE_MS = 1000;

interface SessionStats {
  date: string;
  productiveMinutes: number;
  lunchMinutes: number;
  snacksMinutes: number;
  refreshmentMinutes: number;
  feedbackMinutes: number;
  crossUtilMinutes: number;
  lastSavedAt: number;
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
  const periodicUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isChangingStatusRef = useRef(false);
  const currentStatusRef = useRef<OfficeStatus>(OfficeStatus.AVAILABLE);
  const dbSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDbSaveRef = useRef<number>(0);
  const pendingSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      localStorage.setItem(statsKey, JSON.stringify({
        ...stats,
        lastSavedAt: Date.now() + serverOffsetMs
      }));
    } catch (e) {}
  };

  const loadSessionStats = (today: string): SessionStats => {
    const statsKey = `${SESSION_STATS_KEY}${user.id}`;
    try {
      const stored = localStorage.getItem(statsKey);
      if (stored) {
        const stats: SessionStats = JSON.parse(stored);
        if (stats.date === today) return stats;
      }
    } catch (e) {}
    
    return {
      date: today,
      productiveMinutes: 0,
      lunchMinutes: 0,
      snacksMinutes: 0,
      refreshmentMinutes: 0,
      feedbackMinutes: 0,
      crossUtilMinutes: 0,
      lastSavedAt: Date.now() + serverOffsetMs
    };
  };

  const getCurrentSessionMinutes = (now: number): number => {
    return Math.floor((now - statusChangeTimeRef.current) / 60000);
  };

  const saveStatsToDatabase = async (options?: { immediate?: boolean }) => {
    if (!socket || !sessionStartTime) return;
    
    const now = Date.now() + serverOffsetMs;
    const timeSinceLastSave = now - lastDbSaveRef.current;
    
    if (!options?.immediate && timeSinceLastSave < DEBOUNCE_SAVE_MS) {
      return;
    }
    
    try {
      const today = toISTDateString(new Date(now));
      const sessionStats = loadSessionStats(today);
      const currentSessionMinutes = getCurrentSessionMinutes(now);
      
      let productiveMinutes = sessionStats.productiveMinutes;
      let lunchMinutes = sessionStats.lunchMinutes;
      let snacksMinutes = sessionStats.snacksMinutes;
      let refreshmentMinutes = sessionStats.refreshmentMinutes;
      let feedbackMinutes = sessionStats.feedbackMinutes;
      let crossUtilMinutes = sessionStats.crossUtilMinutes;
      
      switch (currentStatus) {
        case OfficeStatus.AVAILABLE:
          productiveMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.LUNCH:
          lunchMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.SNACKS:
          snacksMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.REFRESHMENT_BREAK:
          refreshmentMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.QUALITY_FEEDBACK:
          feedbackMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.CROSS_UTILIZATION:
          crossUtilMinutes += currentSessionMinutes;
          break;
      }
      
      const totalMinutes = productiveMinutes + lunchMinutes + snacksMinutes + 
                          refreshmentMinutes + feedbackMinutes + crossUtilMinutes;
      
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
        productiveMinutes,
        lunchMinutes,
        snacksMinutes,
        refreshmentMinutes,
        feedbackMinutes,
        crossUtilMinutes,
        totalMinutes,
        isLeave: false
      });
      
      lastDbSaveRef.current = now;
    } catch (e) {
      console.error('[Dashboard] ❌ Error saving to database:', e);
    }
  };

  const scheduleImmediateSave = () => {
    if (pendingSaveTimeoutRef.current) {
      clearTimeout(pendingSaveTimeoutRef.current);
    }
    
    pendingSaveTimeoutRef.current = setTimeout(() => {
      saveStatsToDatabase({ immediate: true });
      pendingSaveTimeoutRef.current = null;
    }, 500);
  };

  const sendPeriodicUpdate = () => {
    if (!socket || !socket.connected || !sessionStartTime) return;
    
    socket.emit('status_change', {
      userId: user.id,
      userName: user.name,
      status: currentStatus,
      role: user.role,
      activity: 1,
      periodicUpdate: true,
    });
  };

  // ✅ SIMPLE: Just fetch from database immediately on mount
  useEffect(() => {
    if (!user.id) return;
    
    const initializeSession = async () => {
      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));
      
      console.log('[Dashboard] 🔄 Loading session from database...');
      
      try {
        const serverIp = localStorage.getItem('officely_server_ip') || 'https://server2-e3p9.onrender.com';
        const response = await fetch(
          `${serverIp}/api/Office/session-state?userId=${user.id}&date=${today}`
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('[Dashboard] 📥 Received:', data);
        
        if (data.ok && data.sessionState && data.sessionState.loginTime && data.sessionState.loginTime !== '00:00:00') {
          // ✅ RESTORE existing session
          console.log('[Dashboard] ♻️ Restoring session from database');
          
          const [hours, minutes, seconds] = data.sessionState.loginTime.split(':').map(Number);
          const sessionStart = new Date();
          sessionStart.setHours(hours, minutes, seconds || 0, 0);
          
          setSessionStartTime(sessionStart.getTime());
          
          // Load stats
          localStorage.setItem(`${SESSION_STATS_KEY}${user.id}`, JSON.stringify({
            date: today,
            productiveMinutes: data.sessionState.productiveMinutes || 0,
            lunchMinutes: data.sessionState.lunchMinutes || 0,
            snacksMinutes: data.sessionState.snacksMinutes || 0,
            refreshmentMinutes: data.sessionState.refreshmentMinutes || 0,
            feedbackMinutes: data.sessionState.feedbackMinutes || 0,
            crossUtilMinutes: data.sessionState.crossUtilMinutes || 0,
            lastSavedAt: now
          }));
          
          setCurrentStatus(OfficeStatus.AVAILABLE);
          currentStatusRef.current = OfficeStatus.AVAILABLE;
          statusChangeTimeRef.current = now;
          
          console.log('[Dashboard] ✅ Restored:', data.sessionState.loginTime, 'with', data.sessionState.productiveMinutes, 'productive mins');
          
        } else {
          // ✅ NEW session
          console.log('[Dashboard] 🆕 Starting new session');
          
          setSessionStartTime(now);
          setCurrentStatus(OfficeStatus.AVAILABLE);
          currentStatusRef.current = OfficeStatus.AVAILABLE;
          statusChangeTimeRef.current = now;
          
          saveSessionStats({
            date: today,
            productiveMinutes: 0,
            lunchMinutes: 0,
            snacksMinutes: 0,
            refreshmentMinutes: 0,
            feedbackMinutes: 0,
            crossUtilMinutes: 0,
            lastSavedAt: now
          });
          
          if (socket) {
            socket.emit('status_change', {
              userId: user.id,
              userName: user.name,
              status: OfficeStatus.AVAILABLE,
              role: user.role,
              activity: 1,
            });
          }
        }
        
        scheduleImmediateSave();
        
      } catch (error) {
        console.error('[Dashboard] ❌ Failed to load session:', error);
        
        // Fallback to new session
        const now = Date.now() + serverOffsetMs;
        const today = toISTDateString(new Date(now));
        
        setSessionStartTime(now);
        setCurrentStatus(OfficeStatus.AVAILABLE);
        currentStatusRef.current = OfficeStatus.AVAILABLE;
        statusChangeTimeRef.current = now;
        
        saveSessionStats({
          date: today,
          productiveMinutes: 0,
          lunchMinutes: 0,
          snacksMinutes: 0,
          refreshmentMinutes: 0,
          feedbackMinutes: 0,
          crossUtilMinutes: 0,
          lastSavedAt: now
        });
      }
    };
    
    initializeSession();
  }, [user.id]); // Only run once when component mounts

  useEffect(() => {
    if (!socket || !sessionStartTime) return;

    if (periodicUpdateRef.current) {
      clearInterval(periodicUpdateRef.current);
    }

    sendPeriodicUpdate();
    periodicUpdateRef.current = setInterval(sendPeriodicUpdate, TIME_UPDATE_INTERVAL);

    return () => {
      if (periodicUpdateRef.current) {
        clearInterval(periodicUpdateRef.current);
        periodicUpdateRef.current = null;
      }
    };
  }, [socket, sessionStartTime, currentStatus, user.id, user.name, user.role]);

  useEffect(() => {
    if (!socket || !sessionStartTime) return;

    if (dbSaveIntervalRef.current) {
      clearInterval(dbSaveIntervalRef.current);
    }

    saveStatsToDatabase({ immediate: true });
    
    dbSaveIntervalRef.current = setInterval(() => {
      saveStatsToDatabase({ immediate: true });
    }, TIME_UPDATE_INTERVAL);

    return () => {
      if (dbSaveIntervalRef.current) {
        clearInterval(dbSaveIntervalRef.current);
        dbSaveIntervalRef.current = null;
      }
    };
  }, [socket, sessionStartTime]);

  useEffect(() => {
    return () => {
      if (pendingSaveTimeoutRef.current) {
        clearTimeout(pendingSaveTimeoutRef.current);
      }
      if (socket && sessionStartTime) {
        saveStatsToDatabase({ immediate: true });
      }
    };
  }, [socket, sessionStartTime]);

  useEffect(() => {
    if (!sessionStartTime) return;
    
    currentStatusRef.current = currentStatus;
    
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
      const currentSessionMinutes = getCurrentSessionMinutes(currentTime);
      
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

      switch (currentStatus) {
        case OfficeStatus.AVAILABLE:
          stats.productiveMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.LUNCH:
          stats.lunchMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.SNACKS:
          stats.snacksMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.REFRESHMENT_BREAK:
          stats.refreshmentMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.QUALITY_FEEDBACK:
          stats.feedbackMinutes += currentSessionMinutes;
          break;
        case OfficeStatus.CROSS_UTILIZATION:
          stats.crossUtilMinutes += currentSessionMinutes;
          break;
      }

      try {
        const idleStore = JSON.parse(localStorage.getItem(IDLE_TRACK_KEY) || '{}');
        const dayBucket = idleStore[todayDate] || {};
        const userIdle = dayBucket[user.id] || {};
        
        let totalIdleMs = userIdle.idleTotalMs || 0;
        if (typeof userIdle.idleStartMs === 'number') {
          totalIdleMs += Math.max(0, currentTime - userIdle.idleStartMs);
        }
        
        stats.idleMinutes = Math.floor(totalIdleMs / 60000);
      } catch (e) {}

      stats.totalMinutes = stats.productiveMinutes + stats.lunchMinutes + stats.snacksMinutes +
        stats.refreshmentMinutes + stats.feedbackMinutes + stats.crossUtilMinutes;

      setTodayStats(stats);
    };

    calculateStats();
    const interval = setInterval(calculateStats, 1000);
    
    return () => clearInterval(interval);
  }, [sessionStartTime, currentStatus, user.id, serverOffsetMs]);

  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket || !socket.connected) {
      alert('Not connected to server. Please wait...');
      return;
    }

    if (newStatus === currentStatus) return;
    
    isChangingStatusRef.current = true;
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const timeInOldStatus = getCurrentSessionMinutes(now);
    const sessionStats = loadSessionStats(today);
    
    console.log('[Dashboard] 🔄 Changing:', currentStatus, '→', newStatus);
    
    switch (currentStatus) {
      case OfficeStatus.AVAILABLE:
        sessionStats.productiveMinutes += timeInOldStatus;
        break;
      case OfficeStatus.LUNCH:
        sessionStats.lunchMinutes += timeInOldStatus;
        break;
      case OfficeStatus.SNACKS:
        sessionStats.snacksMinutes += timeInOldStatus;
        break;
      case OfficeStatus.REFRESHMENT_BREAK:
        sessionStats.refreshmentMinutes += timeInOldStatus;
        break;
      case OfficeStatus.QUALITY_FEEDBACK:
        sessionStats.feedbackMinutes += timeInOldStatus;
        break;
      case OfficeStatus.CROSS_UTILIZATION:
        sessionStats.crossUtilMinutes += timeInOldStatus;
        break;
    }
    
    saveSessionStats(sessionStats);
    setCurrentStatus(newStatus);
    currentStatusRef.current = newStatus;
    statusChangeTimeRef.current = now;
    
    socket.emit('status_change', {
      userId: user.id,
      userName: user.name,
      status: newStatus,
      role: user.role,
      activity: 1,
    });
    
    setTimeout(() => {
      saveStatsToDatabase({ immediate: true });
      isChangingStatusRef.current = false;
    }, 500);
  };

  const prevServerStatusRef = useRef<OfficeStatus | null>(null);
  
  useEffect(() => {
    if (isChangingStatusRef.current) return;
    
    const myStatus = realtimeStatuses.find(s => s.userId === user.id);
    if (!myStatus) return;
    
    const serverStatus = myStatus.status;
    const localStatus = currentStatusRef.current;
    
    if (prevServerStatusRef.current === serverStatus) return;
    if (serverStatus === localStatus) {
      prevServerStatusRef.current = serverStatus;
      return;
    }
    
    prevServerStatusRef.current = serverStatus;
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const timeInOldStatus = getCurrentSessionMinutes(now);
    const sessionStats = loadSessionStats(today);
    
    switch (localStatus) {
      case OfficeStatus.AVAILABLE:
        sessionStats.productiveMinutes += timeInOldStatus;
        break;
      case OfficeStatus.LUNCH:
        sessionStats.lunchMinutes += timeInOldStatus;
        break;
      case OfficeStatus.SNACKS:
        sessionStats.snacksMinutes += timeInOldStatus;
        break;
      case OfficeStatus.REFRESHMENT_BREAK:
        sessionStats.refreshmentMinutes += timeInOldStatus;
        break;
      case OfficeStatus.QUALITY_FEEDBACK:
        sessionStats.feedbackMinutes += timeInOldStatus;
        break;
      case OfficeStatus.CROSS_UTILIZATION:
        sessionStats.crossUtilMinutes += timeInOldStatus;
        break;
    }
    
    saveSessionStats(sessionStats);
    setCurrentStatus(serverStatus);
    currentStatusRef.current = serverStatus;
    statusChangeTimeRef.current = now;
    
    scheduleImmediateSave();
  }, [realtimeStatuses, user.id, serverOffsetMs]);

  useEffect(() => {
    if (!socket) return;

    const handleClearIdleData = () => {
      try {
        localStorage.removeItem(IDLE_TRACK_KEY);
        setTodayStats(prev => ({ ...prev, idleMinutes: 0 }));
        scheduleImmediateSave();
      } catch (e) {}
    };

    socket.on('clear_idle_data', handleClearIdleData);
    return () => socket.off('clear_idle_data', handleClearIdleData);
  }, [socket]);

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
  const isActive = myStatus?.activity === 1;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white mb-2">
          Welcome back, {user.name}! 👋
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track your productivity • Saves to database every 5 minutes
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current Status</h2>
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
                  {isSelected && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-lg" />}
                </button>
              );
            })}
          </div>
        </div>

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
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                }) : '--:--'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Current</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                {new Date(Date.now() + serverOffsetMs).toLocaleTimeString('en-IN', { 
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Today's Activity</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { label: 'Productive', value: todayStats.productiveMinutes, icon: CheckCircle2, color: 'from-emerald-500 to-teal-600' },
            { label: 'Lunch', value: todayStats.lunchMinutes, icon: Coffee, color: 'from-orange-500 to-amber-600' },
            { label: 'Snacks', value: todayStats.snacksMinutes, icon: Cookie, color: 'from-yellow-500 to-orange-500' },
            { label: 'Break', value: todayStats.refreshmentMinutes, icon: Sparkles, color: 'from-blue-500 to-cyan-600' },
            { label: 'Feedback', value: todayStats.feedbackMinutes, icon: MessageSquare, color: 'from-purple-500 to-pink-600' },
            { label: 'Cross-Util', value: todayStats.crossUtilMinutes, icon: Users, color: 'from-indigo-500 to-purple-600' },
            { label: 'Idle Time', value: todayStats.idleMinutes, icon: Timer, color: 'from-slate-500 to-slate-600' },
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
