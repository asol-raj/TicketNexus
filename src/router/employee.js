const express = require("express");
const router = express.Router();
const ctrl = require("../controller/employeeController");
const { requireJWT } = require("../middlewares/jwtAuth");

function requireEmployee(req, res, next) {
  if (req.user && req.user.role === "employee") return next();
  return res.status(403).send("Forbidden");
}

router.get("/", requireJWT, requireEmployee, ctrl.dashboard);

module.exports = router;
