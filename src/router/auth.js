const express = require("express");
const router = express.Router();
const auth = require("../controller/authController");
const { redirectIfAuthenticated } = require("../middlewares/auth");

// Everyone logs in here
router.post("/login", auth.login);

// Logout
router.get("/logout", auth.logout);

// Optional: serve the common login page guarded
router.get("/login", redirectIfAuthenticated, (req, res) =>
  res.render("login", { title: "Login" })
);

module.exports = router;
