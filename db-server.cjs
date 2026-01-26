const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const DB_PATH = path.join(__dirname, 'db.local.json');

const DEFAULT_DB = {
  users: [
    {
      id: 'su-atharva',
      name: 'Atharva',
      email: 'atharva.divate@pharmarack.com',
      password: 'Bappa@123',
      role: 'SuperUser',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=atharva',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'adm-vivek',
      name: 'vivek',
      email: 'vivek@office.com',
      password: '842194',
      role: 'Admin',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vivek',
      createdAt: new Date().toISOString(),
    },
  ],
  presence: {},
  history: [],
};

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_DB;
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'Officely DB Server is running', dbPath: DB_PATH });
});

app.get('/db', (req, res) => {
  res.json(readDB());
});

app.get('/users', (req, res) => {
  res.json(readDB().users);
});

app.post('/users', (req, res) => {
  const db = readDB();
  const user = req.body;
  if (!user || !user.id || !user.email) {
    return res.status(400).json({ message: 'Invalid user. Required: id, email' });
  }
  if (db.users.some((u) => u.id === user.id)) {
    return res.status(409).json({ message: 'User id already exists' });
  }
  if (db.users.some((u) => String(u.email).toLowerCase() === String(user.email).toLowerCase())) {
    return res.status(409).json({ message: 'User email already exists' });
  }
  const created = { createdAt: nowIso(), ...user };
  db.users.push(created);
  writeDB(db);
  res.status(201).json(created);
});

app.delete('/users/:id', (req, res) => {
  const db = readDB();
  const userId = req.params.id;
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== userId);
  delete db.presence[userId];
  if (db.users.length === before) {
    return res.status(404).json({ message: 'User not found' });
  }
  writeDB(db);
  res.json({ ok: true });
});

app.get('/presence', (req, res) => {
  const db = readDB();
  res.json(Object.values(db.presence || {}));
});

app.get('/presence/:userId', (req, res) => {
  const db = readDB();
  res.json(db.presence?.[req.params.userId] || null);
});

app.post('/presence', (req, res) => {
  const db = readDB();
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: 'Invalid presence. Required: userId' });

  const entry = { ...req.body, lastUpdate: nowIso() };
  db.presence[userId] = entry;

  const { userName, status } = entry;
  if (userName && status) {
    db.history.push({
      id: Math.random().toString(36).substr(2, 9),
      userId,
      userName,
      status,
      timestamp: entry.lastUpdate,
    });
  }

  writeDB(db);
  res.json(entry);
});

app.delete('/presence/:userId', (req, res) => {
  const db = readDB();
  const userId = req.params.userId;
  if (!db.presence?.[userId]) return res.status(404).json({ message: 'Presence not found' });
  delete db.presence[userId];
  writeDB(db);
  res.json({ ok: true });
});

app.get('/history', (req, res) => {
  res.json(readDB().history);
});

app.post('/reset', (req, res) => {
  writeDB(DEFAULT_DB);
  res.json({ ok: true });
});

const PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 4001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Officely DB Server running on http://localhost:${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
});
