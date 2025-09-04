const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("../../db");
const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();

// uploads (reused for tickets)
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
function attachmentsMiddleware() { return upload.array("attachments", 10); }

// helper: find this manager's employees.id
async function getManagerEmployeeId(userId) {
  const [[row]] = await pool.query("SELECT id FROM employees WHERE user_id=? LIMIT 1", [userId]);
  return row ? row.id : null;
}

// ---------- Page ----------
async function dashboard(req, res) {
  const clientId = req.user.client_id;
  const [[{ total_tickets = 0 } = {}]] = await pool.query(
    "SELECT COUNT(*) AS total_tickets FROM tickets WHERE client_id=?",
    [clientId]
  );
  res.render("clientmanager/dashboard", {
    title: "Client Manager Dashboard",
    user: req.user,
    totals: { total_tickets },
  });
}

// ---------- Data: internal assignees (employees.id) ----------
async function listAssignees(req, res) {
  const clientId = req.user.client_id;
  try {
    const [rows] = await pool.query(
      `SELECT e.id AS employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS label,
              u.role, u.admin_type
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id = ?
          AND (
               (u.role='admin' AND u.admin_type='internal')
            OR (u.role='manager')
            OR (u.role='employee')
          )
          AND u.id <> ?   -- exclude current logged-in user
        ORDER BY label ASC`,
      [clientId, req.user.id]
    );
    res.json({ success: true, assignees: rows });
  } catch (e) {
    console.error("listAssignees error:", e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}


// ---------- Data: tickets (live) ----------
async function listTickets(req, res) {
  const clientId = req.user.client_id;
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.due_at,
              t.assigned_to,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees e ON e.id = t.assigned_to
    LEFT JOIN users u ON u.id = e.user_id
        WHERE t.client_id=?
        ORDER BY t.id DESC
        LIMIT 200`,
      [clientId]
    );
    res.json({ success: true, tickets: rows });
  } catch (e) {
    console.error("listTickets error:", e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Data: your team (client employees under this manager) ----------
async function listClientEmployees(req, res) {
  const clientId = req.user.client_id;
  try {
    const mgrEmpId = await getManagerEmployeeId(req.user.id);
    if (!mgrEmpId) return res.json({ success: true, employees: [] });

    const [rows] = await pool.query(
      `SELECT e.id AS employee_id, e.first_name, e.last_name, e.position,
              e.date_of_joining, u.id AS user_id, u.email, u.username
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id=? AND e.employment_type='client' AND e.manager_id=?
        ORDER BY COALESCE(e.first_name,''), COALESCE(e.last_name,''), u.email ASC`,
      [clientId, mgrEmpId]
    );
    res.json({ success: true, employees: rows });
  } catch (e) {
    console.error("listClientEmployees error:", e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Action: create client employee (users + employees) ----------
async function createClientEmployee(req, res) {
  const clientId = req.user.client_id;
  const { username, email, password, first_name, last_name, date_of_joining } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });
  try {
    const mgrEmpId = await getManagerEmployeeId(req.user.id);
    if (!mgrEmpId) return res.status(400).json({ error: "Manager profile missing." });

    const pw_hash = bcrypt ? await bcrypt.hash(password, 10) : password;
    const [rUser] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'employee')",
      [clientId, username || null, email, pw_hash]
    );
    const user_id = rUser.insertId;

    await pool.query(
      "INSERT INTO employees (user_id, first_name, last_name, manager_id, date_of_joining, position, employment_type) VALUES (?,?,?,?,?, 'Employee', 'client')",
      [user_id, first_name || null, last_name || null, mgrEmpId, date_of_joining || null]
    );

    res.json({ success: true, user_id });
  } catch (e) {
    console.error("createClientEmployee error:", e);
    if (e && e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Action: reset password for your team member ----------
async function resetEmployeePassword(req, res) {
  const clientId = req.user.client_id;
  const targetUserId = Number(req.params.userId);
  const { new_password } = req.body || {};
  if (!targetUserId || !new_password) return res.status(400).json({ error: "Invalid request" });

  try {
    const mgrEmpId = await getManagerEmployeeId(req.user.id);
    if (!mgrEmpId) return res.status(400).json({ error: "Manager profile missing." });

    // verify ownership: same client, employment_type='client', managed by this manager
    const [[ok]] = await pool.query(
      `SELECT u.id
         FROM users u
         JOIN employees e ON e.user_id = u.id
        WHERE u.id=? AND u.client_id=? AND e.employment_type='client' AND e.manager_id=?`,
      [targetUserId, clientId, mgrEmpId]
    );
    if (!ok) return res.status(403).json({ error: "Forbidden" });

    const pw_hash = bcrypt ? await bcrypt.hash(new_password, 10) : new_password;
    await pool.query("UPDATE users SET password_hash=? WHERE id=?", [pw_hash, targetUserId]);
    res.json({ success: true });
  } catch (e) {
    console.error("resetEmployeePassword error:", e);
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Ticket creation (kept) ----------
function attachmentsMiddlewareExports() { return attachmentsMiddleware(); }

async function createTicket(req, res) {
  try {
    const u = req.user;
    const clientId = u.client_id;

    const { subject, description, priority, due_option, due_at, assigned_to } = req.body || {};

    if (!subject) return res.status(400).json({ success: false, error: "Subject required" });

    // Calculate dueAt based on due_option
    let dueAt = null;
    switch (due_option) {
      case "today": {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        dueAt = d;
        break;
      }
      case "tomorrow": {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(23, 59, 59, 999);
        dueAt = d;
        break;
      }
      case "this_week": {
        const d = new Date();
        const day = d.getDay(); // 0=Sun
        const diff = 7 - day;   // end of this week (Saturday)
        d.setDate(d.getDate() + diff);
        d.setHours(23, 59, 59, 999);
        dueAt = d;
        break;
      }
      case "next_week": {
        const d = new Date();
        const day = d.getDay();
        const diff = 7 - day + 6; // end of next week (Saturday)
        d.setDate(d.getDate() + diff);
        d.setHours(23, 59, 59, 999);
        dueAt = d;
        break;
      }
      case "custom":
        dueAt = due_at ? new Date(due_at) : null;
        break;
      default:
        dueAt = null;
    }

    const assignedEmployeeId = assigned_to && assigned_to !== "" ? Number(assigned_to) : null;

    // Validate assignee if provided
    if (assignedEmployeeId) {
      const [[ok]] = await pool.query(
        `SELECT e.id 
           FROM employees e 
           JOIN users ux ON ux.id = e.user_id
          WHERE e.id = ?
            AND (
                 (ux.client_id = ? AND ux.admin_type = 'client')  -- same client employees
              OR (ux.admin_type = 'internal')                     -- internal staff
            )
          LIMIT 1`,
        [assignedEmployeeId, clientId]
      );
      if (!ok) {
        return res.status(400).json({ success: false, error: "Invalid assignee." });
      }
    }

    // Insert ticket
    const [rT] = await pool.query(
      `INSERT INTO tickets 
        (client_id, raised_by, assigned_to, subject, description, priority, status, due_option, due_at)
       VALUES (?,?,?,?,?,?, 'open', ?, ?)`,
      [
        clientId,
        u.id,
        assignedEmployeeId,
        subject,
        description || null,
        priority || "medium",
        due_option || "custom",
        dueAt,
      ]
    );

    const ticketId = rT.insertId;

    // Save attachments if provided
    const files = req.files || [];
    for (const f of files) {
      const filePath = path.join("uploads", "attachments", f.filename);
      await pool.query(
        "INSERT INTO ticket_attachments(ticket_id,uploaded_by,file_path,uploaded_at) VALUES (?,?,?,NOW())",
        [ticketId, u.id, filePath]
      );
    }

    res.json({ success: true, ticket_id: ticketId });
  } catch (err) {
    console.error("clientManager createTicket error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Ticket page (now renders clientmanager/ticket) ----------
async function ticketPage(req, res) {
  const clientId = req.user.client_id;
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
              COALESCE(CONCAT(ue.first_name,' ',ue.last_name), NULLIF(uu.username,''), uu.email) AS uploader_label
         FROM ticket_attachments ta
    LEFT JOIN users uu ON uu.id = ta.uploaded_by
    LEFT JOIN employees ue ON ue.user_id = uu.id
        WHERE ta.ticket_id=?
        ORDER BY ta.id DESC`,
      [ticketId]
    );
    const imageExt = new Set([".jpg",".jpeg",".png",".gif",".webp",".svg"]);
    const attachments = (attachmentsRaw || []).map(a => {
      const ext = path.extname(a.file_path || "").toLowerCase();
      return { ...a, is_image: imageExt.has(ext) };
    });

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

    res.render("clientmanager/ticket", {
      title: `Ticket #${t.id}`,
      user: req.user,
      ticket: t,
      attachments,
      comments,
    });
  } catch (e) {
    console.error("clientManager ticketPage error:", e);
    res.status(500).send("Server error");
  }
}

