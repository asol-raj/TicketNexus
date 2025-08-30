const express = require("express");
const router = express.Router();
const ctrl = require("../controller/clientManagerController");
const { requireJWT, requireClientManager } = require("../middlewares/jwtAuth");

// Page
router.get("/", requireJWT, requireClientManager, ctrl.dashboard);
router.get("/tickets/:id", requireJWT, requireClientManager, ctrl.ticketPage);

// Data
router.get("/data/assignees", requireJWT, requireClientManager, ctrl.listAssignees);
router.get("/data/tickets", requireJWT, requireClientManager, ctrl.listTickets);
router.get("/data/team", requireJWT, requireClientManager, ctrl.listClientEmployees);
router.get("/tickets/:id/comments", requireJWT, requireClientManager, ctrl.listTicketComments);

// Actions
router.post("/employees", requireJWT, requireClientManager, ctrl.createClientEmployee);
router.post("/employees/:userId/reset-password", requireJWT, requireClientManager, ctrl.resetEmployeePassword);
router.post("/tickets", requireJWT, requireClientManager, ctrl.attachmentsMiddleware(), ctrl.createTicket);
router.post("/tickets/:id/comments", requireJWT, requireClientManager, ctrl.createTicketComment);
router.post("/tickets/:id/attachments",
    requireJWT, requireClientManager,
    ctrl.attachmentsMiddleware(),
    ctrl.addTicketAttachments);

// Ticket status update
router.put(
    "/tickets/:id/status",
    requireJWT,
    requireClientManager,
    ctrl.updateTicketStatus
);

module.exports = router;
