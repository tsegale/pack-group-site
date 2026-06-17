const express = require('express');
const { getDb } = require('../db/database');
const { validateCsrf } = require('../middleware/requireAuth');

/* ════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get('/', (req, res) => {
  const db = getDb();
  const products = db.prepare(
    'SELECT * FROM insurance_products WHERE active = 1 ORDER BY sort_order ASC'
  ).all();
  res.json(products);
});

/* ════════════════════════════
   ADMIN ROUTER
   ════════════════════════════ */
const adminRouter = express.Router();

adminRouter.get('/', (req, res) => {
  const db       = getDb();
  const products = db.prepare('SELECT * FROM insurance_products ORDER BY sort_order ASC').all();
  res.render('admin/insurance', {
    title: 'Insurance Products', page: 'insurance',
    user: req.session.user, csrfToken: req.session.csrfToken,
    products, flash: req.session.flash || null,
  });
  delete req.session.flash;
});

/* CREATE */
adminRouter.post('/', validateCsrf, (req, res) => {
  const db = getDb();
  const { title, category, short_description, full_description, icon_name, sort_order, active } = req.body;
  if (!title) {
    req.session.flash = { type: 'error', msg: 'Title is required.' };
    return res.redirect('/admin/insurance');
  }
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM insurance_products').get().m || 0;
  db.prepare(`
    INSERT INTO insurance_products (title, category, short_description, full_description, icon_name, sort_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title.trim(), category || '', short_description || '', full_description || '',
         icon_name || 'fa-shield-halved', parseInt(sort_order) || maxOrder + 1,
         active === 'on' ? 1 : 0);
  req.session.flash = { type: 'success', msg: `"${title}" created.` };
  res.redirect('/admin/insurance');
});

/* UPDATE */
adminRouter.post('/:id', validateCsrf, (req, res) => {
  const db = getDb();
  const { title, category, short_description, full_description, icon_name, sort_order, active } = req.body;
  db.prepare(`
    UPDATE insurance_products SET
      title = ?, category = ?, short_description = ?, full_description = ?,
      icon_name = ?, sort_order = ?, active = ?
    WHERE id = ?
  `).run(title || '', category || '', short_description || '', full_description || '',
         icon_name || 'fa-shield-halved', parseInt(sort_order) || 0,
         active === 'on' ? 1 : 0, req.params.id);
  req.session.flash = { type: 'success', msg: 'Product updated.' };
  res.redirect('/admin/insurance');
});

/* DELETE */
adminRouter.post('/:id/delete', validateCsrf, (req, res) => {
  getDb().prepare('DELETE FROM insurance_products WHERE id = ?').run(req.params.id);
  req.session.flash = { type: 'success', msg: 'Product deleted.' };
  res.redirect('/admin/insurance');
});

/* TOGGLE ACTIVE (AJAX) */
adminRouter.post('/:id/toggle', validateCsrf, (req, res) => {
  const db      = getDb();
  const product = db.prepare('SELECT active FROM insurance_products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  const newVal  = product.active ? 0 : 1;
  db.prepare('UPDATE insurance_products SET active = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ active: newVal });
});

/* MOVE */
adminRouter.post('/:id/move', validateCsrf, (req, res) => {
  const db        = getDb();
  const { direction } = req.body;
  const products  = db.prepare('SELECT * FROM insurance_products ORDER BY sort_order ASC').all();
  const idx       = products.findIndex(p => p.id == req.params.id);
  if (idx === -1) return res.redirect('/admin/insurance');
  const swapIdx   = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= products.length) return res.redirect('/admin/insurance');
  const a = products[idx], b = products[swapIdx];
  db.prepare('UPDATE insurance_products SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
  db.prepare('UPDATE insurance_products SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
  res.redirect('/admin/insurance');
});

module.exports = { apiRouter, adminRouter };
