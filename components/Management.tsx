import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { User, UserRole, DaySummary, OfficeStatus } from '../types';
import { 
  ShieldCheck, 
  Trash2, 
  Search,
  Power,
  Eye,
  UserPlus,
  ChevronDown
} from 'lucide-react';

interface ManagementProps {
  currentUser: User;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  history: DaySummary[];
  setHistory: React.Dispatch<React.SetStateAction<DaySummary[]>>;
  setForceLogoutFlags: (flags: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  socket?: Socket | null;
}

const Management: React.FC<ManagementProps> = ({ currentUser, users, setUsers, setForceLogoutFlags, socket }) => {
  const [search, setSearch] = useState('');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [sensitiveById, setSensitiveById] = useState<Record<string, { email: string; password: string }>>({});
  
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.STANDARD);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  const isSuper = currentUser.role === UserRole.SUPER_USER;
  const isAdmin = currentUser.role === UserRole.ADMIN;

  useEffect(() => {
    if (!socket || !isSuper) return;

    const onSensitiveUsers = (rows: any) => {
      const list = Array.isArray(rows) ? rows : [];
      setSensitiveById(() => {
        const next: Record<string, { email: string; password: string }> = {};
        for (const u of list) {
          const id = String(u?.id || '').trim();
          if (!id) continue;
          next[id] = {
            email: String(u?.email || ''),
            password: String(u?.password || ''),
          };
        }
        return next;
      });
    };

    socket.on('users_sensitive_response', onSensitiveUsers);
    socket.emit('users_sensitive_request');

    return () => {
      socket.off('users_sensitive_response', onSensitiveUsers);
    };
  }, [socket, isSuper]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsRoleMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const addUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) return;
    
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: newName,
      email: newEmail.toLowerCase(),
      password: newPassword,
      role: newRole,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=random&color=fff`,
      createdAt: new Date().toISOString()
    };

    if (socket) {
      socket.emit('add_user', newUser);
    }
    
    setNewName(''); 
    setNewEmail(''); 
    setNewPassword(''); 
    setNewRole(UserRole.STANDARD);
    setIsRoleMenuOpen(false);
  };

  const deleteUser = (id: string) => {
    if (id === currentUser.id || id === 'su-atharva') return;
    if (confirm("Are you sure you want to remove this user?")) {
      if (socket) {
        socket.emit('delete_user', id);
      }
    }
  };

  const forceLogout = (id: string) => {
    if (!isSuper || !socket || id === currentUser.id) return;
    setForceLogoutFlags((prev) => new Set(prev).add(id));
    socket.emit('force_logout_user', id);
    setTimeout(() => {
      setForceLogoutFlags((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-700" style={{ animationFillMode: 'backwards' }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <ShieldCheck className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">User Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Control access and permissions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Add User Form */}
        <div className="xl:col-span-1">
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-black/10">
            <div className="flex items-center gap-3 mb-6">
              <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New User</h3>
            </div>
            
            <form onSubmit={addUser} className="space-y-4">
              <input 
                type="text" 
                required 
                placeholder="Full Name" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200" 
              />
              
              <input 
                type="email" 
                required 
                placeholder="Email Address" 
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
                className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200" 
              />
              
              <input 
                type="text" 
                required 
                placeholder="Password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 font-mono" 
              />
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleMenuOpen(v => !v)}
                  className="w-full px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-700/50 rounded-2xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-200 flex items-center justify-between"
                >
                  <span className="font-medium">{newRole}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isRoleMenuOpen ? 'rotate-180' : 'rotate-0'}`} strokeWidth={2.5} />
                </button>

                {isRoleMenuOpen && (
                  <>
                    <button type="button" onClick={() => setIsRoleMenuOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                    <div className="absolute left-0 right-0 mt-2 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
                      <div className="py-2">
                        <button type="button" onClick={() => { setNewRole(UserRole.STANDARD); setIsRoleMenuOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 ${newRole === UserRole.STANDARD ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                          Standard
                        </button>
                        {isSuper && (
                          <>
                            <button type="button" onClick={() => { setNewRole(UserRole.ADMIN); setIsRoleMenuOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 ${newRole === UserRole.ADMIN ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                              Admin
                            </button>
                            <button type="button" onClick={() => { setNewRole(UserRole.SUPER_USER); setIsRoleMenuOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 ${newRole === UserRole.SUPER_USER ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                              Super User
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <button 
                type="submit" 
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-600/25"
              >
                Create User
              </button>
            </form>
          </div>
        </div>

        {/* User List */}
        <div className="xl:col-span-2 space-y-4">
          {/* Search */}
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-lg shadow-black/5 p-4 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400" strokeWidth={2.5} />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none"
            />
          </div>

          {/* Users Table */}
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl border border-slate-200/50 dark:border-slate-700/50 shadow-xl shadow-black/5 overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">User</th>
                    {isSuper && <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Email</th>}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Password</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/30 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <span className="text-white font-semibold text-sm">{String(u.name || 'U').charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{u.name}</span>
                        </div>
                      </td>
                      {isSuper && (
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600 dark:text-slate-400">{u.email}</span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                          u.role === UserRole.SUPER_USER 
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' 
                            : u.role === UserRole.ADMIN 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' 
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-slate-600 dark:text-slate-400">
                            {isSuper && showPasswords[u.id] ? (sensitiveById[u.id]?.password || '••••••') : '••••••'}
                          </span>
                          {isSuper && (
                            <button onClick={() => setShowPasswords(p => ({...p, [u.id]: !p[u.id]}))} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-150">
                              <Eye className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {(() => {
                            const roleLower = String(u.role || '').toLowerCase();
                            const canForce = (isSuper || (isAdmin && roleLower !== 'superuser')) && u.id !== currentUser.id;
                            return canForce ? (
                              <button onClick={() => forceLogout(u.id)} className="p-2 text-slate-400 hover:text-amber-500 transition-all duration-150 hover:scale-110" title="Force logout">
                                <Power className="w-4 h-4" strokeWidth={2.5} />
                              </button>
                            ) : null;
                          })()}
                          {(() => {
                            const roleLower = String(u.role || '').toLowerCase();
                            const canDelete = (isSuper || (isAdmin && roleLower !== 'superuser')) && u.id !== 'su-atharva' && u.id !== currentUser.id;
                            return canDelete ? (
                              <button onClick={() => deleteUser(u.id)} className="p-2 text-slate-400 hover:text-red-500 transition-all duration-150 hover:scale-110">
                                <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                              </button>
                            ) : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Management;
