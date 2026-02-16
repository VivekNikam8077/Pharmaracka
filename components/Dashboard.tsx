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
const TIME_UPDATE_INTERVAL = 30_000; // Save every 30 seconds instead of 5 minutes

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

  const toISTDateString = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const toISTTimeString = (d: Date): string => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
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
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const localStats = loadFromLocalStorage(today);
    const currentSessionMinutes = getCurrentSessionMinutes(now);
    
    let productiveMinutes = localStats?.productiveMinutes || 0;
    let lunchMinutes = localStats?.lunchMinutes || 0;
    let snacksMinutes = localStats?.snacksMinutes || 0;
    let refreshmentMinutes = localStats?.refreshmentMinutes || 0;
    let feedbackMinutes = localStats?.feedbackMinutes || 0;
    let crossUtilMinutes = localStats?.crossUtilMinutes || 0;
    
    // Add current session time to appropriate bucket
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
    
    console.log('[Dashboard] 💾 Saved to DB:', { productiveMinutes, totalMinutes });
  };

  // ✅ INITIALIZE SESSION (load from DB and localStorage, use whichever is newer)
  useEffect(() => {
    if (!user.id || !socket) return;
    
    const initSession = async () => {
      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));
      
      console.log('[Dashboard] 🔄 Initializing session...');
      
      // Load from localStorage
      const localStats = loadFromLocalStorage(today);
      
      // Load from database
      let dbStats: any = null;
      try {
        const serverIp = 'https://server2-e3p9.onrender.com';
        const response = await fetch(`${serverIp}/api/Office/session-state?userId=${user.id}&date=${today}`);
        const data = await response.json();
        if (data.ok) dbStats = data.sessionState;
      } catch (e) {
        console.error('[Dashboard] DB fetch failed:', e);
      }
      
      // Determine which data to use (newest)
      let useLocal = false;
      if (localStats && dbStats) {
        useLocal = localStats.lastSavedAt > new Date(dbStats.lastupdate || 0).getTime();
      } else if (localStats && !dbStats) {
        useLocal = true;
      }
      
      console.log('[Dashboard] Data sources:', { 
        local: localStats?.productiveMinutes || 0, 
        db: dbStats?.productiveMinutes || 0,
        using: useLocal ? 'LOCAL' : 'DB'
      });
      
      if (useLocal && localStats) {
        // Use localStorage data
        const [hh, mm, ss] = localStats.loginTime.split(':').map(Number);
        const loginDate = new Date();
        loginDate.setHours(hh, mm, ss);
        
        setSessionStartTime(loginDate.getTime());
        setCurrentStatus(OfficeStatus.AVAILABLE);
        currentStatusRef.current = OfficeStatus.AVAILABLE;
        statusChangeTimeRef.current = now;
        
        console.log('[Dashboard] ✅ Restored from localStorage:', localStats.productiveMinutes, 'mins');
        
      } else if (dbStats && dbStats.loginTime && dbStats.loginTime !== '00:00:00') {
        // Use database data
        const [hh, mm, ss] = dbStats.loginTime.split(':').map(Number);
        const loginDate = new Date();
        loginDate.setHours(hh, mm, ss);
        
        setSessionStartTime(loginDate.getTime());
        setCurrentStatus(OfficeStatus.AVAILABLE);
        currentStatusRef.current = OfficeStatus.AVAILABLE;
        statusChangeTimeRef.current = now;
        
        // Save to localStorage
        saveToLocalStorage({
          date: today,
          loginTime: dbStats.loginTime,
          productiveMinutes: dbStats.productiveMinutes || 0,
          lunchMinutes: dbStats.lunchMinutes || 0,
          snacksMinutes: dbStats.snacksMinutes || 0,
          refreshmentMinutes: dbStats.refreshmentMinutes || 0,
          feedbackMinutes: dbStats.feedbackMinutes || 0,
          crossUtilMinutes: dbStats.crossUtilMinutes || 0,
          lastSavedAt: now
        });
        
        console.log('[Dashboard] ✅ Restored from database:', dbStats.productiveMinutes, 'mins');
        
      } else {
        // New session
        const loginTime = toISTTimeString(new Date(now));
        
        setSessionStartTime(now);
        setCurrentStatus(OfficeStatus.AVAILABLE);
        currentStatusRef.current = OfficeStatus.AVAILABLE;
        statusChangeTimeRef.current = now;
        
        saveToLocalStorage({
          date: today,
          loginTime,
          productiveMinutes: 0,
          lunchMinutes: 0,
          snacksMinutes: 0,
          refreshmentMinutes: 0,
          feedbackMinutes: 0,
          crossUtilMinutes: 0,
          lastSavedAt: now
        });
        
        socket.emit('status_change', {
          userId: user.id,
          userName: user.name,
          status: OfficeStatus.AVAILABLE,
          role: user.role,
          activity: 1,
        });
        
        console.log('[Dashboard] 🆕 New session started');
      }
      
      // Start auto-save
      saveToDatabase();
    };
    
    initSession();
  }, [user.id, socket]);

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
      setElapsedTime(now - sessionStartTime);
      setStatusDuration(now - statusChangeTimeRef.current);
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
    if (!sessionStartTime) return;

    const updateStats = () => {
      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));
      const localStats = loadFromLocalStorage(today);
      const currentSessionMinutes = getCurrentSessionMinutes(now);
      
      let stats = {
        productiveMinutes: localStats?.productiveMinutes || 0,
        lunchMinutes: localStats?.lunchMinutes || 0,
        snacksMinutes: localStats?.snacksMinutes || 0,
        refreshmentMinutes: localStats?.refreshmentMinutes || 0,
        feedbackMinutes: localStats?.feedbackMinutes || 0,
        crossUtilMinutes: localStats?.crossUtilMinutes || 0,
        totalMinutes: 0,
        idleMinutes: 0,
      };

      // Add current session time
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

      stats.totalMinutes = stats.productiveMinutes + stats.lunchMinutes + stats.snacksMinutes +
        stats.refreshmentMinutes + stats.feedbackMinutes + stats.crossUtilMinutes;

      setTodayStats(stats);
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);
    
    return () => clearInterval(interval);
  }, [sessionStartTime, currentStatus, user.id, serverOffsetMs]);

  // ✅ HANDLE STATUS CHANGE
  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket || !sessionStartTime) return;
    if (newStatus === currentStatus) return;
    
    isChangingStatusRef.current = true;
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const timeInOldStatus = getCurrentSessionMinutes(now);
    const localStats = loadFromLocalStorage(today) || {
      date: today,
      loginTime: toISTTimeString(new Date(sessionStartTime)),
      productiveMinutes: 0,
      lunchMinutes: 0,
      snacksMinutes: 0,
      refreshmentMinutes: 0,
      feedbackMinutes: 0,
      crossUtilMinutes: 0,
      lastSavedAt: now
    };
    
    // Save time from old status
    switch (currentStatus) {
      case OfficeStatus.AVAILABLE:
        localStats.productiveMinutes += timeInOldStatus;
        break;
      case OfficeStatus.LUNCH:
        localStats.lunchMinutes += timeInOldStatus;
        break;
      case OfficeStatus.SNACKS:
        localStats.snacksMinutes += timeInOldStatus;
        break;
      case OfficeStatus.REFRESHMENT_BREAK:
        localStats.refreshmentMinutes += timeInOldStatus;
        break;
      case OfficeStatus.QUALITY_FEEDBACK:
        localStats.feedbackMinutes += timeInOldStatus;
        break;
      case OfficeStatus.CROSS_UTILIZATION:
        localStats.crossUtilMinutes += timeInOldStatus;
        break;
    }
    
    localStats.lastSavedAt = now;
    saveToLocalStorage(localStats);
    
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
    
    // Save to DB immediately
    setTimeout(() => {
      saveToDatabase();
      isChangingStatusRef.current = false;
    }, 500);
    
    console.log('[Dashboard] 🔄 Changed:', currentStatus, '→', newStatus);
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
  const isActive = myStatus?.activity === 1;

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
            {isActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30">
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Today's Activity</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: 'Productive', value: todayStats.productiveMinutes, icon: CheckCircle2, color: 'from-emerald-500 to-teal-600' },
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
      </div>
    </div>
  );
};

export default Dashboard;
