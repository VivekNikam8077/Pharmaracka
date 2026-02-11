import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { AppSettings, User } from '../types';
import {
  Settings as SettingsIcon,
  Layout,
  Palette,
  Plus,
  Trash2,
  Globe,
  Save,
  Moon,
  Sun,
  CheckCircle2,
} from 'lucide-react';

interface SettingsProps {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  users: User[];
  socket?: Socket | null;
}

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, users, socket }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [newStatus, setNewStatus] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    if (socket) socket.emit('update_settings', localSettings);
    setSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const addStatus = () => {
    const trimmed = newStatus.trim();
    if (trimmed && !localSettings.availableStatuses.includes(trimmed)) {
      setLocalSettings({
        ...localSettings,
        availableStatuses: [...localSettings.availableStatuses, trimmed],
      });
      setNewStatus('');
    }
  };

  const handleStatusKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addStatus(); }
  };

  const removeStatus = (status: string) => {
    setLocalSettings({
      ...localSettings,
      availableStatuses: localSettings.availableStatuses.filter(s => s !== status),
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <SettingsIcon className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Customize your experience</p>
        </div>
      </div>

      {/* Identity & Branding */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-black/10">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Identity & Branding</h3>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Platform Name</label>
            <input
              type="text"
              value={localSettings.siteName}
              onChange={e => setLocalSettings({ ...localSettings, siteName: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
              placeholder="Enter platform name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Logo URL</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={localSettings.logoUrl}
                onChange={e => setLocalSettings({ ...localSettings, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
                className="flex-1 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
              />
              {localSettings.logoUrl && (
                <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700/50 p-2 flex items-center justify-center overflow-hidden">
                  <img src={localSettings.logoUrl} className="w-full h-full object-contain" alt="Logo Preview" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Login Background URL</label>
            <input
              type="text"
              value={localSettings.loginBgUrl}
              onChange={e => setLocalSettings({ ...localSettings, loginBgUrl: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
              placeholder="https://example.com/background.jpg"
            />
            {localSettings.loginBgUrl && (
              <div className="mt-3 h-32 rounded-2xl bg-cover bg-center border border-slate-200/50 dark:border-slate-700/50 overflow-hidden shadow-inner" style={{ backgroundImage: `url(${localSettings.loginBgUrl})` }} />
            )}
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-black/10">
        <div className="flex items-center gap-3 mb-6">
          <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Theme</h3>
        </div>

        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              {localSettings.darkMode ? <Moon className="w-5 h-5 text-white" strokeWidth={2.5} /> : <Sun className="w-5 h-5 text-white" strokeWidth={2.5} />}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Dark Mode</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Reduce eye strain in low light</p>
            </div>
          </div>
          <button
            onClick={() => setLocalSettings({ ...localSettings, darkMode: !localSettings.darkMode })}
            className={`relative w-14 h-8 rounded-full transition-all duration-300 ${localSettings.darkMode ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-300 ${localSettings.darkMode ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
      </div>

      {/* Status Manager */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-8 transition-all duration-300 hover:shadow-2xl hover:shadow-black/10">
        <div className="flex items-center gap-3 mb-6">
          <Layout className="w-5 h-5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Status Options</h3>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Add custom status..."
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            onKeyDown={handleStatusKeyDown}
            className="flex-1 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200"
          />
          <button
            onClick={addStatus}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl text-sm font-medium flex items-center gap-2 transition-all duration-200 shadow-lg shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {localSettings.availableStatuses.map(status => (
            <div key={status} className="group flex items-center justify-between p-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-all duration-200">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate flex-1 mr-2">{status}</span>
              <button
                onClick={() => removeStatus(status)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all duration-200 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <button
          onClick={handleSave}
          className="group relative px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-sm font-semibold shadow-2xl shadow-black/20 hover:shadow-3xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative flex items-center gap-2">
            <Save className="w-5 h-5" strokeWidth={2.5} />
            Save Changes
          </div>
        </button>

        {/* Success Toast */}
        <div className={`flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800 transition-all duration-300 ${saved ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
          <span className="text-sm font-medium">Settings saved successfully</span>
        </div>
      </div>
    </div>
  );
};

export default Settings;
