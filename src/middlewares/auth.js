function requireAuth(req, res, next) {
  if (req.session && req.session.auth) return next();
  return res.redirect("/login");
}

function requireRole(role) {
  return (req, res, next) => {
    const u = req.session && req.session.auth;
    if (u && u.role === role) return next();
    return res.redirect("/login");
  };
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.auth) {
    const role = req.session.auth.role;
    if (role === "super_admin") return res.redirect("/admin");
    return res.redirect("/client");
  }
  return next();
}

module.exports = { requireAuth, requireRole, redirectIfAuthenticated };
