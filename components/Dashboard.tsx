import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, AppSettings, RealtimeStatus, OfficeStatus, DaySummary } from '../types';
import { Socket } from 'socket.io-client';
import { 
  Clock, 
  Activity, 
  Coffee, 
  Cookie, 
  Sparkles, 
  MessageSquare, 
  Users, 
  LogOut,
  CheckCircle2,
  Timer,
  TrendingUp,
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
  performanceHistory?: DaySummary[]; // Server data
}

const STORAGE_KEY_PREFIX = 'officely_session_';
const IDLE_TRACK_KEY = 'officely_idle_track_v1';
const STATUS_HISTORY_KEY = 'officely_status_history_';

const Dashboard: React.FC<DashboardProps> = ({
  user,
  settings,
  realtimeStatuses,
  setRealtimeStatuses,
  socket,
  hasSynced,
  serverOffsetMs,
  performanceHistory = []
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

  // Utility to get IST date string
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

  // Initialize session from storage or create new
  useEffect(() => {
    const sessionKey = `${STORAGE_KEY_PREFIX}${user.id}`;
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const historyKey = `${STATUS_HISTORY_KEY}${user.id}_${today}`;
    
    const stored = localStorage.getItem(sessionKey);
    
    // Check if we have history for today
    const existingHistory = localStorage.getItem(historyKey);
    let hasHistory = false;
    
    try {
      if (existingHistory) {
        const parsed = JSON.parse(existingHistory);
        hasHistory = Array.isArray(parsed) && parsed.length > 0;
        console.log('[Dashboard] Found existing history for today:', parsed.length, 'entries');
      }
    } catch (e) {
      console.error('[Dashboard] Failed to parse existing history:', e);
    }
    
    if (stored) {
      try {
        const data = JSON.parse(stored);
        
        if (data.date === today && data.startTime) {
          // Same day, restore session
          setSessionStartTime(data.startTime);
          setCurrentStatus(data.status || OfficeStatus.AVAILABLE);
          statusChangeTimeRef.current = data.statusChangeTime || data.startTime;
          console.log('[Dashboard] Restored session:', data);
          
          // Ensure history exists for today
          if (!hasHistory) {
            console.log('[Dashboard] Session exists but no history, initializing history');
            localStorage.setItem(historyKey, JSON.stringify([
              { status: data.status || OfficeStatus.AVAILABLE, timestamp: data.startTime }
            ]));
          }
        } else {
          // New day, start fresh
          console.log('[Dashboard] New day detected, starting fresh session');
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
          
          // Initialize status history for new day
          localStorage.setItem(historyKey, JSON.stringify([
            { status: OfficeStatus.AVAILABLE, timestamp: newStartTime }
          ]));
          console.log('[Dashboard] Initialized new day with Available status');
        }
      } catch (e) {
        console.error('[Dashboard] Failed to restore session:', e);
      }
    } else {
      // First time login ever or after logout
      console.log('[Dashboard] No existing session, creating new');
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
      
      // Initialize status history
      localStorage.setItem(historyKey, JSON.stringify([
        { status: OfficeStatus.AVAILABLE, timestamp: newStartTime }
      ]));
      console.log('[Dashboard] Created new session with initial Available status');
    }
    
    // Final verification
    const finalHistory = localStorage.getItem(historyKey);
    console.log('[Dashboard] Final history check:', finalHistory ? JSON.parse(finalHistory) : 'NONE');
  }, [user.id, serverOffsetMs]);

  // Save session data when status changes
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

  // Timer for elapsed time
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

  // Calculate today's stats from SERVER DATA + real-time local changes
  useEffect(() => {
    if (!sessionStartTime) return;

    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    const historyKey = `${STATUS_HISTORY_KEY}${user.id}_${today}`;

    // Force re-calculate stats every second
    const calculateStats = () => {
      const currentTime = Date.now() + serverOffsetMs;
      const todayDate = toISTDateString(new Date(currentTime));
      
      // ========== PRIMARY SOURCE: SERVER DATA ==========
      // Get today's summary from server performance history
      const serverTodayData = performanceHistory.find(
        (entry) => entry.userId === user.id && entry.date === todayDate
      );

      // Initialize stats with SERVER data if available
      let stats = {
        productiveMinutes: serverTodayData?.productiveMinutes || 0,
        lunchMinutes: serverTodayData?.lunchMinutes || 0,
        snacksMinutes: serverTodayData?.snacksMinutes || 0,
        refreshmentMinutes: serverTodayData?.refreshmentMinutes || 0,
        feedbackMinutes: serverTodayData?.feedbackMinutes || 0,
        crossUtilMinutes: serverTodayData?.crossUtilMinutes || 0,
        totalMinutes: 0,
        idleMinutes: 0,
      };

      console.log('[Dashboard] Server stats for today:', serverTodayData || 'None');

      // ========== SUPPLEMENT: REAL-TIME LOCAL TRACKING ==========
      // If we have local status changes AFTER the server's last update, add them
      let localHistoryUsed = false;
      
      try {
        const stored = localStorage.getItem(historyKey);
        if (stored) {
          const statusHistory: Array<{ status: OfficeStatus; timestamp: number }> = JSON.parse(stored);
          
          // Find when server data ends (use logout time or current realtime status timestamp)
          let serverEndTime = sessionStartTime;
          if (serverTodayData?.logoutTime) {
            const [hours, minutes] = serverTodayData.logoutTime.split(':');
            const logoutDate = new Date(todayDate);
            logoutDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            serverEndTime = logoutDate.getTime();
          }

          // Process only status changes AFTER server's last update
          const recentChanges = statusHistory.filter(entry => entry.timestamp > serverEndTime);
          
          if (recentChanges.length > 0) {
            localHistoryUsed = true;
            console.log('[Dashboard] Supplementing with', recentChanges.length, 'local changes after server update');
            
            const addMinutesToStatus = (status: OfficeStatus, minutes: number) => {
              if (minutes <= 0) return;
              
              switch (status) {
                case OfficeStatus.AVAILABLE:
                  stats.productiveMinutes += minutes;
                  break;
                case OfficeStatus.LUNCH:
                  stats.lunchMinutes += minutes;
                  break;
                case OfficeStatus.SNACKS:
                  stats.snacksMinutes += minutes;
                  break;
                case OfficeStatus.REFRESHMENT_BREAK:
                  stats.refreshmentMinutes += minutes;
                  break;
                case OfficeStatus.QUALITY_FEEDBACK:
                  stats.feedbackMinutes += minutes;
                  break;
                case OfficeStatus.CROSS_UTILIZATION:
                  stats.crossUtilMinutes += minutes;
                  break;
              }
            };

            // Calculate time from recent local changes
            for (let i = 0; i < recentChanges.length; i++) {
              const current = recentChanges[i];
              const next = recentChanges[i + 1];
              
              const startTime = current.timestamp;
              const endTime = next ? next.timestamp : currentTime;
              const duration = Math.floor((endTime - startTime) / 60000);
              
              console.log(`[Dashboard] Local: ${current.status} = ${duration} min`);
              addMinutesToStatus(current.status, duration);
            }
          }
        }
      } catch (e) {
        console.error('[Dashboard] Failed to process local history:', e);
      }

      // ========== FALLBACK: If NO server data and NO local history ==========
      if (!serverTodayData && !localHistoryUsed) {
        console.warn('[Dashboard] No server data, using full local calculation');
        
        // Use all local history from session start
        try {
          const stored = localStorage.getItem(historyKey);
          if (stored) {
            const statusHistory: Array<{ status: OfficeStatus; timestamp: number }> = JSON.parse(stored);
            
            const addMinutesToStatus = (status: OfficeStatus, minutes: number) => {
              if (minutes <= 0) return;
              
              switch (status) {
                case OfficeStatus.AVAILABLE:
                  stats.productiveMinutes += minutes;
                  break;
                case OfficeStatus.LUNCH:
                  stats.lunchMinutes += minutes;
                  break;
                case OfficeStatus.SNACKS:
                  stats.snacksMinutes += minutes;
                  break;
                case OfficeStatus.REFRESHMENT_BREAK:
                  stats.refreshmentMinutes += minutes;
                  break;
                case OfficeStatus.QUALITY_FEEDBACK:
                  stats.feedbackMinutes += minutes;
                  break;
                case OfficeStatus.CROSS_UTILIZATION:
                  stats.crossUtilMinutes += minutes;
                  break;
              }
            };

            for (let i = 0; i < statusHistory.length; i++) {
              const current = statusHistory[i];
              const next = statusHistory[i + 1];
              
              const startTime = current.timestamp;
              const endTime = next ? next.timestamp : currentTime;
              const duration = Math.floor((endTime - startTime) / 60000);
              
              addMinutesToStatus(current.status, duration);
            }
          } else {
            // Absolute fallback: current session time with current status
            const duration = Math.floor((currentTime - sessionStartTime) / 60000);
            if (currentStatus === OfficeStatus.AVAILABLE) stats.productiveMinutes = duration;
            else if (currentStatus === OfficeStatus.LUNCH) stats.lunchMinutes = duration;
            else if (currentStatus === OfficeStatus.SNACKS) stats.snacksMinutes = duration;
            else if (currentStatus === OfficeStatus.REFRESHMENT_BREAK) stats.refreshmentMinutes = duration;
            else if (currentStatus === OfficeStatus.QUALITY_FEEDBACK) stats.feedbackMinutes = duration;
            else if (currentStatus === OfficeStatus.CROSS_UTILIZATION) stats.crossUtilMinutes = duration;
          }
        } catch (e) {
          console.error('[Dashboard] Fallback calculation failed:', e);
        }
      }

      // Get idle data
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

      // Calculate total
      stats.totalMinutes = stats.productiveMinutes + stats.lunchMinutes + stats.snacksMinutes +
        stats.refreshmentMinutes + stats.feedbackMinutes + stats.crossUtilMinutes;

      console.log('[Dashboard] Final calculated stats:', stats);
      setTodayStats(stats);
    };

    // Calculate immediately
    calculateStats();
    
    // Update every second to show live progress
    const interval = setInterval(calculateStats, 1000);
    
    return () => clearInterval(interval);
  }, [sessionStartTime, currentStatus, user.id, serverOffsetMs, performanceHistory]);

  // Handle status change
  const handleStatusChange = (newStatus: OfficeStatus) => {
    if (!socket || !socket.connected) {
      alert('Not connected to server. Please wait...');
      return;
    }

    if (newStatus === currentStatus) {
      console.log('[Dashboard] Already in this status, ignoring');
      return;
    }

    console.log('[Dashboard] Changing status from', currentStatus, 'to', newStatus);
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    
    // Save to status history
    const historyKey = `${STATUS_HISTORY_KEY}${user.id}_${today}`;
    try {
      let history: Array<{ status: OfficeStatus; timestamp: number }> = [];
      const stored = localStorage.getItem(historyKey);
      
      if (stored) {
        history = JSON.parse(stored);
        console.log('[Dashboard] Loaded existing history:', history.length, 'entries');
      } else {
        console.log('[Dashboard] No existing history, creating new');
      }
      
      // Add new status change
      const newEntry = { status: newStatus, timestamp: now };
      history.push(newEntry);
      
      // Save updated history
      localStorage.setItem(historyKey, JSON.stringify(history));
      console.log('[Dashboard] Saved status change:', newEntry);
      console.log('[Dashboard] Full history now:', history);
      
      // Verify it was saved
      const verification = localStorage.getItem(historyKey);
      if (!verification) {
        console.error('[Dashboard] FAILED to save history to localStorage!');
      } else {
        console.log('[Dashboard] Verified history saved successfully');
      }
    } catch (e) {
      console.error('[Dashboard] Failed to save status history:', e);
    }
    
    // Update current status
    setCurrentStatus(newStatus);
    statusChangeTimeRef.current = now;
    
    // Emit to server (after saving locally)
    socket.emit('status_change', {
      userId: user.id,
      status: newStatus
    });
  };

  // Sync status from realtime updates (from server/admin changes)
  useEffect(() => {
    const myStatus = realtimeStatuses.find(s => s.userId === user.id);
    if (!myStatus || myStatus.status === currentStatus) return;
    
    const newStatus = myStatus.status;
    console.log('[Dashboard] Status synced from server:', currentStatus, '->', newStatus);
    
    const now = Date.now() + serverOffsetMs;
    const today = toISTDateString(new Date(now));
    
    // Update status history only if status actually changed
    const historyKey = `${STATUS_HISTORY_KEY}${user.id}_${today}`;
    try {
      let history: Array<{ status: OfficeStatus; timestamp: number }> = [];
      const stored = localStorage.getItem(historyKey);
      if (stored) {
        history = JSON.parse(stored);
      }
      
      // Only add if it's different from the last entry (avoid duplicates)
      const lastEntry = history[history.length - 1];
      if (!lastEntry || lastEntry.status !== newStatus) {
        history.push({ status: newStatus, timestamp: now });
        localStorage.setItem(historyKey, JSON.stringify(history));
        console.log('[Dashboard] Synced status to history from server');
      } else {
        console.log('[Dashboard] Status already in history, skipping duplicate');
      }
    } catch (e) {
      console.error('[Dashboard] Failed to sync status history:', e);
    }
    
    setCurrentStatus(newStatus);
    statusChangeTimeRef.current = now;
  }, [realtimeStatuses, user.id, currentStatus, serverOffsetMs]);

  // Cleanup old status history (keep last 7 days only)
  useEffect(() => {
    const cleanupOldHistory = () => {
      try {
        const now = Date.now() + serverOffsetMs;
        const today = toISTDateString(new Date(now));
        const prefix = `${STATUS_HISTORY_KEY}${user.id}_`;
        
        // Get all keys for this user's status history
        const keysToCheck: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            keysToCheck.push(key);
          }
        }
        
        // Remove old entries (older than 7 days)
        keysToCheck.forEach(key => {
          const dateStr = key.replace(prefix, '');
          if (dateStr !== today) {
            const entryDate = new Date(dateStr);
            const daysDiff = Math.floor((now - entryDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > 7) {
              localStorage.removeItem(key);
              console.log('[Dashboard] Cleaned up old history:', key);
            }
          }
        });
      } catch (e) {
        console.error('[Dashboard] Failed to cleanup history:', e);
      }
    };
    
    // Run cleanup on mount and every hour
    cleanupOldHistory();
    const cleanupInterval = setInterval(cleanupOldHistory, 60 * 60 * 1000);
    
    return () => clearInterval(cleanupInterval);
  }, [user.id, serverOffsetMs]);

  // Debug helper - expose to console for troubleshooting
  useEffect(() => {
    (window as any).debugDashboard = () => {
      const now = Date.now() + serverOffsetMs;
      const today = toISTDateString(new Date(now));
      const historyKey = `${STATUS_HISTORY_KEY}${user.id}_${today}`;
      const sessionKey = `${STORAGE_KEY_PREFIX}${user.id}`;
      
      console.log('=== DASHBOARD DEBUG ===');
      console.log('User ID:', user.id);
      console.log('Current Status:', currentStatus);
      console.log('Session Start:', sessionStartTime ? new Date(sessionStartTime).toLocaleString() : 'None');
      console.log('Today:', today);
      
      // Server data
      console.log('\n--- SERVER DATA ---');
      const serverToday = performanceHistory.find(
        (entry) => entry.userId === user.id && entry.date === today
      );
      if (serverToday) {
        console.log('Server has data for today:');
        console.log('  Login:', serverToday.loginTime);
        console.log('  Logout:', serverToday.logoutTime);
        console.log('  Productive:', serverToday.productiveMinutes, 'min');
        console.log('  Lunch:', serverToday.lunchMinutes, 'min');
        console.log('  Snacks:', serverToday.snacksMinutes, 'min');
        console.log('  Break:', serverToday.refreshmentMinutes, 'min');
        console.log('  Feedback:', serverToday.feedbackMinutes, 'min');
        console.log('  Cross-Util:', serverToday.crossUtilMinutes, 'min');
        console.log('  Total:', serverToday.totalMinutes, 'min');
      } else {
        console.log('No server data for today');
      }
      
      // Local data
      console.log('\n--- LOCAL DATA ---');
      console.log('History Key:', historyKey);
      const history = localStorage.getItem(historyKey);
      if (history) {
        try {
          const parsed = JSON.parse(history);
          console.log('Local Status History (' + parsed.length + ' entries):');
          parsed.forEach((entry: any, i: number) => {
            console.log(`  ${i}: ${entry.status} at ${new Date(entry.timestamp).toLocaleTimeString()}`);
          });
        } catch (e) {
          console.error('Failed to parse history:', e);
        }
      } else {
        console.log('No local history found');
      }
      
      const session = localStorage.getItem(sessionKey);
      console.log('Session Data:', session ? JSON.parse(session) : 'None');
      
      console.log('\n--- CALCULATED STATS ---');
      console.log('Current Display:', todayStats);
      console.log('======================');
    };
    
    console.log('[Dashboard] Debug helper loaded. Type debugDashboard() in console to see all data sources.');
    
    return () => {
      delete (window as any).debugDashboard;
    };
  }, [user.id, currentStatus, sessionStartTime, todayStats, serverOffsetMs, performanceHistory]);

  // Format time helper
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

  // Get status icon and color
  const getStatusConfig = (status: OfficeStatus) => {
    switch (status) {
      case OfficeStatus.AVAILABLE:
        return { icon: CheckCircle2, color: 'emerald', label: 'Available' };
      case OfficeStatus.LUNCH:
        return { icon: Coffee, color: 'orange', label: 'Lunch' };
      case OfficeStatus.SNACKS:
        return { icon: Cookie, color: 'yellow', label: 'Snacks' };
      case OfficeStatus.REFRESHMENT_BREAK:
        return { icon: Sparkles, color: 'blue', label: 'Break' };
      case OfficeStatus.QUALITY_FEEDBACK:
        return { icon: MessageSquare, color: 'purple', label: 'Feedback' };
      case OfficeStatus.CROSS_UTILIZATION:
        return { icon: Users, color: 'indigo', label: 'Cross-Util' };
      default:
        return { icon: Activity, color: 'slate', label: status };
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

  // Activity indicator
  const myStatus = realtimeStatuses.find(s => s.userId === user.id);
  const activityStatus = myStatus?.activity;
  const isIdle = activityStatus === 0;
  const isActive = activityStatus === 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Welcome back, {user.name}! 👋
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Track your productivity and manage your status
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Current Status Card */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Current Status
              </h2>
              {!hasSynced && (
                <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">
                  Syncing...
                </span>
              )}
            </div>

            <div className={`flex items-center gap-4 p-6 rounded-xl bg-${currentConfig.color}-50 dark:bg-${currentConfig.color}-900/20 border-2 border-${currentConfig.color}-200 dark:border-${currentConfig.color}-800 mb-6`}>
              <div className={`p-4 rounded-full bg-${currentConfig.color}-100 dark:bg-${currentConfig.color}-900/40`}>
                <CurrentIcon className={`w-8 h-8 text-${currentConfig.color}-600 dark:text-${currentConfig.color}-400`} />
              </div>
              <div className="flex-1">
                <h3 className={`text-2xl font-bold text-${currentConfig.color}-900 dark:text-${currentConfig.color}-100`}>
                  {currentConfig.label}
                </h3>
                <p className={`text-sm text-${currentConfig.color}-600 dark:text-${currentConfig.color}-400 mt-1`}>
                  Duration: {formatTime(statusDuration)}
                </p>
              </div>
              {isActive && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Active</span>
                </div>
              )}
              {isIdle && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Idle</span>
                </div>
              )}
            </div>

            {/* Status Selection Grid */}
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
                    className={`
                      relative p-4 rounded-xl border-2 transition-all duration-200
                      ${isSelected 
                        ? `bg-${config.color}-100 dark:bg-${config.color}-900/40 border-${config.color}-500 dark:border-${config.color}-600 cursor-default` 
                        : `bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-${config.color}-300 dark:hover:border-${config.color}-700 hover:bg-${config.color}-50 dark:hover:bg-${config.color}-900/20 cursor-pointer`
                      }
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Icon className={`w-6 h-6 ${isSelected ? `text-${config.color}-600 dark:text-${config.color}-400` : 'text-slate-500 dark:text-slate-400'}`} />
                      <span className={`text-sm font-medium ${isSelected ? `text-${config.color}-900 dark:text-${config.color}-100` : 'text-slate-700 dark:text-slate-300'}`}>
                        {config.label}
                      </span>
                    </div>
                    {isSelected && (
                      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full bg-${config.color}-500`}></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Timer Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Session Timer
            </h2>
            
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                <Clock className="w-16 h-16 text-white" />
              </div>
              <div className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
                {formatTime(elapsedTime)}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Total session time
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <span className="text-sm text-slate-600 dark:text-slate-400">Login Time</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {sessionStartTime ? new Date(sessionStartTime).toLocaleTimeString('en-IN', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata'
                  }) : '--:--'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <span className="text-sm text-slate-600 dark:text-slate-400">Current Time</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
            Today's Activity
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Productive</span>
              </div>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                {formatMinutes(todayStats.productiveMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Lunch</span>
              </div>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {formatMinutes(todayStats.lunchMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-2">
                <Cookie className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">Snacks</span>
              </div>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                {formatMinutes(todayStats.snacksMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Break</span>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatMinutes(todayStats.refreshmentMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Feedback</span>
              </div>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {formatMinutes(todayStats.feedbackMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Cross-Util</span>
              </div>
              <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                {formatMinutes(todayStats.crossUtilMinutes)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Idle Time</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatMinutes(todayStats.idleMinutes)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
