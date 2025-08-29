const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const pool = require("../../db").promise();
const { passport } = require("../middlewares/jwtAuth");

// authenticate JWT if present; we’ll enforce below
router.use(passport.authenticate("jwt", { session: false, failWithError: false }), (err, _req, res, _next) => {
  if (err) return res.status(401).send("Unauthorized");
});

function requireSameClientUser(req, res, next) {
  if (!req.user) return res.status(403).send("Forbidden");
  if (req.user.client_id) return next(); // client users
  if (req.user.role === "admin" && req.user.admin_type === "internal") return next(); // internal admin
  return res.status(403).send("Forbidden");
}

// GET /attachments/:id  (already added earlier)
router.get("/:id", requireSameClientUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).send("Invalid id");
  try {
    const [[row]] = await pool.query(
      `SELECT ta.file_path, t.client_id
         FROM ticket_attachments ta
         JOIN tickets t ON t.id = ta.ticket_id
        WHERE ta.id=?`,
      [id]
    );
    if (!row) return res.status(404).send("Not found");
    if (row.client_id !== req.user.client_id) return res.status(403).send("Forbidden");

    const abs = path.join(process.cwd(), row.file_path);
    if (!fs.existsSync(abs)) return res.status(404).send("File missing");

    const ext = path.extname(abs).toLowerCase();
    const typeMap = { ".pdf":"application/pdf", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp", ".svg":"image/svg+xml" };
    res.setHeader("Content-Type", typeMap[ext] || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(abs);
  } catch (e) {
    console.error("attachments GET error:", e);
    res.status(500).send("Server error");
  }
});

// DELETE /attachments/:id  (only the uploader can delete; same client required)
router.delete("/:id", requireSameClientUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success:false, error:"Invalid id" });
  try {
    const [[row]] = await pool.query(
      `SELECT ta.file_path, ta.uploaded_by, t.client_id
         FROM ticket_attachments ta
         JOIN tickets t ON t.id = ta.ticket_id
        WHERE ta.id=?`,
      [id]
    );
    if (!row) return res.status(404).json({ success:false, error:"Not found" });
    if (row.client_id !== req.user.client_id) return res.status(403).json({ success:false, error:"Forbidden" });
    if (row.uploaded_by !== req.user.id) return res.status(403).json({ success:false, error:"Only uploader can delete" });

    const abs = path.join(process.cwd(), row.file_path);
    // delete DB first to avoid race; ignore missing file later
    await pool.query("DELETE FROM ticket_attachments WHERE id=?", [id]);

    fs.promises.unlink(abs).catch(() => {}); // swallow if file already gone
    return res.json({ success:true });
  } catch (e) {
    console.error("attachments DELETE error:", e);
    return res.status(500).json({ success:false, error:"Server error" });
  }
});

module.exports = router;
