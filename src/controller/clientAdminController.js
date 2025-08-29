const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../db").promise();

// safe bcrypt import
const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();

// Uploads for ticket attachments
const uploadDir = path.join(process.cwd(), "uploads", "tickets");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || "file").replace(/[^\w.\-]+/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage });

function attachmentsMiddleware() {
  return upload.array("attachments", 10);
}

// ---------- Dashboard ----------
async function dashboard(req, res) {
  const u = req.user;
  const clientId = u.client_id;

  try {
    const [[{ total_tickets = 0 } = {}]] = await pool.query(
      "SELECT COUNT(*) AS total_tickets FROM tickets WHERE client_id=?",
      [clientId]
    );

    res.render("clientadmin/dashboard", {
      title: "Client Admin Dashboard",
      user: u,
      totals: { total_tickets },
    });
  } catch (err) {
    console.error("clientAdmin dashboard error:", err);
    res.status(500).send("Server error");
  }
}

// ---------- Data: internal assignees (employees.id) ----------
async function listAssignees(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  try {
    const [rows] = await pool.query(
      `SELECT e.id AS employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(ux.username,''), ux.email) AS label,
              ux.role, ux.admin_type
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE ux.client_id = ?
          AND e.employment_type='internal'
          AND (
               (ux.role='admin' AND ux.admin_type='internal')
            OR (ux.role='manager')
            OR (ux.role='employee')
          )
        ORDER BY label ASC`,
      [clientId]
    );
    res.json({ success: true, assignees: rows });
  } catch (err) {
    console.error("listAssignees error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Data: all tickets (live) ----------
async function listTickets(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.due_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id=?
        ORDER BY t.id DESC
        LIMIT 200`,
      [clientId]
    );
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error("listTickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Create manager (modal submit) ----------
async function createManager(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { username, email, password, first_name, last_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    const password_hash = bcrypt ? await bcrypt.hash(password, 10) : password;

    const [rUser] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'manager')",
      [clientId, username || null, email, password_hash]
    );
    const user_id = rUser.insertId;

    await pool.query(
      "INSERT INTO employees (user_id, first_name, last_name, position, employment_type) VALUES (?,?,?,?, 'client')",
      [user_id, first_name || null, last_name || null, "Manager"]
    );

    res.json({ success: true, user_id });
  } catch (err) {
    console.error("clientAdmin createManager error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Create ticket (modal submit) ----------
async function createTicket(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { subject, description, priority, due_at, assigned_to } = req.body || {};
  if (!subject) return res.status(400).json({ error: "Subject is required." });

  try {
    let assignedEmployeeId = assigned_to ? Number(assigned_to) : null;
    if (assignedEmployeeId) {
      const [[ok]] = await pool.query(
        `SELECT e.id
           FROM employees e
           JOIN users ux ON ux.id = e.user_id
          WHERE e.id=? AND ux.client_id=? 
            AND (
                 (ux.role='admin' AND ux.admin_type='internal')
              OR (ux.role='manager')
              OR (ux.role='employee')
            )
          LIMIT 1`,
        [assignedEmployeeId, clientId]
      );
      if (!ok) return res.status(400).json({ error: "Invalid assignee." });
    }

    const [rT] = await pool.query(
      `INSERT INTO tickets (client_id, raised_by, assigned_to, subject, description, priority, status, due_at)
       VALUES (?,?,?,?,?,?, 'open', ?)`,
      [clientId, u.id, assignedEmployeeId, subject, description || null, priority || 'medium', due_at || null]
    );
    const ticketId = rT.insertId;

    const files = req.files || [];
    for (const f of files) {
      const rel = path.join("uploads", "tickets", path.basename(f.path)).replace(/\\/g, "/");
      await pool.query(
        "INSERT INTO ticket_attachments (ticket_id, file_path, uploaded_by) VALUES (?, ?, ?)",
        [ticketId, rel, u.id]
      );
    }

    res.json({ success: true, ticket_id: ticketId });
  } catch (err) {
    console.error("createTicket error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Ticket detail page ----------
async function ticketPage(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);

  try {
    const [[t]] = await pool.query(
      `SELECT t.*, 
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label,
              COALESCE(CONCAT(re.first_name,' ',re.last_name),
                       NULLIF(ru.username,''), ru.email) AS raised_by_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
    LEFT JOIN users ru ON ru.id = t.raised_by
    LEFT JOIN employees re ON re.user_id = ru.id
        WHERE t.id=? AND t.client_id=?`,
      [ticketId, clientId]
    );
    if (!t) return res.status(404).send("Ticket not found");

    // attachments + quick is_image detection by extension
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
    const imageExt = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
    const attachments = (attachmentsRaw || []).map(a => {
      const ext = path.extname(a.file_path || "").toLowerCase();
      return { ...a, is_image: imageExt.has(ext) };
    });

    // comments (include author_id for ownership)
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

    res.render("clientadmin/ticket", {
      title: `Ticket #${t.id}`,
      user: u,
      ticket: t,
      attachments,
      comments,
    });
  } catch (err) {
    console.error("ticketPage error:", err);
    res.status(500).send("Server error");
  }
}

