console.log('Starting realtime-server.cjs...');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Officely Core Server is running' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const activeSessions = new Map();
const pendingPresenceCleanup = new Map();

const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '12345678';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'pharmarack';

let pool = null;

const DEFAULT_SETTINGS = {
  siteName: 'Officely',
  logoUrl: '',
  loginBgUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
  darkMode: false,
  availableStatuses: ['Available', 'Lunch', 'Snacks', 'Refreshment Break', 'Quality Feedback', 'Cross Utilization'],
};

const DEFAULT_DB = {
  users: [
    {
      id: 'su-atharva',
      name: 'Atharva',
      email: 'atharva.divate@pharmarack.com',
      password: 'Bappa@123',
      role: 'SuperUser',
      avatar: 'https://ui-avatars.com/api/?name=${encodeURIComponent(Name)}&background=random&color=fff',
      createdAt: new Date().toISOString(),
    },
  ],
  settings: DEFAULT_SETTINGS,
  presence: {},
  history: [],
};

async function initMySql() {
  console.log('Initializing MySQL...');
  try {
  
  const adminConn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
  });

  await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\``);
      await adminConn.end();
  } catch (e) {
    console.error('Error in initMySql:', e);
    throw e;
  }

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });

  await pool.query(
    "CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role VARCHAR(32) NOT NULL, avatar TEXT, createdAt VARCHAR(40) NOT NULL)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS settings (id INT PRIMARY KEY, data LONGTEXT NOT NULL)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS presence (userId VARCHAR(64) PRIMARY KEY, data LONGTEXT NOT NULL, lastUpdate VARCHAR(40) NOT NULL)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS history (id VARCHAR(64) PRIMARY KEY, userId VARCHAR(64) NOT NULL, userName VARCHAR(255) NOT NULL, status VARCHAR(64) NOT NULL, timestamp VARCHAR(40) NOT NULL, INDEX idx_userId (userId), INDEX idx_timestamp (timestamp))"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS logs (id VARCHAR(64) PRIMARY KEY, userId VARCHAR(64) NOT NULL, userName VARCHAR(255) NOT NULL, event VARCHAR(64) NOT NULL, timestamp VARCHAR(40) NOT NULL, details LONGTEXT, INDEX idx_userId (userId), INDEX idx_timestamp (timestamp))"
  );

  const [userCountRows] = await pool.query('SELECT COUNT(*) AS c FROM users');
  const userCount = Number(userCountRows && userCountRows[0] && userCountRows[0].c ? userCountRows[0].c : 0);
  if (userCount === 0) {
    for (const u of DEFAULT_DB.users) {
      await pool.query(
        'INSERT INTO users (id, name, email, password, role, avatar, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [u.id, u.name, u.email, u.password, u.role, u.avatar || '', u.createdAt]
      );
    }
  }

  const [settingsRows] = await pool.query('SELECT COUNT(*) AS c FROM settings WHERE id = 1');
  const settingsCount = Number(settingsRows && settingsRows[0] && settingsRows[0].c ? settingsRows[0].c : 0);
  if (settingsCount === 0) {
    await pool.query('INSERT INTO settings (id, data) VALUES (1, ?)', [JSON.stringify(DEFAULT_SETTINGS)]);
  }
}

async function getUsers() {
  const [rows] = await pool.query('SELECT id, name, email, password, role, avatar, createdAt FROM users');
  return rows;
}

