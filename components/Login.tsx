import React, { useState, useEffect } from 'react';
import { User, AppSettings } from '../types';
import { ShieldCheck, Lock, Mail, Globe } from 'lucide-react';

interface LoginProps {
  onLogin: (credentials: { email: string; password: string }) => void;
  users: User[];
  settings: AppSettings;
  onSetIp?: () => void;
  // FIX: accept external error from App.tsx auth_failure instead of using alert()
  loginError?: string;
  onClearError?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, users, settings, onSetIp, loginError = '', onClearError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState('');

  // Show the external error (from auth_failure) and stop the loading animation
  useEffect(() => {
    if (loginError) {
      setLocalError(loginError);
      setIsAuthenticating(false);
      setProgress(0);
    }
  }, [loginError]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAuthenticating) {
      interval = setInterval(() => {
        setProgress(prev => {
          // FIX: stop at 90% — only complete to 100% on success, don't auto-complete
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 5;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isAuthenticating]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (onClearError) onClearError();

    setIsAuthenticating(true);
    setProgress(0);

    setTimeout(() => {
      onLogin({ email, password });
      // FIX: don't auto-reset — let the auth_failure event reset it via loginError prop
      // This prevents a 2s blank screen when the password is wrong
    }, 800);
  };

  const displayError = localError || loginError;

  if (isAuthenticating && !displayError) {
    return (
      <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${settings.loginBgUrl})` }}
        >
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"></div>
        </div>

        <div className="relative z-10 w-full max-w-sm px-8 text-center space-y-8">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-white/10 flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
              <ShieldCheck className="w-10 h-10 text-indigo-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Authenticating Identity</h2>
            <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-[0.3em] opacity-60">Syncing with Database</p>
          </div>

          <div className="space-y-4">
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-black text-white/40 uppercase tracking-widest">
              <span>Establishing Handshake</span>
              <span>{progress}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000"
        style={{ backgroundImage: `url(${settings.loginBgUrl})` }}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center">
          <h2 className="text-4xl font-black text-white tracking-tight uppercase">{settings.siteName}</h2>
          <p className="mt-2 text-indigo-200 font-bold text-xs uppercase tracking-[0.3em] opacity-80">Welcome to Pharmarack</p>
        </div>

        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl py-12 px-10 shadow-2xl rounded-[3rem] border border-white/20">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Mail className="w-3 h-3" /> Email ID
              </label>
              <input
                type="email" required value={email}
                onChange={(e) => { setEmail(e.target.value); setLocalError(''); if (onClearError) onClearError(); }}
                placeholder="name@pharmarack.com"
                className="block w-full px-6 py-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Lock className="w-3 h-3" /> Password
              </label>
              <input
                type="password" required value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(''); if (onClearError) onClearError(); }}
                placeholder="••••••"
                className={`block w-full px-6 py-4 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 ${displayError ? 'ring-2 ring-red-400 focus:ring-red-400' : 'focus:ring-indigo-500'}`}
              />
              {/* FIX: inline error display — no more browser alert() popup */}
              {displayError && (
                <p className="mt-2 text-red-500 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <span>⚠</span> {displayError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {isAuthenticating ? 'Authenticating...' : 'Login'}
            </button>
          </form>

          {onSetIp && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={onSetIp}
                className="w-full flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 hover:text-indigo-500 uppercase tracking-widest transition-colors"
              >
                <Globe className="w-3 h-3" /> Change Server
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
