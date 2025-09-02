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

// Ticket detail page
router.get("/tickets/:id", requireJWT, requireInternalAdmin, internal.ticketPage);

// Ticket data
router.get("/tickets/:id/comments", requireJWT, requireInternalAdmin, internal.listTicketComments);

// Actions
router.post("/tickets/:id/comments", requireJWT, requireInternalAdmin, internal.createTicketComment);
router.post(
    "/tickets/:id/attachments",
    requireJWT,
    requireInternalAdmin,
    internal.attachmentsMiddleware(),
    internal.addTicketAttachments
);
router.put("/tickets/:id/status", requireJWT, requireInternalAdmin, internal.updateTicketStatus);


// Edit an existing comment (author-only)
router.put("/tickets/:id/comments/:commentId", requireJWT, requireInternalAdmin, internal.updateTicketComment);
// Employee directory
router.get("/data/employees", requireJWT, requireInternalAdmin, internal.listEmployees);
router.get("/data/employees/:id", requireJWT, requireInternalAdmin, internal.getEmployee);
router.put("/employees/:id", requireJWT, requireInternalAdmin, internal.updateEmployee);
// router.post("/tickets/:id/archive", requireJWT, requireInternalAdmin, internal.archiveTicket);



module.exports = router;
