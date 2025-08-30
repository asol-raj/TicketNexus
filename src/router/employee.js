const express = require("express");
const router = express.Router();
const ctrl = require("../controller/employeeController");
const { requireJWT } = require("../middlewares/jwtAuth");

// Middleware for employees
function requireEmployee(req, res, next) {
  if (req.user && req.user.role === "employee" && req.user.employment_type === "internal") {
    return next();
  }
  return res.status(403).send("Forbidden");
}

// ===================== Dashboard =====================
router.get("/", requireJWT, requireEmployee, ctrl.dashboard);

// ===================== Ticket Page =====================
router.get("/tickets/:id", requireJWT, requireEmployee, ctrl.ticketPage);

// ===================== Comments =====================
router.get("/tickets/:id/comments", requireJWT, requireEmployee, ctrl.listTicketComments);
router.post("/tickets/:id/comments", requireJWT, requireEmployee, ctrl.createTicketComment);
router.put("/tickets/:id/comments/:commentId", requireJWT, requireEmployee, ctrl.updateTicketComment);

// ===================== Attachments =====================
router.post(
  "/tickets/:id/attachments",
  requireJWT,
  requireEmployee,
  ctrl.attachmentsMiddleware(),
  ctrl.addTicketAttachments
);

// ===================== Self-Assign Ticket =====================
router.post("/tickets/:id/self-assign", requireJWT, requireEmployee, ctrl.selfAssignTicket);
router.post("/tickets/:id/status", requireJWT, requireEmployee, ctrl.updateTicketStatus);


module.exports = router;
