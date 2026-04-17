/**
 * MiniCloud - server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *   • Auth (register / login / logout / change password / delete account)
 *   • File upload / download / rename / trash / restore / delete
 *   • Folder creation
 *   • Star / unstar files
 *   • [NEW] File Sharing System  (POST /api/share, GET /api/share/info/:id,
 *                                  GET /api/share/public/:token,
 *                                  GET /api/share/download/:token,
 *                                  DELETE /api/share/:fileId)
 *   • [NEW] Password-protected shares (bcrypt hashed)
 *   • [NEW] Public / Private toggle per share link
 *
 * Storage: all data in-memory + flat JSON file (data.json) for persistence
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express     = require('express');
const session     = require('express-session');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const { v4: uuidv4 } = require('uuid');
const crypto      = require('crypto');
const bcrypt      = require('bcrypt');

const BCRYPT_ROUNDS = 10;

// ── App Setup ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'minicloud-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }   // 7 days
}));

// ── File Upload (multer) ──────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });  // 500 MB

// ── Data Layer ────────────────────────────────────────────────────────────────
/**
 * data.json structure:
 * {
 *   "users": {
 *     "<userId>": {
 *       "id": "uuid",
 *       "username": "alice",
 *       "email": "alice@x.com",
 *       "passwordHash": "$2b$10$...",
 *       "created": 1700000000000
 *     }
 *   },
 *   "files": {
 *     "<fileId>": {
 *       "id": "uuid",
 *       "ownerId": "userId",
 *       "name": "report.pdf",
 *       "diskName": "uuid.pdf",          // actual filename on disk
 *       "mimetype": "application/pdf",
 *       "size": 204800,
 *       "folder": "root",                // folder id or "root"
 *       "starred": false,
 *       "trashed": false,
 *       "created": 1700000000000,
 *       "shareToken": null               // null or token string when shared
 *     }
 *   },
 *   "shares": {
 *     "<token>": {
 *       "token": "random-hex-string",
 *       "fileId": "uuid",
 *       "ownerId": "userId",
 *       "isPublic": true,
 *       "passwordHash": null,            // null or bcrypt hash
 *       "created": 1700000000000
 *     }
 *   }
 * }
 */

const DATA_FILE = path.join(__dirname, 'data.json');

let db = { users: {}, files: {}, shares: {} };

function loadDB() {
  if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch (e) { console.error('data.json parse error, starting fresh'); }
  }
  if (!db.users)  db.users  = {};
  if (!db.files)  db.files  = {};
  if (!db.shares) db.shares = {};
}

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

loadDB();

// ── Auth Middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// ── Helper: find share by fileId ──────────────────────────────────────────────
function shareByFileId(fileId) {
  return Object.values(db.shares).find(s => s.fileId === fileId) || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/me
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const user = db.users[req.session.userId];
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: user.username });
});

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.json({ error: 'All fields required' });
  if (password.length < 6) return res.json({ error: 'Password must be 6+ characters' });

  const exists = Object.values(db.users).find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );
  if (exists) return res.json({ error: 'Username already taken' });

  const user = {
    id: uuidv4(),
    username: username.trim(),
    email: email.trim(),
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    created: Date.now()
  };
  db.users[user.id] = user;
  saveDB();

  req.session.userId = user.id;
  res.json({ ok: true, username: user.username });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: 'Fill all fields' });

  const user = Object.values(db.users).find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );
  if (!user) return res.json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  res.json({ ok: true, username: user.username });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST /api/change-password
app.post('/api/change-password', requireAuth, async (req, res) => {
  const user = db.users[req.session.userId];
  const { current, newpass } = req.body;
  if (!current || !newpass) return res.json({ error: 'Fill all fields' });
  if (newpass.length < 6) return res.json({ error: 'Password must be 6+ characters' });

  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) return res.json({ error: 'Current password is incorrect' });

  user.passwordHash = await bcrypt.hash(newpass, BCRYPT_ROUNDS);
  saveDB();
  res.json({ ok: true });
});

