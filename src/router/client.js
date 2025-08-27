const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/auth");
const client = require("../controller/clientController");

// Any authenticated non-super_admin (and even super_admin if you want to allow) can land here.
// You can refine with roles later.
router.get("/", requireAuth, client.dashboard);

module.exports = router;
