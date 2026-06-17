const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const { validateCsrf } = require('../middleware/requireAuth');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

/* ── IMAGE VALIDATION ── */
function isValidImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    cb(null, ok.includes(file.mimetype));
  },
});

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

function withImages(property) {
  if (!property) return null;
  const db   = getDb();
  const imgs = db.prepare(
    'SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC'
  ).all(property.id);
  return { ...property, images: imgs };
}

/* ════════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get('/featured', (req, res) => {
  const db    = getDb();
  const props = db.prepare(
    "SELECT * FROM properties WHERE featured = 1 AND status = 'available' ORDER BY created_at DESC"
  ).all();
  res.json(props.map(withImages));
});

apiRouter.get('/', (req, res) => {
  const db     = getDb();
  const status = req.query.status;
  let props;
  if (status) {
    props = db.prepare('SELECT * FROM properties WHERE status = ? ORDER BY created_at DESC').all(status);
  } else {
    props = db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  }
  res.json(props.map(withImages));
});

apiRouter.get('/:slug', (req, res) => {
  const db   = getDb();
  const prop = db.prepare('SELECT * FROM properties WHERE slug = ?').get(req.params.slug);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  res.json(withImages(prop));
});

/* ════════════════════════════════
   ADMIN ROUTER
   ════════════════════════════════ */
const adminRouter = express.Router();

