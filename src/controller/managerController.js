const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
const pool = require("../../db").promise();

// ===================== Helpers =====================
function presenceWindowMinutes() { return 10; }
async function hashPassword(pw) { return bcrypt ? await bcrypt.hash(pw, 10) : pw; }

async function getManagerEmployeeId(userId) {
  const [[row]] = await pool.query("SELECT id FROM employees WHERE user_id=? LIMIT 1", [userId]);
  return row ? row.id : null;
}

// ===================== Upload middleware =====================
const uploadDir = path.join(process.cwd(), "uploads", "tickets");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || "file").replace(/[^\w.\-]+/g, "_");
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage });
function attachmentsMiddleware() { return upload.array("attachments", 10); }

// ===================== Dashboard =====================
async function dashboard(req, res) {
  const u = req.user;
  const clientId = u.client_id;

  try {
    const managerEmpId = await getManagerEmployeeId(u.id);

    const [team] = await pool.query(
      `SELECT e.id AS employee_id,
              u.id AS user_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS name,
              e.first_name, e.last_name,
              e.position, e.date_of_joining,
              u.email,
              p.last_seen,
              CASE WHEN p.last_seen >= (CURRENT_TIMESTAMP - INTERVAL ? MINUTE)
                   THEN 1 ELSE 0 END AS online,
              (SELECT COUNT(*) FROM tickets t
                WHERE t.assigned_to = e.id AND t.status IN ('open','in_progress')
                  AND t.client_id = ?) AS open_assigned
         FROM employees e
         JOIN users u ON u.id = e.user_id
    LEFT JOIN user_presence p ON p.user_id = u.id
        WHERE u.client_id = ? AND u.role='employee' AND e.manager_id = ?
        ORDER BY name ASC`,
      [presenceWindowMinutes(), clientId, clientId, managerEmpId]
    );

    const [tickets] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id = ?
        ORDER BY t.id DESC
        LIMIT 50`,
      [clientId]
    );

    const [teamSelect] = await pool.query(
      `SELECT e.id AS employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS label
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id=? AND u.role='employee' AND e.manager_id=?
        ORDER BY label ASC`,
      [clientId, managerEmpId]
    );

    const [[statsRow]] = await pool.query(
      `SELECT
         SUM(CASE WHEN status='open' THEN 1 ELSE 0 END)        AS open,
         SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END)    AS resolved,
         SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END)      AS closed,
         SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END)      AS high,
         SUM(CASE WHEN priority='medium' THEN 1 ELSE 0 END)    AS medium,
         SUM(CASE WHEN priority='low' THEN 1 ELSE 0 END)       AS low,
         SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END)    AS urgent
       FROM tickets
       WHERE client_id=?`,
      [clientId]
    );
    const stats = statsRow || {};

    res.render("manager/dashboard", {
      title: "Manager Dashboard",
      user: u,
      team,
      tickets,
      teamSelect,
      stats
    });
  } catch (err) {
    console.error("manager dashboard error:", err);
    res.status(500).send("Server error");
  }
}

// ===================== API: Team =====================
async function getTeam(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  try {
    const managerEmpId = await getManagerEmployeeId(u.id);
    const [rows] = await pool.query(
      `SELECT e.id AS employee_id,
              u.id AS user_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS name,
              e.first_name, e.last_name,
              e.position, e.date_of_joining,
              u.email,
              p.last_seen,
              CASE WHEN p.last_seen >= (CURRENT_TIMESTAMP - INTERVAL ? MINUTE)
                   THEN 1 ELSE 0 END AS online,
              (SELECT COUNT(*) FROM tickets t
                WHERE t.assigned_to = e.id AND t.status IN ('open','in_progress')
                  AND t.client_id = ?) AS open_assigned
         FROM employees e
         JOIN users u ON u.id = e.user_id
    LEFT JOIN user_presence p ON p.user_id = u.id
        WHERE u.client_id=? AND u.role='employee' AND e.manager_id=?
        ORDER BY name ASC`,
      [presenceWindowMinutes(), clientId, clientId, managerEmpId]
    );
    res.json({ success: true, team: rows });
  } catch (err) {
    console.error("getTeam error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ===================== API: Tickets =====================
async function getTickets(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              t.assigned_to,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u2.username,''), u2.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees e ON e.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = e.user_id
        WHERE t.client_id = ?
        ORDER BY t.id DESC
        LIMIT 100`,
      [clientId]
    );
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error("getTickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ===================== API: Assign ticket =====================
async function assignTicket(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { ticketId, employeeId } = req.body || {};
  if (!ticketId || !employeeId) return res.status(400).json({ success: false, error: "Missing params" });

  try {
    const [r] = await pool.query(
      "UPDATE tickets SET assigned_to=? WHERE id=? AND client_id=?",
      [employeeId, ticketId, clientId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("assignTicket error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ===================== API: Update employee profile =====================
async function updateEmployeeProfile(req, res) {
  const { employee_id, first_name, last_name, position, date_of_joining } = req.body || {};
  if (!employee_id) return res.status(400).json({ success: false, error: "Missing employee_id" });
  try {
    await pool.query(
      "UPDATE employees SET first_name=?, last_name=?, position=?, date_of_joining=? WHERE id=?",
      [first_name || null, last_name || null, position || null, date_of_joining || null, employee_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("updateEmployeeProfile error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ===================== API: Reset password =====================
async function resetEmployeePassword(req, res) {
  const { employee_id, new_password } = req.body || {};
  if (!employee_id || !new_password) return res.status(400).json({ success: false, error: "Missing params" });
  try {
    const [[row]] = await pool.query("SELECT user_id FROM employees WHERE id=? LIMIT 1", [employee_id]);
    if (!row) return res.status(404).json({ success: false, error: "Employee not found" });

    const hash = await hashPassword(new_password);
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [hash, row.user_id]);
    res.json({ success: true });
  } catch (err) {
    console.error("resetEmployeePassword error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ===================== Ticket Page =====================
async function ticketPage(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);

  try {
    const [[t]] = await pool.query(
      `SELECT t.*,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name), NULLIF(au.username,''), au.email) AS assignee_label,
              COALESCE(CONCAT(re.first_name,' ',re.last_name), NULLIF(ru.username,''), ru.email) AS raised_by_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
    LEFT JOIN users ru ON ru.id = t.raised_by
    LEFT JOIN employees re ON re.user_id = ru.id
        WHERE t.id=? AND t.client_id=?`,
      [ticketId, clientId]
    );
    if (!t) return res.status(404).send("Ticket not found");

    const [attachmentsRaw] = await pool.query(
      `SELECT ta.id, ta.file_path, ta.uploaded_at, ta.uploaded_by,
              COALESCE(CONCAT(ue.first_name,' ',ue.last_name),
                       NULLIF(uu.username,''), uu.email) AS uploader_label
         FROM ticket_attachments ta
    LEFT JOIN users uu ON uu.id = ta.uploaded_by
    LEFT JOIN employees ue ON ue.user_id = uu.id
        WHERE ta.ticket_id=?
        ORDER BY ta.id DESC`,
      [ticketId]
    );
    const imageExt = new Set([".jpg",".jpeg",".png",".gif",".webp",".svg"]);
    const attachments = (attachmentsRaw || []).map(a => ({
      ...a,
      is_image: imageExt.has(path.extname(a.file_path || "").toLowerCase())
    }));

    const [comments] = await pool.query(
      `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
         FROM ticket_comments c
         JOIN users u ON u.id = c.user_id
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE c.ticket_id=?
        ORDER BY c.id DESC`,
      [ticketId]
    );

    res.render("manager/ticket", {
      title: `Ticket #${t.id}`,
      user: u,
      ticket: t,
      attachments,
      comments
    });
  } catch (err) {
    console.error("ticketPage error:", err);
    res.status(500).send("Server error");
  }
}

// ===================== Ticket Comments =====================
async function listTicketComments(req, res) {
  const clientId = req.user.client_id;
  const ticketId = Number(req.params.id);
  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
  if (!tk) return res.status(404).json({ success: false, error: "Not found" });

  const [comments] = await pool.query(
    `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
            COALESCE(CONCAT(e.first_name,' ',e.last_name),
                     NULLIF(u.username,''), u.email) AS author_label
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
  LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.ticket_id=?
      ORDER BY c.id DESC`,
    [ticketId]
  );
  res.json({ success: true, comments });
}

async function createTicketComment(req, res) {
  const clientId = req.user.client_id;
  const ticketId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "Write something first." });
  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
  if (!tk) return res.status(404).json({ success: false, error: "Not found" });
  const [r] = await pool.query(
    "INSERT INTO ticket_comments (ticket_id, user_id, comment, created_at) VALUES (?,?,?,NOW())",
    [ticketId, req.user.id, content.trim()]
  );
  const [[comment]] = await pool.query(
    `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
            COALESCE(CONCAT(e.first_name,' ',e.last_name),
                     NULLIF(u.username,''), u.email) AS author_label
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
  LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.id=?`,
    [r.insertId]
  );
  res.json({ success: true, comment });
}

async function updateTicketComment(req, res) {
  const clientId = req.user.client_id;
  const ticketId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ success:false, error:"Content required" });

  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
  if (!tk) return res.status(404).json({ success:false, error:"Not found" });

  const [[row]] = await pool.query(
    "SELECT id, user_id FROM ticket_comments WHERE id=? AND ticket_id=? LIMIT 1",
    [commentId, ticketId]
  );
  if (!row) return res.status(404).json({ success:false, error:"Comment not found" });
  if (row.user_id !== req.user.id) return res.status(403).json({ success:false, error:"You can edit only your own comment" });

  await pool.query("UPDATE ticket_comments SET comment=?, updated_at=NOW() WHERE id=?", [content.trim(), commentId]);
  const [[comment]] = await pool.query(
    `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
            COALESCE(CONCAT(e.first_name,' ',e.last_name),
                     NULLIF(u.username,''), u.email) AS author_label
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
  LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.id=?`,
    [commentId]
  );
  res.json({ success:true, comment });
}

// ===================== Ticket Attachments =====================
async function addTicketAttachments(req, res) {
  const clientId = req.user.client_id;
  const ticketId = Number(req.params.id);
  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
  if (!tk) return res.status(404).json({ success:false, error: "Ticket not found" });

  const files = (req.files || []);
  if (!files.length) return res.status(400).json({ success:false, error: "No files uploaded" });

  const inserted = [];
  for (const f of files) {
    const rel = path.join("uploads", "tickets", path.basename(f.path)).replace(/\\/g, "/");
    const [r] = await pool.query(
      "INSERT INTO ticket_attachments (ticket_id, file_path, uploaded_by) VALUES (?,?,?)",
      [ticketId, rel, req.user.id]
    );
    inserted.push({ id: r.insertId, file_path: rel, uploaded_at: new Date(), uploaded_by: req.user.id });
  }
  res.json({ success:true, attachments: inserted });
}

// ===================== Ticket Status =====================
async function updateTicketStatus(req, res) {
  const clientId = req.user.client_id;
  const id = Number(req.params.id);
  const map = { pending: "open", in_progress: "in_progress", resolved: "closed" };
  const dbStatus = map[(req.body?.status || "").toLowerCase()] || "open";

  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [id, clientId]);
  if (!tk) return res.status(404).json({ success:false, error:"Not found" });

  await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [dbStatus, id]);
  res.json({ success:true, status: dbStatus });
}

// ===================== Exports =====================
module.exports = {
  attachmentsMiddleware,
  dashboard,
  getTeam,
  getTickets,
  assignTicket,
  updateEmployeeProfile,
  resetEmployeePassword,
  ticketPage,
  listTicketComments,
  createTicketComment,
  updateTicketComment,
  addTicketAttachments,
  updateTicketStatus
};
