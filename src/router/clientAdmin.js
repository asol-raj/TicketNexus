const express = require("express");
const router = express.Router();
const ctrl = require("../controller/clientAdminController");
const { requireJWT, requireClientAdmin } = require("../middlewares/jwtAuth");

router.get("/", requireJWT, requireClientAdmin, ctrl.dashboard);
router.post("/managers", requireJWT, requireClientAdmin, ctrl.createManager);
router.post("/employees", requireJWT, requireClientAdmin, ctrl.createEmployee);

module.exports = router;
