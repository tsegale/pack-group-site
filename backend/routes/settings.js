const express = require('express');
const { getDb } = require('../db/database');
const { validateCsrf } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.render('admin/settings', {
    title: 'Site Settings', page: 'settings',
    user: req.session.user, csrfToken: req.session.csrfToken,
    settings, flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.post('/', validateCsrf, (req, res) => {
  const db = getDb();
  const allowed = [
    'hero_headline', 'hero_subheadline', 'hero_tagline',
    'stat_companies', 'stat_brand', 'stat_commitment', 'stat_region',
    'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_address',
    'footer_tagline', 'footer_description',
  ];
  const upsert = db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction(() => {
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        upsert.run(key, req.body[key].trim());
      }
    });
  });
  updateMany();
  req.session.flash = { type: 'success', msg: 'Settings saved.' };
  res.redirect('/admin/settings');
});

module.exports = router;
