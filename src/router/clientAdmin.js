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
router.get("/data/tickets/:status", requireJWT, requireClientAdmin, ctrl.listTicketsWithStatus);
router.get("/tickets/:id/comments", requireJWT, requireClientAdmin, ctrl.listTicketComments);

// Actions
router.post("/managers/create", requireJWT, requireClientAdmin, ctrl.createManager);
router.post("/employees/create", requireJWT, requireClientAdmin, ctrl.createClientEmployee);
router.post("/users/create" , requireJWT, requireClientAdmin, ctrl.createUserWithEmployee);

router.post("/employees/update", requireJWT, requireClientAdmin, ctrl.updateEmployee);
router.post("/employees/:userId/reset-password", requireJWT, requireClientAdmin, ctrl.resetEmployeePassword);
router.post("/tickets", requireJWT, requireClientAdmin, ctrl.attachmentsMiddleware(), ctrl.createTicket);
router.post("/tickets/:id/comments", requireJWT, requireClientAdmin, ctrl.createTicketComment);
router.put("/tickets/:id/comments/:commentId", requireJWT, requireClientAdmin, ctrl.updateTicketComment); // NEW
router.post("/tickets/:id/attachments",
  requireJWT, requireClientAdmin,
  ctrl.attachmentsMiddleware(),
  ctrl.addTicketAttachments
);
router.put("/tickets/:id/status", requireJWT, requireClientAdmin, ctrl.updateTicketStatus); // NEW
router.post("/tickets/:id/edit", requireJWT, requireClientAdmin, ctrl.editTicket);
router.post("/tickets/:id/discard", requireJWT, requireClientAdmin, ctrl.discardTicket);





module.exports = router;
