const express = require('express');
const bcrypt  = require('bcryptjs');
const { getDb } = require('../db/database');
const { validateCsrf } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('admin/account', {
    title: 'My Account', page: 'account',
    user: req.session.user, csrfToken: req.session.csrfToken,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.post('/', validateCsrf, (req, res) => {
  const db = getDb();
  const { current_password, new_email, new_password, confirm_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  if (!bcrypt.compareSync(current_password || '', user.password_hash)) {
    req.session.flash = { type: 'error', msg: 'Current password is incorrect.' };
    return res.redirect('/admin/account');
  }

  let changed = false;

  if (new_email && new_email.trim() !== user.email) {
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(new_email.trim())) {
      req.session.flash = { type: 'error', msg: 'Invalid email address.' };
      return res.redirect('/admin/account');
    }
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(new_email.trim().toLowerCase(), user.id);
    if (conflict) {
      req.session.flash = { type: 'error', msg: 'That email is already in use.' };
      return res.redirect('/admin/account');
    }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(new_email.trim().toLowerCase(), user.id);
    req.session.user.email = new_email.trim().toLowerCase();
    changed = true;
  }

  if (new_password) {
    if (new_password.length < 8) {
      req.session.flash = { type: 'error', msg: 'New password must be at least 8 characters.' };
      return res.redirect('/admin/account');
    }
    if (new_password !== confirm_password) {
      req.session.flash = { type: 'error', msg: 'New passwords do not match.' };
      return res.redirect('/admin/account');
    }
    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    changed = true;
  }

  req.session.flash = changed
    ? { type: 'success', msg: 'Account updated successfully.' }
    : { type: 'success', msg: 'No changes were made.' };
  res.redirect('/admin/account');
});

module.exports = router;
