function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.superAdmin) return next();
  return res.redirect("/login");
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.superAdmin) return res.redirect("/admin");
  return next();
}

module.exports = { requireSuperAdmin, redirectIfAuthenticated };