// DELETE /api/account
app.delete('/api/account', requireAuth, (req, res) => {
  const uid = req.session.userId;

  // Delete files from disk
  Object.values(db.files)
    .filter(f => f.ownerId === uid && f.diskName)
    .forEach(f => {
      const fp = path.join(UPLOADS_DIR, f.diskName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

  // Remove files, shares, user
  Object.keys(db.files).forEach(k => { if (db.files[k].ownerId === uid) delete db.files[k]; });
  Object.keys(db.shares).forEach(k => { if (db.shares[k].ownerId === uid) delete db.shares[k]; });
  delete db.users[uid];
  saveDB();

  req.session.destroy(() => res.json({ ok: true }));
});

// ═══════════════════════════════════════════════════════════════════════════════
//  FILE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/files
app.get('/api/files', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const files = Object.values(db.files)
    .filter(f => f.ownerId === uid)
    .map(f => ({
      id: f.id,
      name: f.name,
      mimetype: f.mimetype,
      size: f.size,
      folder: f.folder,
      starred: f.starred,
      trashed: f.trashed,
      created: f.created,
      shareToken: f.shareToken || null
    }));
  res.json({ files });
});

// POST /api/upload
app.post('/api/upload', requireAuth, upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) return res.json({ error: 'No files provided' });
  const folder = req.body.folder || 'root';
  const saved = [];

  req.files.forEach(f => {
    const record = {
      id: uuidv4(),
      ownerId: req.session.userId,
      name: f.originalname,
      diskName: f.filename,
      mimetype: f.mimetype,
      size: f.size,
      folder,
      starred: false,
      trashed: false,
      created: Date.now(),
      shareToken: null
    };
    db.files[record.id] = record;
    saved.push({ id: record.id, name: record.name });
  });

  saveDB();
  res.json({ ok: true, files: saved });
});

// GET /api/download/:id  (authenticated)
app.get('/api/download/:id', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(UPLOADS_DIR, f.diskName);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing on disk' });
  res.download(fp, f.name);
});

// DELETE /api/files/:id  (permanent delete)
app.delete('/api/files/:id', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });

  // Remove share if exists
  if (f.shareToken) delete db.shares[f.shareToken];

  // Remove from disk
  if (f.diskName) {
    const fp = path.join(UPLOADS_DIR, f.diskName);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  delete db.files[req.params.id];
  saveDB();
  res.json({ ok: true });
});

// POST /api/files/:id/star
app.post('/api/files/:id/star', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  f.starred = !f.starred;
  saveDB();
  res.json({ ok: true, starred: f.starred });
});

// POST /api/files/:id/trash
app.post('/api/files/:id/trash', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  f.trashed = true; f.starred = false;
  saveDB();
  res.json({ ok: true });
});

// POST /api/files/:id/restore
app.post('/api/files/:id/restore', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  f.trashed = false;
  saveDB();
  res.json({ ok: true });
});

// POST /api/rename/:id
app.post('/api/rename/:id', requireAuth, (req, res) => {
  const f = db.files[req.params.id];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });
  if (!req.body.name || !req.body.name.trim()) return res.json({ error: 'Name required' });
  f.name = req.body.name.trim();
  saveDB();
  res.json({ ok: true });
});

