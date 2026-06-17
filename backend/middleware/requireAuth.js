function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/admin/login');
}

function validateCsrf(req, res, next) {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('admin/error', {
      title:      'Forbidden',
      message:    'CSRF token invalid or missing. Please go back and try again.',
      csrfToken:  req.session.csrfToken || '',
      user:       req.session.user || { name: '' },
      page:       '',
    });
  }
  next();
}

module.exports = { requireAuth, validateCsrf };
