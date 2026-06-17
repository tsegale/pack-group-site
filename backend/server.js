require('dotenv').config();
const express  = require('express');
const path     = require('path');
const crypto   = require('crypto');
const session  = require('express-session');
const helmet   = require('helmet');

const { requireAuth } = require('./middleware/requireAuth');

const authRouter         = require('./routes/auth');
const { apiRouter: propApi,   adminRouter: propAdmin }   = require('./routes/properties');
const { apiRouter: insApi,    adminRouter: insAdmin }    = require('./routes/insurance');
const { apiRouter: leadsApi,  adminRouter: leadsAdmin }  = require('./routes/leads');
const settingsRouter     = require('./routes/settings');
const accountRouter      = require('./routes/account');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── TRUST PROXY (Railway/reverse proxy) ── */
app.set('trust proxy', 1);

/* ── VIEW ENGINE ── */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ── SECURITY HEADERS ── */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

/* ── BODY PARSING ── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── SESSION ── */
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-please-change',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  'strict',
    maxAge:    24 * 60 * 60 * 1000,
  },
}));

/* ── CSRF TOKEN (per-session) ── */
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

/* ── STATIC: admin uploads ── */
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

/* ── STATIC: admin CSS ── */
app.use('/admin-assets', express.static(path.join(__dirname, 'public')));

/* ── PUBLIC API ── */
app.use('/api/properties', propApi);
app.use('/api/insurance',  insApi);
app.use('/api/leads',      leadsApi);

/* ── ADMIN ── */
app.get('/admin', (req, res) => {
  res.redirect(req.session.userId ? '/admin/dashboard' : '/admin/login');
});
app.use('/admin', authRouter);

app.get('/admin/dashboard', requireAuth, (req, res) => {
  const { getDb } = require('./db/database');
  const db = getDb();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stats = {
    activeListings: db.prepare("SELECT COUNT(*) as c FROM properties WHERE status = 'available'").get().c,
    totalListings:  db.prepare('SELECT COUNT(*) as c FROM properties').get().c,
    newLeads:       db.prepare('SELECT COUNT(*) as c FROM leads WHERE created_at >= ?').get(weekAgo).c,
    totalLeads:     db.prepare('SELECT COUNT(*) as c FROM leads').get().c,
    reLeads:        db.prepare("SELECT COUNT(*) as c FROM leads WHERE source_division = 'real-estate'").get().c,
    insLeads:       db.prepare("SELECT COUNT(*) as c FROM leads WHERE source_division = 'insurance'").get().c,
    newStatus:      db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'new'").get().c,
  };
  const recentLeads = db.prepare(`
    SELECT l.*, p.title as property_title
    FROM leads l LEFT JOIN properties p ON l.property_id = p.id
    ORDER BY l.created_at DESC LIMIT 5
  `).all();

  res.render('admin/dashboard', {
    title: 'Dashboard', page: 'dashboard',
    user: req.session.user, csrfToken: req.session.csrfToken,
    stats, recentLeads,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

app.use('/admin/properties', requireAuth, propAdmin);
app.use('/admin/insurance',  requireAuth, insAdmin);
app.use('/admin/leads',      requireAuth, leadsAdmin);
app.use('/admin/settings',   requireAuth, settingsRouter);
app.use('/admin/account',    requireAuth, accountRouter);

/* ── STATIC SITE (must be last) ── */
app.use(express.static(path.join(__dirname, '..')));

/* ── 404 FALLBACK ── */
app.use((req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.status(404).render('admin/error', {
      title:     '404 Not Found',
      message:   'The page you requested does not exist.',
      csrfToken: req.session.csrfToken || '',
      user:      req.session.user || { name: '' },
      page:      '',
    });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'index.html'));
});

/* ── ERROR HANDLER ── */
app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).render('admin/error', {
    title:     'Server Error',
    message:   process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
    csrfToken: req.session.csrfToken || '',
    user:      req.session.user || { name: '' },
    page:      '',
  });
});

app.listen(PORT, () => {
  console.log(`Pack Group server running on http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
});
