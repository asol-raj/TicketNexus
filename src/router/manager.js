const express = require("express");
const router = express.Router();
const ctrl = require("../controller/managerController");
const { requireJWT, requireManager, requireInternalManager } = require("../middlewares/jwtAuth");

// Page
router.get("/", requireJWT, requireInternalManager, ctrl.dashboard);

// Data
router.get("/data/team", requireJWT, requireInternalManager, ctrl.getTeam);
router.get("/data/tickets", requireJWT, requireInternalManager, ctrl.getTickets);

// Actions
router.put("/tickets/:id/assign", requireJWT, requireInternalManager, ctrl.assignTicket);
router.put("/employees/:employee_id/profile", requireJWT, requireInternalManager, ctrl.updateEmployeeProfile);
router.put("/employees/:employee_id/reset-password", requireJWT, requireInternalManager, ctrl.resetEmployeePassword);

module.exports = router;
