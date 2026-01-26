
import React from 'react';
import { User, AppSettings } from '../types';
import { LogOut, LayoutDashboard, BarChart2, ShieldCheck, Activity, Settings, Link2, Link2Off } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  currentView: 'dashboard' | 'monitor' | 'analytics' | 'management' | 'settings';
  setView: (view: 'dashboard' | 'monitor' | 'analytics' | 'management' | 'settings') => void;
  onLogout: () => void;
  isPrivileged: boolean;
  isSuper: boolean;
  settings: AppSettings;
  isConnected?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, user, currentView, setView, onLogout, isPrivileged, isSuper, settings, isConnected }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <nav className="sticky top-0 z-50 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex-shrink-0 flex items-center gap-2">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
                ) : (
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{settings.siteName.charAt(0)}</span>
                  </div>
                )}
                <span className="text-xl font-black text-slate-800 dark:text-white tracking-tight">{settings.siteName}</span>
                <div className={`ml-2 px-2 py-0.5 rounded-full flex items-center gap-1.5 ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} transition-all`}>
                  {isConnected ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                  <span className="text-[8px] font-black uppercase tracking-widest">{isConnected ? 'Live' : 'Offline'}</span>
                </div>
              </div>

              {user && (
                <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                  {!isPrivileged && (
                    <button 
                      onClick={() => setView('dashboard')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currentView === 'dashboard' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Status
                    </button>
                  )}

                  {isPrivileged && (
                    <button 
                      onClick={() => setView('monitor')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currentView === 'monitor' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                    >
                      <Activity className="w-4 h-4" />
                      Live Monitor
                    </button>
                  )}

                  {isPrivileged && (
                    <button 
                      onClick={() => setView('management')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currentView === 'management' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Registry
                    </button>
                  )}

                  <button 
                    onClick={() => setView('analytics')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currentView === 'analytics' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                  >
                    <BarChart2 className="w-4 h-4" />
                    Archive
                  </button>

                  {isSuper && (
                    <button 
                      onClick={() => setView('settings')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currentView === 'settings' ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                    >
                      <Settings className="w-4 h-4" />
                      System
                    </button>
                  )}
                </div>
              )}
            </div>

            {user && (
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-800 dark:text-white leading-none capitalize">{user.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">{user.role}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full border-2 border-slate-100 dark:border-slate-700 bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-white font-black text-sm">{String(user.name || 'U').charAt(0).toUpperCase()}</span>
                  </div>
                </div>

               <button 
  onClick={onLogout}
  className="flex items-center gap-2 p-2.5 sm:px-4 sm:py-2 text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-lg active:scale-95"
> 
  <LogOut className="w-4 h-5 sm:w-4 sm:h-4" />
  <span className="hidden sm:inline text-sm font-bold">Logout</span>
</button>

              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
