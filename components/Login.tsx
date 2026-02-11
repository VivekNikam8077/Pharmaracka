import React, { useState, useEffect } from 'react';
import { User, AppSettings } from '../types';
import { ShieldCheck, Lock, Mail, Globe, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (credentials: { email: string; password: string }) => void;
  users: User[];
  settings: AppSettings;
  onSetIp?: () => void;
  loginError?: string;
  onClearError?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, users, settings, onSetIp, loginError = '', onClearError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState('');

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
    }, 800);
  };

  const displayError = localError || loginError;

  if (isAuthenticating && !displayError) {
    return (
      <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
        {/* Background with blur */}
        <div className="absolute inset-0 z-0">
          <div 
            className="absolute inset-0 bg-cover bg-center scale-105 animate-in zoom-in duration-1000"
            style={{ backgroundImage: `url(${settings.loginBgUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-900/90 backdrop-blur-2xl" />
        </div>

        {/* Loading State */}
        <div className="relative z-10 w-full max-w-md px-6">
          <div className="text-center space-y-8 animate-in fade-in zoom-in duration-700">
            {/* Animated Shield */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                  <Loader2 className="w-12 h-12 text-white/90 animate-spin" strokeWidth={2} />
                </div>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-2xl animate-pulse" />
              </div>
            </div>

            {/* Text */}
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Authenticating</h2>
              <p className="text-sm text-white/60">Please wait while we verify your credentials</p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-xl border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/40">
                <span>Verifying</span>
                <span>{progress}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-[2000ms] ease-out"
          style={{ backgroundImage: `url(${settings.loginBgUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/60 to-slate-900/70 backdrop-blur-sm" />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-700" style={{ animationFillMode: 'backwards' }}>
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-semibold text-white mb-2 tracking-tight">{settings.siteName}</h2>
          <p className="text-white/60 text-sm">Sign in to continue</p>
        </div>

        {/* Glass Card */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/20 border border-white/20 dark:border-slate-700/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                <Mail className="w-3.5 h-3.5" strokeWidth={2.5} />
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLocalError(''); if (onClearError) onClearError(); }}
                placeholder="name@company.com"
                className="w-full px-4 py-3.5 bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5" strokeWidth={2.5} />
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(''); if (onClearError) onClearError(); }}
                placeholder="Enter your password"
                className={`w-full px-4 py-3.5 bg-slate-50/80 dark:bg-slate-800/80 border rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-all duration-200 ${
                  displayError 
                    ? 'border-red-300 dark:border-red-700 ring-2 ring-red-500/20' 
                    : 'border-slate-200/50 dark:border-slate-700/50 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50'
                }`}
              />
              
              {/* Error Message */}
              {displayError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                  <span className="text-red-600 dark:text-red-400 text-sm">⚠</span>
                  <p className="text-red-600 dark:text-red-400 text-xs font-medium">{displayError}</p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              {isAuthenticating ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Server Settings */}
          {onSetIp && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={onSetIp}
                className="w-full flex items-center justify-center gap-2 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-150"
              >
                <Globe className="w-3.5 h-3.5" strokeWidth={2.5} />
                Change Server
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/40 text-xs mt-6">
          Protected by {settings.siteName}
        </p>
      </div>
    </div>
  );
};

export default Login;