// ---------- Ticket comments ----------
async function listTicketComments(req, res) {
  const clientId = req.user.client_id;
  const ticketId = Number(req.params.id);
  const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
  if (!tk) return res.status(404).json({ success: false, error: "Not found" });
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

  // return fully-hydrated comment
  const [[comment]] = await pool.query(
    `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
            COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
  LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.id=?`,
    [r.insertId]
  );
  res.json({ success: true, comment });
}

// Edit existing comment (author-only)
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
            COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
       FROM ticket_comments c
       JOIN users u ON u.id = c.user_id
  LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.id=?`,
    [commentId]
  );
  res.json({ success:true, comment });
}

// ---------- Attachments ----------
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

// ---------- Status update ----------
async function updateTicketStatus(req, res) {
  const clientId = req.user.client_id;
  const id = Number(req.params.id);
  const map = { pending: "open", in_progress: "in_progress", resolved: "closed" };
  const dbStatus = map[(req.body?.status || "").toLowerCase()] || "open";

  const [[tk]] = await pool.query(
    "SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1",
    [id, clientId]
  );
  if (!tk) return res.status(404).json({ success: false, error: "Not found" });

  await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [dbStatus, id]);
  res.json({ success: true, status: dbStatus });
}

module.exports = {
  attachmentsMiddleware: attachmentsMiddlewareExports,
  dashboard,
  listAssignees,
  listTickets,
  listClientEmployees,
  createClientEmployee,
  resetEmployeePassword,
  createTicket,
  ticketPage,
  listTicketComments,
  createTicketComment,
  updateTicketComment,   // NEW
  addTicketAttachments,
  updateTicketStatus     // NEW
};
