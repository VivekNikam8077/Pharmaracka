
import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { AppSettings, User } from '../types';
import { 
  Settings as SettingsIcon, 
  Layout, 
  Image as ImageIcon, 
  Palette, 
  Plus, 
  Trash2, 
  Globe,
  Save,
  Moon,
  Sun
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

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
  if (socket) socket.emit('update_settings', localSettings);
  alert('System configuration updated successfully.');
};

  const addStatus = () => {
    if (newStatus && !localSettings.availableStatuses.includes(newStatus)) {
      setLocalSettings({
        ...localSettings,
        availableStatuses: [...localSettings.availableStatuses, newStatus]
      });
      setNewStatus('');
    }
  };

  const removeStatus = (status: string) => {
    setLocalSettings({
      ...localSettings,
      availableStatuses: localSettings.availableStatuses.filter(s => s !== status)
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex items-center gap-4 mb-2">
        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">System Control Panel</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium italic">Configure core identity and operational parameters.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Identity Section */}
        <section className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            <Globe className="w-4 h-4 text-indigo-500" /> Identity & Branding
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Platform Name</label>
              <input 
                type="text" 
                value={localSettings.siteName}
                onChange={e => setLocalSettings({...localSettings, siteName: e.target.value})}
                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Logo Image URL</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={localSettings.logoUrl}
                  onChange={e => setLocalSettings({...localSettings, logoUrl: e.target.value})}
                  placeholder="https://..."
                  className="flex-grow px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white"
                />
                {localSettings.logoUrl && (
                  <img src={localSettings.logoUrl} className="w-12 h-12 rounded-lg object-contain bg-slate-100 p-1" alt="Preview" />
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Login Wall Background</label>
              <input 
                type="text" 
                value={localSettings.loginBgUrl}
                onChange={e => setLocalSettings({...localSettings, loginBgUrl: e.target.value})}
                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold dark:text-white"
              />
              <div className="mt-2 h-20 w-full rounded-xl bg-cover bg-center border border-slate-200" style={{ backgroundImage: `url(${localSettings.loginBgUrl})` }}></div>
            </div>
          </div>
        </section>

        {/* Theme & Modes */}
        <section className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            <Palette className="w-4 h-4 text-indigo-500" /> Interface & Theme
          </h3>

          <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Night Mode</p>
              <p className="text-[10px] font-bold text-slate-400">Reduce strain in low-light environments</p>
            </div>
            <button 
              onClick={() => setLocalSettings({...localSettings, darkMode: !localSettings.darkMode})}
              className={`w-16 h-8 rounded-full transition-all relative ${localSettings.darkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-sm transition-all flex items-center justify-center ${localSettings.darkMode ? 'left-9' : 'left-1'}`}>
                {localSettings.darkMode ? <Moon className="w-3 h-3 text-indigo-600" /> : <Sun className="w-3 h-3 text-amber-500" />}
              </div>
            </button>
          </div>
        </section>

        {/* Status Manager */}
        <section className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-sm md:col-span-2 space-y-6">
          <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            <Layout className="w-4 h-4 text-indigo-500" /> Organizational States
          </h3>
          
          <div className="flex gap-4 mb-6">
            <input 
              type="text" 
              placeholder="Ex: Deep Focus, Client Meeting..."
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="flex-grow px-6 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button 
              onClick={addStatus}
              className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all"
            >
              <Plus className="w-4 h-4" /> Add State
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {localSettings.availableStatuses.map(status => (
              <div key={status} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl group">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{status}</span>
                <button 
                  onClick={() => removeStatus(status)}
                  className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-center pt-8">
        <button 
          onClick={handleSave}
          className="flex items-center gap-3 px-12 py-5 bg-slate-900 text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-2xl hover:bg-black hover:scale-105 active:scale-95 transition-all"
        >
          <Save className="w-5 h-5" /> Commit Global Configuration
        </button>
      </div>
    </div>
  );
};

export default Settings;
