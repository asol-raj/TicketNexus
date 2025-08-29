const express = require("express");
const router = express.Router();
const ctrl = require("../controller/clientAdminController");
const { requireJWT, requireClientAdmin } = require("../middlewares/jwtAuth");

// Page
router.get("/", requireJWT, requireClientAdmin, ctrl.dashboard);
router.get("/tickets/:id", requireJWT, requireClientAdmin, ctrl.ticketPage);

// Data
router.get("/data/assignees", requireJWT, requireClientAdmin, ctrl.listAssignees);
router.get("/data/tickets", requireJWT, requireClientAdmin, ctrl.listTickets);
router.get("/tickets/:id/comments", requireJWT, requireClientAdmin, ctrl.listTicketComments);

// Actions
router.post("/managers", requireJWT, requireClientAdmin, ctrl.createManager);
router.post("/tickets", requireJWT, requireClientAdmin, ctrl.attachmentsMiddleware(), ctrl.createTicket);
router.post("/tickets/:id/comments", requireJWT, requireClientAdmin, ctrl.createTicketComment);
router.post(
  "/tickets/:id/attachments",
  requireJWT, requireClientAdmin,
  ctrl.attachmentsMiddleware(),
  ctrl.addTicketAttachments
);

module.exports = router;
