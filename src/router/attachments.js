const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const pool = require("../../db").promise();

// Middleware to allow only same client OR internal roles
function requireSameClientUser(req, res, next) {
  if (!req.user) return res.status(403).send("Forbidden");

  // Any client user (admin, manager, employee under a client)
  if (req.user.client_id) return next();

  // Internal roles (admin, manager, employee)
  if (req.user.role === "admin" && req.user.admin_type === "internal") return next();
  if (req.user.role === "manager" && req.user.employment_type === "internal") return next();
  if (req.user.role === "employee" && req.user.employment_type === "internal") return next();

  return res.status(403).send("Forbidden");
}

// ===================== GET attachment (download/view) =====================
router.get("/:id", requireSameClientUser, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [[row]] = await pool.query(
      `SELECT ta.id, ta.file_path, t.client_id
         FROM ticket_attachments ta
         JOIN tickets t ON t.id = ta.ticket_id
        WHERE ta.id=? LIMIT 1`,
      [id]
    );
    if (!row) return res.status(404).send("Not found");

    // If user has client_id, must match ticket's client_id
    if (req.user.client_id && row.client_id !== req.user.client_id) {
      return res.status(403).send("Forbidden");
    }

    const absPath = path.join(process.cwd(), row.file_path);
    if (!fs.existsSync(absPath)) return res.status(404).send("File missing");
    res.sendFile(absPath);
  } catch (err) {
    console.error("attachment GET error:", err);
    res.status(500).send("Server error");
  }
});

// ===================== DELETE attachment =====================
router.delete("/:id", requireSameClientUser, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [[row]] = await pool.query(
      `SELECT ta.id, ta.file_path, ta.uploaded_by, t.client_id
         FROM ticket_attachments ta
         JOIN tickets t ON t.id = ta.ticket_id
        WHERE ta.id=? LIMIT 1`,
      [id]
    );
    if (!row) return res.status(404).json({ success: false, error: "Not found" });

    // Same client check
    if (req.user.client_id && row.client_id !== req.user.client_id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Only the uploader can delete
    if (row.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: "You can delete only your own attachments" });
    }

    // Delete DB row
    await pool.query("DELETE FROM ticket_attachments WHERE id=?", [id]);

    // Delete file
    const absPath = path.join(process.cwd(), row.file_path);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

    res.json({ success: true });
  } catch (err) {
    console.error("attachment DELETE error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
