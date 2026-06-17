const express   = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/database');
const { validateCsrf } = require('../middleware/requireAuth');

/* ── Rate limiter: 5 submissions per IP per hour ── */
const leadLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              5,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many submissions. Please try again in an hour.' },
});

/* ── Input validation ── */
function validateLead(body) {
  const { name, email, phone, message, source_division } = body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return 'A valid name (at least 2 characters) is required.';
  }
  if (!email && !phone) {
    return 'Please provide at least an email address or phone number.';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Please provide a valid email address.';
  }
  if (!['real-estate', 'insurance'].includes(source_division)) {
    return 'Invalid source division.';
  }
  if (message && message.length > 3000) {
    return 'Message is too long (max 3000 characters).';
  }
  return null;
}

/* ════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════ */
const apiRouter = express.Router();

apiRouter.post('/', leadLimiter, (req, res) => {
  const { name, phone, email, message, source_division, property_id } = req.body;

  const err = validateLead(req.body);
  if (err) return res.status(400).json({ error: err });

  const db = getDb();

  let resolvedPropertyId = null;
  if (property_id) {
    const prop = db.prepare('SELECT id FROM properties WHERE id = ?').get(parseInt(property_id));
    if (prop) resolvedPropertyId = prop.id;
  }

  db.prepare(`
    INSERT INTO leads (name, phone, email, message, source_division, property_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    phone ? phone.trim() : null,
    email ? email.trim().toLowerCase() : null,
    message ? message.trim() : null,
    source_division,
    resolvedPropertyId
  );

  res.json({ success: true, message: 'Thank you. We will be in touch shortly.' });
});

/* ════════════════════════════
   ADMIN ROUTER
   ════════════════════════════ */
const adminRouter = express.Router();

adminRouter.get('/', (req, res) => {
  const db       = getDb();
  const division = req.query.division || 'all';
  const status   = req.query.status || 'all';

  let query = `
    SELECT l.*, p.title as property_title, p.slug as property_slug
    FROM leads l
    LEFT JOIN properties p ON l.property_id = p.id
  `;
  const conditions = [];
  const params     = [];

  if (division !== 'all') { conditions.push('l.source_division = ?'); params.push(division); }
  if (status   !== 'all') { conditions.push('l.status = ?');          params.push(status);   }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY l.created_at DESC';

  const leads = db.prepare(query).all(...params);

  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN source_division = 'real-estate' THEN 1 ELSE 0 END) as re_count,
      SUM(CASE WHEN source_division = 'insurance'   THEN 1 ELSE 0 END) as ins_count,
      SUM(CASE WHEN status = 'new'                  THEN 1 ELSE 0 END) as new_count
    FROM leads
  `).get();

  res.render('admin/leads', {
    title: 'Leads', page: 'leads',
    user: req.session.user, csrfToken: req.session.csrfToken,
    leads, division, status, counts,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

/* UPDATE STATUS (AJAX) */
adminRouter.post('/:id/status', validateCsrf, (req, res) => {
  const db         = getDb();
  const { status } = req.body;
  const valid      = ['new', 'contacted', 'closed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true, status });
});

module.exports = { apiRouter, adminRouter };