// ---------- Ticket comments ----------
async function listTicketComments(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);
  try {
    const [[tk]] = await pool.query(
      "SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1",
      [ticketId, clientId]
    );
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
  } catch (err) {
    console.error("listTicketComments error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function createTicketComment(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "Write something first." });

  try {
    const [[tk]] = await pool.query(
      "SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1",
      [ticketId, clientId]
    );
    if (!tk) return res.status(404).json({ success: false, error: "Not found" });

    const [r] = await pool.query(
      "INSERT INTO ticket_comments (ticket_id, user_id, comment, created_at) VALUES (?,?,?,NOW())",
      [ticketId, u.id, content.trim()]
    );

    // Return a fully-hydrated comment (matches what the page expects)
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
  } catch (err) {
    console.error("createTicketComment error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// Edit existing comment (author-only)
async function updateTicketComment(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ success:false, error:"Content required" });
  }
  try {
    // Ensure the ticket belongs to client and the comment belongs to ticket
    const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
    if (!tk) return res.status(404).json({ success:false, error:"Not found" });

    const [[row]] = await pool.query(
      "SELECT id, user_id FROM ticket_comments WHERE id=? AND ticket_id=? LIMIT 1",
      [commentId, ticketId]
    );
    if (!row) return res.status(404).json({ success:false, error:"Comment not found" });
    if (row.user_id !== u.id) return res.status(403).json({ success:false, error:"You can edit only your own comment" });

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
  } catch (e) {
    console.error("clientAdmin updateTicketComment error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

// ---------- (Optional) create employee kept for compatibility ----------
async function hashPassword(pw) { return bcrypt ? await bcrypt.hash(pw, 10) : pw; }
async function createEmployeeRow({ user_id, first_name = null, last_name = null, position = null, manager_employee_id = null }) {
  await pool.query(
    "INSERT INTO employees (user_id, first_name, last_name, position, manager_id) VALUES (?,?,?,?,?)",
    [user_id, first_name, last_name, position, manager_employee_id]
  );
}
async function createEmployee(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { username, email, password, first_name, last_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    const password_hash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'employee')",
      [clientId, username || null, email, password_hash]
    );
    const user_id = result.insertId;

    await createEmployeeRow({ user_id, first_name, last_name, position: "Employee" });

    res.json({ success: true, user_id });
  } catch (err) {
    console.error("clientAdmin createEmployee error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

// POST /client-admin/tickets/:id/attachments
async function addTicketAttachments(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const ticketId = Number(req.params.id);

  try {
    const [[tk]] = await pool.query(
      "SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1",
      [ticketId, clientId]
    );
    if (!tk) return res.status(404).json({ success: false, error: "Ticket not found" });

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: "No files uploaded" });

    const inserted = [];
    for (const f of files) {
      const rel = path.join("uploads", "tickets", path.basename(f.path)).replace(/\\/g, "/");
      const [r] = await pool.query(
        "INSERT INTO ticket_attachments (ticket_id, file_path, uploaded_by) VALUES (?,?,?)",
        [ticketId, rel, u.id]
      );
      inserted.push({ id: r.insertId, file_path: rel, uploaded_at: new Date(), uploaded_by: u.id });
    }

    res.json({ success: true, attachments: inserted });
  } catch (err) {
    console.error("addTicketAttachments error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Status update ----------
async function updateTicketStatus(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const id = Number(req.params.id);
  const map = { pending: "open", in_progress: "in_progress", resolved: "closed" };
  const dbStatus = map[(req.body?.status || "").toLowerCase()] || "open";

  try {
    const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [id, clientId]);
    if (!tk) return res.status(404).json({ success:false, error:"Not found" });

    await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [dbStatus, id]);
    res.json({ success:true, status: dbStatus });
  } catch (e) {
    console.error("clientAdmin updateTicketStatus error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

module.exports = {
  attachmentsMiddleware,
  dashboard,
  listAssignees,
  listTickets,
  createManager,
  createTicket,
  ticketPage,
  listTicketComments,
  createTicketComment,
  updateTicketComment,   // NEW
  createEmployee,        // kept for compatibility
  addTicketAttachments,
  updateTicketStatus     // NEW
};
