const express = require("express");
const router = express.Router();
module.exports = router;

// ========== Routes ==========
router.get("/", (req, res) => {
  res.render("index", { title: "TicketNexus" });
});

router.get("/login", (req, res) => {
  res.render("login", { title: "Login Page" });
});
