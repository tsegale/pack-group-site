const express = require('express');
const bcrypt  = require('bcryptjs');
const { getDb } = require('../db/database');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin/dashboard');
  res.render('admin/login', {
    title:     'Admin Login',
    error:     null,
    csrfToken: req.session.csrfToken,
  });
});

router.post('/login', (req, res) => {
  const { email, password, _csrf } = req.body;

  if (!_csrf || _csrf !== req.session.csrfToken) {
    return res.render('admin/login', {
      title:     'Admin Login',
      error:     'Security token invalid. Please try again.',
      csrfToken: req.session.csrfToken,
    });
  }

  if (!email || !password) {
    return res.render('admin/login', {
      title:     'Admin Login',
      error:     'Email and password are required.',
      csrfToken: req.session.csrfToken,
    });
  }

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin/login', {
      title:     'Admin Login',
      error:     'Invalid email or password.',
      csrfToken: req.session.csrfToken,
    });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  req.session.userId = user.id;
  req.session.user   = { id: user.id, name: user.name, email: user.email };

  const returnTo = req.session.returnTo || '/admin/dashboard';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
