const express = require("express");
const router = express.Router();
const admin = require("../controller/adminController");
const { requireRole } = require("../middlewares/auth");

// Super admin-only dashboard
router.get("/", requireRole("super_admin"), admin.dashboard);

// Clients
router.get("/clients", requireRole("super_admin"), admin.listClients);   // JSON list for selects
router.get("/admins", requireRole("super_admin"), admin.listAdmins);
router.post("/clients", requireRole("super_admin"), admin.createClient);

// Admin creation (both require clientId in body)
router.post("/internal-admins", requireRole("super_admin"), admin.createInternalAdmin);
router.post("/client-admins", requireRole("super_admin"), admin.createClientAdmin);

router.get("/logout", (req, res) => {
  req.session.destroy(() => { res.clearCookie("connect.sid"); res.redirect("/login"); });
});


module.exports = router;