/* LIST */
adminRouter.get('/', (req, res) => {
  const db     = getDb();
  const filter = req.query.status || 'all';
  let props;
  if (filter === 'all') {
    props = db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  } else {
    props = db.prepare('SELECT * FROM properties WHERE status = ? ORDER BY created_at DESC').all(filter);
  }
  const propsWithImgs = props.map(p => {
    const cover = db.prepare(
      'SELECT filename FROM property_images WHERE property_id = ? AND is_cover = 1 LIMIT 1'
    ).get(p.id);
    return { ...p, coverImage: cover ? cover.filename : null };
  });
  res.render('admin/properties', {
    title: 'Properties', page: 'properties',
    user: req.session.user, csrfToken: req.session.csrfToken,
    properties: propsWithImgs, filter,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

/* NEW FORM */
adminRouter.get('/new', (req, res) => {
  res.render('admin/property-form', {
    title: 'Add Property', page: 'properties',
    user: req.session.user, csrfToken: req.session.csrfToken,
    property: null, images: [],
    flash: null,
  });
});

/* CREATE */
adminRouter.post('/', validateCsrf, upload.array('images', 20), (req, res) => {
  const db = getDb();
  let { title, type, price, levy, bedrooms, bathrooms, location,
        description, status, units_available, rental_option,
        contact_phone, featured, slug } = req.body;

  if (!title || !location || !price) {
    return res.render('admin/property-form', {
      title: 'Add Property', page: 'properties',
      user: req.session.user, csrfToken: req.session.csrfToken,
      property: req.body, images: [],
      flash: { type: 'error', msg: 'Title, location, and price are required.' },
    });
  }

  slug = slug ? slugify(slug) : slugify(title);

  const existing = db.prepare('SELECT id FROM properties WHERE slug = ?').get(slug);
  if (existing) slug = slug + '-' + Date.now();

  const result = db.prepare(`
    INSERT INTO properties
      (title, type, price, levy, bedrooms, bathrooms, location,
       description, status, units_available, rental_option,
       contact_phone, featured, slug)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(), type || 'sale', parseFloat(price) || 0,
    levy || null, parseInt(bedrooms) || 0, parseInt(bathrooms) || 0,
    location.trim(), description || null,
    status || 'available', parseInt(units_available) || 1,
    rental_option === 'on' ? 1 : 0, contact_phone || '0858196462',
    featured === 'on' ? 1 : 0, slug
  );

  const propId = result.lastInsertRowid;
  _saveImages(db, propId, req.files || []);

  req.session.flash = { type: 'success', msg: `"${title}" created successfully.` };
  res.redirect(`/admin/properties/${propId}/edit`);
});

/* EDIT FORM */
adminRouter.get('/:id/edit', (req, res) => {
  const db     = getDb();
  const prop   = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.redirect('/admin/properties');
  const images = db.prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order').all(prop.id);
  res.render('admin/property-form', {
    title: `Edit — ${prop.title}`, page: 'properties',
    user: req.session.user, csrfToken: req.session.csrfToken,
    property: prop, images,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

/* UPDATE */
adminRouter.post('/:id', validateCsrf, upload.array('images', 20), (req, res) => {
  const db   = getDb();
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.redirect('/admin/properties');

  let { title, type, price, levy, bedrooms, bathrooms, location,
        description, status, units_available, rental_option,
        contact_phone, featured, slug } = req.body;

  if (!slug || slugify(slug) === '') slug = slugify(title);
  else slug = slugify(slug);

  const conflict = db.prepare('SELECT id FROM properties WHERE slug = ? AND id != ?').get(slug, prop.id);
  if (conflict) slug = slug + '-' + Date.now();

  db.prepare(`
    UPDATE properties SET
      title = ?, type = ?, price = ?, levy = ?, bedrooms = ?, bathrooms = ?,
      location = ?, description = ?, status = ?, units_available = ?,
      rental_option = ?, contact_phone = ?, featured = ?, slug = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title.trim(), type || 'sale', parseFloat(price) || 0,
    levy || null, parseInt(bedrooms) || 0, parseInt(bathrooms) || 0,
    location.trim(), description || null,
    status || 'available', parseInt(units_available) || 1,
    rental_option === 'on' ? 1 : 0, contact_phone || '0858196462',
    featured === 'on' ? 1 : 0, slug, prop.id
  );

  if (req.files && req.files.length > 0) {
    _saveImages(db, prop.id, req.files);
  }

  req.session.flash = { type: 'success', msg: `"${title}" updated successfully.` };
  res.redirect(`/admin/properties/${prop.id}/edit`);
});

/* DELETE */
adminRouter.post('/:id/delete', validateCsrf, (req, res) => {
  const db   = getDb();
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (prop) {
    const imgs = db.prepare('SELECT filename FROM property_images WHERE property_id = ?').all(prop.id);
    imgs.forEach(img => {
      if (img.filename.startsWith('uploads/')) {
        const fpath = path.join(UPLOADS_DIR, path.basename(img.filename));
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
      }
    });
    db.prepare('DELETE FROM properties WHERE id = ?').run(prop.id);
  }
  req.session.flash = { type: 'success', msg: 'Property deleted.' };
  res.redirect('/admin/properties');
});

/* TOGGLE FEATURED */
adminRouter.post('/:id/toggle-featured', validateCsrf, (req, res) => {
  const db   = getDb();
  const prop = db.prepare('SELECT featured FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.json({ error: 'Not found' });
  const newVal = prop.featured ? 0 : 1;
  db.prepare('UPDATE properties SET featured = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ featured: newVal });
});

/* SET COVER IMAGE */
adminRouter.post('/:id/images/:imgId/cover', validateCsrf, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE property_images SET is_cover = 0 WHERE property_id = ?').run(req.params.id);
  db.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ? AND property_id = ?').run(req.params.imgId, req.params.id);
  res.json({ ok: true });
});

/* DELETE IMAGE */
adminRouter.post('/:id/images/:imgId/delete', validateCsrf, (req, res) => {
  const db  = getDb();
  const img = db.prepare('SELECT * FROM property_images WHERE id = ? AND property_id = ?').get(req.params.imgId, req.params.id);
  if (img) {
    if (img.filename.startsWith('uploads/')) {
      const fpath = path.join(UPLOADS_DIR, path.basename(img.filename));
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }
    db.prepare('DELETE FROM property_images WHERE id = ?').run(img.id);
    if (img.is_cover) {
      const next = db.prepare('SELECT id FROM property_images WHERE property_id = ? ORDER BY sort_order LIMIT 1').get(req.params.id);
      if (next) db.prepare('UPDATE property_images SET is_cover = 1 WHERE id = ?').run(next.id);
    }
  }
  res.json({ ok: true });
});

/* MOVE IMAGE */
adminRouter.post('/:id/images/:imgId/move', validateCsrf, (req, res) => {
  const db        = getDb();
  const { direction } = req.body;
  const imgs      = db.prepare('SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC').all(req.params.id);
  const idx       = imgs.findIndex(i => i.id == req.params.imgId);
  if (idx === -1) return res.json({ ok: false });
  const swapIdx   = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= imgs.length) return res.json({ ok: false });
  const a = imgs[idx], b = imgs[swapIdx];
  db.prepare('UPDATE property_images SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id);
  db.prepare('UPDATE property_images SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id);
  res.json({ ok: true });
});

/* ── INTERNAL HELPER ── */
function _saveImages(db, propId, files) {
  const existCount = db.prepare('SELECT COUNT(*) as c FROM property_images WHERE property_id = ?').get(propId).c;
  const insert = db.prepare('INSERT INTO property_images (property_id, filename, sort_order, is_cover) VALUES (?, ?, ?, ?)');
  files.forEach((file, i) => {
    if (!isValidImage(file.buffer)) return;
    const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const filename = 'uploads/' + uuid() + ext;
    fs.writeFileSync(path.join(UPLOADS_DIR, path.basename(filename)), file.buffer);
    insert.run(propId, filename, existCount + i, existCount === 0 && i === 0 ? 1 : 0);
  });
}

module.exports = { apiRouter, adminRouter };
