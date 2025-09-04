const express = require("express");
const router = express.Router();
const { redirectIfAuthenticated } = require("../middlewares/auth");
module.exports = router;

// ========== Routes ==========
router.get("/", (req, res) => {
  res.render("index", { title: "TicketNexus", hideNavbar: true });
});

router.get("/login", (req, res) => {
  res.render("login", { title: "Login Page", hideNavbar: true });
});
