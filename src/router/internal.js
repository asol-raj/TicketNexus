const express = require("express");
const router = express.Router();
const internal = require("../controller/internalController");
const { requireJWT, requireInternalAdmin } = require("../middlewares/jwtAuth");

// Internal Admin dashboard & actions
router.get("/", requireJWT, requireInternalAdmin, internal.dashboard);
router.post("/managers", requireJWT, requireInternalAdmin, internal.createManager);
router.post("/employees", requireJWT, requireInternalAdmin, internal.createEmployee);

module.exports = router;
