import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

/**
 * SERVER CONFIGURATION
 * This script handles:
 * 1. Database persistence via db.json
 * 2. Real-time events via Socket.IO
 * 3. Identity management and Authentication
 */

const app = express();
app.use(cors());

const DIST_PATH = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', message: 'Officely Core Server is running' });
});

if (fs.existsSync(DIST_PATH)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const DB_PATH = path.join(__dirname, 'db.json');

const activeSessions = new Map();

const DEFAULT_SETTINGS = {
  siteName: 'Officely',
  logoUrl: '',
  loginBgUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
  darkMode: false,
  availableStatuses: ['Available', 'Lunch', 'Snacks', 'Refreshment Break', 'Feedback', 'Cross Utilization'],
};

// Initial Seed Data
const DEFAULT_DB = {
  users: [
    {
      id: 'su-atharva',
      name: 'Atharva',
      email: 'atharva.divate@pharmarack.com',
      password: 'Bappa@123',
      role: 'SuperUser',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=atharva',
      createdAt: new Date().toISOString()
    },
    {
      id: 'adm-vivek',
      name: 'vivek',
      email: 'vivek@office.com',
      password: '842194',
      role: 'Admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vivek',
      createdAt: new Date().toISOString()
    }
  ],
  settings: DEFAULT_SETTINGS,
  presence: {},
  history: []
};

// Database Initialization
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      console.log('Database not found. Initializing with default records...');
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.settings) {
      parsed.settings = DEFAULT_SETTINGS;
      writeDB(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('Database Read Error:', err);
    return DEFAULT_DB;
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Database Write Error:', err);
  }
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Initial system sync
  const db = readDB();
  socket.emit('system_sync', {
    users: db.users,
    presence: Object.values(db.presence),
    history: db.history,
    settings: db.settings || DEFAULT_SETTINGS
  });

  const clearActiveSessionIfCurrent = (userId) => {
    if (!userId) return;
    const existing = activeSessions.get(userId);
    if (existing && existing.socketId === socket.id) {
      activeSessions.delete(userId);
    }
  };

  const forceLogoutSession = (userId) => {
    if (!userId) return;
    const existing = activeSessions.get(userId);
    if (!existing) return;
    const existingSocket = io.sockets.sockets.get(existing.socketId);
    if (existingSocket) {
      existingSocket.emit('force_logout', { message: 'Your session was ended because you logged in from another device.' });
      existingSocket.disconnect(true);
    }
    activeSessions.delete(userId);
    removePresenceForUser(userId);
  };

  function removePresenceForUser(userId) {
    if (!userId) return;
    const db = readDB();
    if (!db.presence) return;

    const removedIds = new Set();

    if (db.presence[userId]) {
      delete db.presence[userId];
      removedIds.add(userId);
    }

    for (const [key, value] of Object.entries(db.presence)) {
      if (value && value.userId === userId) {
        delete db.presence[key];
        removedIds.add(value.userId);
      }
    }

    if (removedIds.size > 0) {
      writeDB(db);
      for (const id of removedIds) io.emit('user_offline', id);
    }
  }

  socket.on('user_logout', (userId) => {
    clearActiveSessionIfCurrent(userId);
    removePresenceForUser(userId);
  });

  // Authentication
  socket.on('auth_login', ({ email, password, sessionId }) => {
    const db = readDB();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
    );
    if (user) {
      socket.data.sessionId = sessionId;

      const existing = activeSessions.get(user.id);
      if (existing && existing.socketId !== socket.id) {
        const existingSessionId = existing.sessionId;
        const sameSession = Boolean(existingSessionId) && Boolean(sessionId) && existingSessionId === sessionId;
        if (!sameSession) {
          forceLogoutSession(user.id);
        }
      }

      activeSessions.set(user.id, { socketId: socket.id, sessionId });
      socket.data.userId = user.id;
      socket.emit('auth_success', user);
    }
    else socket.emit('auth_failure', { message: 'Identity verification failed.' });
  });

  socket.on('auth_resume', (payload) => {
    const userId = typeof payload === 'string' ? payload : payload?.userId;
    const sessionId = typeof payload === 'string' ? undefined : payload?.sessionId;
    if (!userId) return;
    const db = readDB();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;

    socket.data.sessionId = sessionId;
    const existing = activeSessions.get(user.id);
    if (existing && existing.socketId !== socket.id) {
      const existingSessionId = existing.sessionId;
      const sameSession = Boolean(existingSessionId) && Boolean(sessionId) && existingSessionId === sessionId;
      if (!sameSession) {
        forceLogoutSession(user.id);
      }
    }

    activeSessions.set(user.id, { socketId: socket.id, sessionId });
    socket.data.userId = user.id;
    socket.emit('auth_success', user);
  });

  socket.on('session_takeover', () => {
    const pendingUserId = socket.data.pendingUserId;
    const pendingSessionId = socket.data.pendingSessionId;
    if (!pendingUserId || !pendingSessionId) return;

    forceLogoutSession(pendingUserId);

    const db = readDB();
    const user = db.users.find((u) => u.id === pendingUserId);
    if (!user) return;

    socket.data.sessionId = pendingSessionId;
    activeSessions.set(user.id, { socketId: socket.id, sessionId: pendingSessionId });
    socket.data.userId = user.id;
    socket.data.pendingUserId = undefined;
    socket.data.pendingSessionId = undefined;
    socket.emit('auth_success', user);
  });

  socket.on('session_takeover_cancel', () => {
    socket.data.pendingUserId = undefined;
    socket.data.pendingSessionId = undefined;
  });

  socket.on('update_settings', (nextSettings) => {
    const db = readDB();
    const uid = socket.data.userId;
    const actor = uid ? db.users.find(u => u.id === uid) : null;
    const role = actor ? actor.role : null;
    const isPrivileged = role === 'SuperUser' || role === 'Admin';
    if (!isPrivileged) {
      console.log('[settings] update_settings denied', { uid, role });
      return;
    }
    db.settings = nextSettings;
    writeDB(db);
    console.log('[settings] update_settings applied', db.settings && db.settings.siteName);
    io.emit('settings_update', db.settings);
  });

  // Status Updates
  socket.on('status_change', (data) => {
    const db = readDB();
    const { userId, userName, status } = data;
    const timestamp = new Date().toISOString();

    if (userId && !socket.data.userId) socket.data.userId = userId;

    // Update presence entry
    db.presence[userId] = { ...data, lastUpdate: timestamp };
    
    // Log history
    db.history.push({
      id: Math.random().toString(36).substr(2, 9),
      userId,
      userName,
      status,
      timestamp
    });

    writeDB(db);
    
    // Broadcast to all clients (including sender to confirm server sync)
    io.emit('presence_update', db.presence[userId]);
    io.emit('history_update', db.history);
  });

  // User Management
  socket.on('add_user', (newUser) => {
    const db = readDB();
    db.users.push(newUser);
    writeDB(db);
    io.emit('users_update', db.users);
  });

  socket.on('delete_user', (userId) => {
    const db = readDB();
    db.users = db.users.filter(u => u.id !== userId);
    delete db.presence[userId];
    writeDB(db);
    io.emit('users_update', db.users);
    io.emit('user_offline', userId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    clearActiveSessionIfCurrent(socket.data.userId);
    removePresenceForUser(socket.data.userId);
  });
});

const PORT = Number.parseInt(process.env.PORT || '3001', 10) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
=========================================
OFFICELY REAL-TIME BACKEND RUNNING
=========================================
Port: ${PORT}
Local: http://localhost:${PORT}
Network: http://[YOUR_IP_HERE]:${PORT}
Database: ${DB_PATH}
=========================================
`);
});