// POST /api/folder
app.post('/api/folder', requireAuth, (req, res) => {
  const { name, parent } = req.body;
  if (!name || !name.trim()) return res.json({ error: 'Name required' });
  const folder = {
    id: uuidv4(),
    ownerId: req.session.userId,
    name: name.trim(),
    diskName: null,
    mimetype: 'folder',
    size: 0,
    folder: parent || 'root',
    starred: false,
    trashed: false,
    created: Date.now(),
    shareToken: null
  };
  db.files[folder.id] = folder;
  saveDB();
  res.json({ ok: true, folder: { id: folder.id, name: folder.name } });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARE ROUTES  (NEW)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/share
 * Create or update a share link for a file.
 * Body: { fileId, isPublic, password? }
 *
 * Response: { token, isPublic }
 */
app.post('/api/share', requireAuth, async (req, res) => {
  const { fileId, isPublic, password } = req.body;
  const f = db.files[fileId];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'File not found' });
  if (f.mimetype === 'folder') return res.json({ error: 'Cannot share folders directly' });

  // Hash password if provided
  let passwordHash = null;
  if (password && password.trim()) {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  // If already shared, remove old token
  if (f.shareToken && db.shares[f.shareToken]) {
    delete db.shares[f.shareToken];
  }

  // Generate new token
  const token = crypto.randomBytes(24).toString('hex');

  const share = {
    token,
    fileId,
    ownerId: req.session.userId,
    isPublic: Boolean(isPublic),
    passwordHash,
    created: Date.now()
  };

  db.shares[token] = share;
  f.shareToken = token;
  saveDB();

  res.json({ ok: true, token, isPublic: share.isPublic });
});

/**
 * GET /api/share/info/:fileId
 * Get share info for a file (owner only).
 * Returns token, isPublic, hasPassword — but never the hash.
 */
app.get('/api/share/info/:fileId', requireAuth, (req, res) => {
  const f = db.files[req.params.fileId];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });

  if (!f.shareToken) return res.json({ shared: false });

  const share = db.shares[f.shareToken];
  if (!share) return res.json({ shared: false });

  res.json({
    shared: true,
    token: share.token,
    isPublic: share.isPublic,
    hasPassword: Boolean(share.passwordHash)
  });
});

/**
 * DELETE /api/share/:fileId
 * Revoke (delete) a share link.
 */
app.delete('/api/share/:fileId', requireAuth, (req, res) => {
  const f = db.files[req.params.fileId];
  if (!f || f.ownerId !== req.session.userId) return res.status(404).json({ error: 'Not found' });

  if (f.shareToken) {
    delete db.shares[f.shareToken];
    f.shareToken = null;
    saveDB();
  }
  res.json({ ok: true });
});

/**
 * GET /api/share/public/:token
 * Public endpoint — returns file metadata for the share gate page.
 * Does NOT require authentication.
 */
app.get('/api/share/public/:token', (req, res) => {
  const share = db.shares[req.params.token];
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (!share.isPublic) return res.status(403).json({ error: 'This link is private' });

  const f = db.files[share.fileId];
  if (!f || f.trashed) return res.status(404).json({ error: 'File not found or deleted' });

  res.json({
    filename: f.name,
    size: f.size,
    mimetype: f.mimetype,
    hasPassword: Boolean(share.passwordHash)
  });
});

/**
 * GET /api/share/download/:token
 * Public download endpoint.
 * Query param: ?password=xxx (if protected)
 *
 * Also responds to HEAD for password pre-check.
 */
async function handleShareDownload(req, res) {
  const share = db.shares[req.params.token];
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (!share.isPublic) return res.status(403).json({ error: 'This link is disabled' });

  // Password check
  if (share.passwordHash) {
    const supplied = req.query.password || '';
    if (!supplied) return res.status(401).json({ error: 'Password required' });
    const ok = await bcrypt.compare(supplied, share.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  }

  const f = db.files[share.fileId];
  if (!f || f.trashed) return res.status(404).json({ error: 'File not found' });

  if (req.method === 'HEAD') return res.status(200).end();

  const fp = path.join(UPLOADS_DIR, f.diskName);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing on disk' });

  res.download(fp, f.name);
}

app.get('/api/share/download/:token', handleShareDownload);
app.head('/api/share/download/:token', handleShareDownload);

// ═══════════════════════════════════════════════════════════════════════════════
//  STATIC & CATCH-ALL
// ═══════════════════════════════════════════════════════════════════════════════

// Serve index.html for all frontend routes (including /share/:token)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`MiniCloud running → http://localhost:${PORT}`);
});
