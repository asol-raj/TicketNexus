const express = require("express");
const router = express.Router();

const managerCtrl = require("../controller/managerController");

// Middlewares – adjust to your auth setup
const { requireJWT, requireManager } = require("../middlewares/jwtAuth");

// ===================== Dashboard =====================
router.get("/", requireJWT, requireManager, managerCtrl.dashboard);

// ===================== Team APIs =====================
router.get("/team", requireJWT, requireManager, managerCtrl.getTeam);
router.post("/update-employee", requireJWT, requireManager, managerCtrl.updateEmployeeProfile);
router.post("/reset-password", requireJWT, requireManager, managerCtrl.resetEmployeePassword);

// ===================== Ticket APIs (list/assign) =====================
router.get("/tickets", requireJWT, requireManager, managerCtrl.getTickets);
router.post("/assign-ticket", requireJWT, requireManager, managerCtrl.assignTicket);

// ===================== Ticket Page =====================
router.get("/tickets/:id", requireJWT, requireManager, managerCtrl.ticketPage);
router.get("/tickets/:id/comments", requireJWT, requireManager, managerCtrl.listTicketComments);
router.post("/tickets/:id/comments", requireJWT, requireManager, managerCtrl.createTicketComment);
router.put("/tickets/:id/comments/:commentId", requireJWT, requireManager, managerCtrl.updateTicketComment);
router.post(
  "/tickets/:id/attachments",
  requireJWT,
  requireManager,
  managerCtrl.attachmentsMiddleware(),
  managerCtrl.addTicketAttachments
);
router.put("/tickets/:id/status", requireJWT, requireManager, managerCtrl.updateTicketStatus);

module.exports = router;
