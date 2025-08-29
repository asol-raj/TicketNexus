const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_jwt_secret";

const cookieExtractor = (req) => {
  if (req && req.cookies && req.cookies.jwt) return req.cookies.jwt;
  return null;
};

const opts = {
  jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
  secretOrKey: JWT_SECRET,
};

passport.use(new JwtStrategy(opts, async (payload, done) => {
  try {
    return done(null, payload); // payload already has id, role, admin_type, client_id
  } catch (err) {
    return done(err, false);
  }
}));

function requireJWT(req, res, next) {
  return passport.authenticate("jwt", { session: false })(req, res, next);
}

function requireInternalAdmin(req, res, next) {
  const u = req.user;
  if (u && u.role === "admin" && u.admin_type === "internal") return next();
  return res.status(403).send("Forbidden");
}

function requireClientAdmin(req, res, next) {
  if (req.user?.role === "admin" && req.user?.admin_type === "client") return next();
  return res.status(403).send("Forbidden");
}

function requireClientManager(req, res, next) {
  if (req.user?.role === "manager" && req.user?.employment_type === "client") return next();
  return res.status(403).send("Forbidden");
}

function requireInternalManager(req, res, next) {
  if (req.user?.role === "manager" && req.user?.employment_type === "internal") return next();
  return res.status(403).send("Forbidden");
}

function requireClientEmployee(req, res, next) {
  if (req.user?.role === "employee" && req.user?.employment_type === "client") return next();
  return res.status(403).send("Forbidden");
}

function requireInternalEmployee(req, res, next) {
  if (req.user?.role === "employee" && req.user?.employment_type === "internal") return next();
  return res.status(403).send("Forbidden");
}


function requireManager(req, res, next) {
  const u = req.user;
  if (u && u.role === "manager") return next();
  return res.status(403).send("Forbidden");
}

// module.exports = { requireJWT, requireInternalAdmin, requireClientAdmin, passport, requireManager };

module.exports = {
  passport,
  requireJWT,
  requireManager,
  requireClientAdmin,
  requireInternalAdmin,
  requireClientManager,
  requireInternalManager,
  requireClientEmployee,
  requireInternalEmployee
};