async function getSettings() {
  const [rows] = await pool.query('SELECT data FROM settings WHERE id = 1');
  if (!rows || rows.length === 0) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(rows[0].data);
    if (parsed && Array.isArray(parsed.availableStatuses)) {
      parsed.availableStatuses = parsed.availableStatuses.map((s) => (s === 'Feedback' ? 'Quality Feedback' : s));
    }
    return parsed;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

async function setSettings(nextSettings) {
  await pool.query('UPDATE settings SET data = ? WHERE id = 1', [JSON.stringify(nextSettings)]);
}

async function getPresenceList() {
  const [rows] = await pool.query('SELECT data FROM presence');
  return (rows || []).map((r) => {
    try {
      return JSON.parse(r.data);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

async function upsertPresence(entry) {
  await pool.query(
    'REPLACE INTO presence (userId, data, lastUpdate) VALUES (?, ?, ?)',
    [entry.userId, JSON.stringify(entry), entry.lastUpdate]
  );
}

async function deletePresence(userId) {
  await pool.query('DELETE FROM presence WHERE userId = ?', [userId]);
}

async function getHistory() {
  const [rows] = await pool.query('SELECT id, userId, userName, status, timestamp FROM history ORDER BY timestamp DESC');
  return rows;
}

async function addHistoryRow(row) {
  await pool.query(
    'INSERT INTO history (id, userId, userName, status, timestamp) VALUES (?, ?, ?, ?, ?)',
    [row.id, row.userId, row.userName, row.status, row.timestamp]
  );
}

async function addLogRow(row) {
  await pool.query(
    'INSERT INTO logs (id, userId, userName, event, timestamp, details) VALUES (?, ?, ?, ?, ?, ?)',
    [row.id, row.userId, row.userName, row.event, row.timestamp, row.details ? JSON.stringify(row.details) : null]
  );
}

io.on('connection', (socket) => {
  (async () => {
    const [users, presence, history, settings] = await Promise.all([
      getUsers(),
      getPresenceList(),
      getHistory(),
      getSettings(),
    ]);

    socket.emit('system_sync', {
      users,
      presence,
      history,
      settings,
      serverTime: Date.now(),
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
    (async () => {
      const users = await getUsers();
      const u = users.find((x) => x.id === userId);
      if (!u) return;
      const ts = new Date().toISOString();
      await addHistoryRow({
        id: Math.random().toString(36).substr(2, 9),
        userId: u.id,
        userName: u.name,
        status: 'Offline',
        timestamp: ts,
      });
      io.emit('history_update', await getHistory());
    })().catch(() => {});
    removePresenceForUser(userId, true);
  };

  const finalizeAuth = (user) => {
    const pendingSessionId = socket.data.pendingSessionId;
    const sessionId = pendingSessionId || socket.data.sessionId;
    if (sessionId) activeSessions.set(user.id, { socketId: socket.id, sessionId });
    socket.data.userId = user.id;
    socket.data.pendingUserId = undefined;
    socket.data.pendingSessionId = undefined;
    socket.emit('auth_success', user);
  };

  const cancelPresenceCleanup = (userId) => {
    if (!userId) return;
    const t = pendingPresenceCleanup.get(userId);
    if (t) clearTimeout(t);
    pendingPresenceCleanup.delete(userId);
  };

  async function removePresenceForUser(userId, immediate) {
    if (!userId) return;

    cancelPresenceCleanup(userId);

    if (immediate) {
      await deletePresence(userId);
      io.emit('user_offline', userId);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        await deletePresence(userId);
        io.emit('user_offline', userId);
      } catch (e) {}
      pendingPresenceCleanup.delete(userId);
    }, 12000);

    pendingPresenceCleanup.set(userId, timeout);
  }

  socket.on('user_logout', (userId) => {
    clearActiveSessionIfCurrent(userId);
    (async () => {
      const users = await getUsers();
      const u = users.find((x) => x.id === userId);
      if (!u) return;

      const ts = new Date().toISOString();
      await addHistoryRow({
        id: Math.random().toString(36).substr(2, 9),
        userId: u.id,
        userName: u.name,
        status: 'Offline',
        timestamp: ts,
      });
      io.emit('history_update', await getHistory());
    })().catch(() => {});

    removePresenceForUser(userId, true);
    (async () => {
      const users = await getUsers();
      const u = users.find((x) => x.id === userId);
      if (!u) return;
      await addLogRow({
        id: Math.random().toString(36).substr(2, 9),
        userId: u.id,
        userName: u.name,
        event: 'logout',
        timestamp: new Date().toISOString(),
        details: { socketId: socket.id },
      });
    })().catch(() => {});
  });

  socket.on('auth_login', ({ email, password, sessionId }) => {
    (async () => {
      const users = await getUsers();
      const user = users.find(
        (u) => String(u.email).toLowerCase() === String(email).toLowerCase() && String(u.password) === String(password)
      );
      if (!user) return socket.emit('auth_failure', { message: 'Identity verification failed.' });

      cancelPresenceCleanup(user.id);

      socket.data.sessionId = sessionId;

      const existing = activeSessions.get(user.id);
      if (existing && existing.socketId !== socket.id) {
        const existingSessionId = existing.sessionId;
        const sameSession = Boolean(existingSessionId) && Boolean(sessionId) && existingSessionId === sessionId;
        if (!sameSession) forceLogoutSession(user.id);
      }

      activeSessions.set(user.id, { socketId: socket.id, sessionId });
      socket.data.userId = user.id;
      socket.emit('auth_success', user);

      await addLogRow({
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        event: 'login',
        timestamp: new Date().toISOString(),
        details: { socketId: socket.id, sessionId: sessionId || null },
      });
    })().catch(() => socket.emit('auth_failure', { message: 'Identity verification failed.' }));
  });

  socket.on('auth_resume', (payload) => {
    (async () => {
      const userId = typeof payload === 'string' ? payload : payload?.userId;
      const sessionId = typeof payload === 'string' ? undefined : payload?.sessionId;
      if (!userId) return;
      const users = await getUsers();
      const user = users.find((u) => u.id === userId);
      if (!user) return;

      cancelPresenceCleanup(user.id);

      socket.data.sessionId = sessionId;
      const existing = activeSessions.get(user.id);
      if (existing && existing.socketId !== socket.id) {
        const existingSessionId = existing.sessionId;
        const sameSession = Boolean(existingSessionId) && Boolean(sessionId) && existingSessionId === sessionId;
        if (!sameSession) forceLogoutSession(user.id);
      }

      activeSessions.set(user.id, { socketId: socket.id, sessionId });
      socket.data.userId = user.id;
      socket.emit('auth_success', user);

      await addLogRow({
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        event: 'resume',
        timestamp: new Date().toISOString(),
        details: { socketId: socket.id, sessionId: sessionId || null },
      });
    })().catch(() => {});
  });

  socket.on('update_settings', (nextSettings) => {
    (async () => {
      const uid = socket.data.userId;
      const users = await getUsers();
      const actor = uid ? users.find((u) => u.id === uid) : null;
      const role = actor ? actor.role : null;
      const isPrivileged = role === 'SuperUser' || role === 'Admin';
      if (!isPrivileged) {
        console.log('[settings] update_settings denied', { uid, role });
        return;
      }

      await setSettings(nextSettings);
      console.log('[settings] update_settings applied', nextSettings && nextSettings.siteName);
      io.emit('settings_update', nextSettings);
    })().catch(() => {});
  });

  socket.on('status_change', (data) => {
    (async () => {
      const { userId, userName, status, activity } = data;
      const timestamp = new Date().toISOString();

      if (userId && !socket.data.userId) socket.data.userId = userId;

      cancelPresenceCleanup(userId);

      const entry = { ...data, activity, lastUpdate: timestamp, serverTime: Date.now() };
      await upsertPresence(entry);

      await addHistoryRow({
        id: Math.random().toString(36).substr(2, 9),
        userId,
        userName,
        status,
        timestamp,
      });

      io.emit('presence_update', entry);
      io.emit('history_update', await getHistory());
    })().catch(() => {});
  });

  socket.on('add_user', (newUser) => {
    (async () => {
      await pool.query(
        'INSERT INTO users (id, name, email, password, role, avatar, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newUser.id, newUser.name, newUser.email, newUser.password, newUser.role, newUser.avatar || '', newUser.createdAt]
      );
      io.emit('users_update', await getUsers());
    })().catch(() => {});
  });

  socket.on('delete_user', (userId) => {
    (async () => {
      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      await deletePresence(userId);
      io.emit('users_update', await getUsers());
      io.emit('user_offline', userId);
    })().catch(() => {});
  });

  socket.on('disconnect', () => {
    clearActiveSessionIfCurrent(socket.data.userId);
    removePresenceForUser(socket.data.userId, false);
  });
  })().catch(() => {});
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
(async () => {
  try {
    await initMySql();
  } catch (e) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! DATABASE CONNECTION FAILED, CHECK CREDENTIALS !!!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`OFFICELY REAL-TIME BACKEND RUNNING on http://localhost:${PORT}`);
    console.log(`Database: mysql://${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`);
  });
})().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
