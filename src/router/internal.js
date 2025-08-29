const express = require("express");
const router = express.Router();
const internal = require("../controller/internalController");
const { requireJWT, requireInternalAdmin } = require("../middlewares/jwtAuth");

// Presence heartbeat (optional table)
router.put("/presence/ping", requireJWT, requireInternalAdmin, internal.presencePing);

// Dashboard
router.get("/", requireJWT, requireInternalAdmin, internal.dashboard);

// Data for AJAX refresh
router.get("/data/summary", requireJWT, requireInternalAdmin, internal.getSummary);
router.get("/data/tickets", requireJWT, requireInternalAdmin, internal.getTickets);
router.get("/data/managers", requireJWT, requireInternalAdmin, require("../controller/internalController").listManagers);

// Assign / Reassign ticket
router.put("/tickets/:id/assign", requireJWT, requireInternalAdmin, internal.assignTicket);

// Existing endpoints for creating manager/employee remain:
router.post("/managers", requireJWT, requireInternalAdmin, require("../controller/internalController").createManager);
router.post("/employees", requireJWT, requireInternalAdmin, require("../controller/internalController").createEmployee);

module.exports = router;
