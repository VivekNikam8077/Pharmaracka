
import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { User, UserRole, DaySummary, OfficeStatus } from '../types';
import { 
  ShieldCheck, 
  Trash2, 
  Search,
  Power,
  Eye,
  EyeOff,
  Edit3,
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
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState('');

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.STANDARD);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  const isSuper = currentUser.role === UserRole.SUPER_USER;
  const isAdmin = currentUser.role === UserRole.ADMIN;

  useEffect(() => {
    if (!socket) return;
    if (!isSuper) return;

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
    if (id === currentUser.id || id === 'su-atharva') return alert("System Protection: Restricted removal.");
    if (confirm("Permanently revoke system access?")) {
      if (socket) {
        socket.emit('delete_user', id);
      }
    }
  };

  const forceLogout = (id: string) => {
    if (!isSuper) return;
    if (!socket) return;
    if (id === currentUser.id) return;
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
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" /> Registry
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-1">
          <section className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase mb-6">New Provision</h3>
            <form onSubmit={addUser} className="space-y-4">
              <input type="text" required placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold" />
              <input type="email" required placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold" />
              <input type="text" required placeholder="Passcode" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold font-mono" />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleMenuOpen(v => !v)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 px-5 py-3 rounded-xl text-xs font-black outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/20 transition-all shadow-sm dark:text-white flex items-center justify-between"
                >
                  <span className="truncate">{newRole}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isRoleMenuOpen ? 'rotate-180' : 'rotate-0'}`} />
                </button>

                {isRoleMenuOpen && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRoleMenuOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div className="absolute left-0 right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[1.5rem] shadow-2xl overflow-hidden">
                      <div className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setNewRole(UserRole.STANDARD);
                            setIsRoleMenuOpen(false);
                          }}
                          className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${newRole === UserRole.STANDARD ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}
                        >
                          Standard
                        </button>
                        {isSuper && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewRole(UserRole.ADMIN);
                              setIsRoleMenuOpen(false);
                            }}
                            className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${newRole === UserRole.ADMIN ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}
                          >
                            Admin
                          </button>
                        )}
                        {isSuper && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewRole(UserRole.SUPER_USER);
                              setIsRoleMenuOpen(false);
                            }}
                            className={`w-full text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${newRole === UserRole.SUPER_USER ? 'bg-indigo-50 text-indigo-600 dark:bg-slate-700 dark:text-indigo-400' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 dark:hover:text-indigo-400'}`}
                          >
                            Super User
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">Register</button>
            </form>
          </section>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
             <Search className="w-5 h-5 text-slate-300" />
             <input type="text" placeholder="Search identities..." className="flex-grow bg-transparent border-none focus:ring-0 text-sm font-bold dark:text-white" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">User</th>
                  {isSuper && (
                    <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mail ID</th>
                  )}
                  <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                  <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Passcode</th>
                  <th className="px-8 py-5 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/30">
                    <td className="px-8 py-6 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-700 flex items-center justify-center">
                        <span className="text-white font-black text-sm">{String(u.name || 'U').charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 dark:text-white">{u.name}</p>
                      </div>
                    </td>
                    {isSuper && (
                      <td className="px-8 py-6">
                        <span className="text-xs font-black text-slate-500 dark:text-slate-300">{u.email}</span>
                      </td>
                    )}
                    <td className="px-8 py-6">
                      <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg ${u.role === UserRole.SUPER_USER ? 'bg-indigo-600 text-white' : u.role === UserRole.ADMIN ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-black tracking-widest">
                          {isSuper && showPasswords[u.id]
                            ? (sensitiveById[u.id]?.password || '••••••')
                            : '••••••'}
                        </span>
                        {isSuper && (
                          <button onClick={() => setShowPasswords(p => ({...p, [u.id]: !p[u.id]}))}><Eye className="w-3.5 h-3.5 text-slate-300" /></button>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right space-x-2">
                      {(() => {
                        const roleLower = String(u.role || '').toLowerCase();
                        const canForce = (isSuper || (isAdmin && roleLower !== 'superuser')) && u.id !== currentUser.id;
                        return canForce ? (
                          <button
                            onClick={() => forceLogout(u.id)}
                            className="p-2 text-slate-300 hover:text-amber-500"
                            title="Force logout"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : null;
                      })()}
                      {(() => {
                        const roleLower = String(u.role || '').toLowerCase();
                        const canDelete = (isSuper || (isAdmin && roleLower !== 'superuser')) && u.id !== 'su-atharva' && u.id !== currentUser.id;
                        return canDelete ? (
                          <button onClick={() => deleteUser(u.id)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        ) : null;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Management;
