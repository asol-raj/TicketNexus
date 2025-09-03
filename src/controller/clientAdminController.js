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

function formatDue(ticket) {
  if (!ticket.due_option) {
    return ticket.due_at ? new Date(ticket.due_at).toLocaleString() : "No Due Date";
  }
  switch (ticket.due_option) {
    case "today":
      return `Today (${ticket.due_at ? new Date(ticket.due_at).toLocaleString() : ""})`;
    case "tomorrow":
      return `Tomorrow (${ticket.due_at ? new Date(ticket.due_at).toLocaleString() : ""})`;
    case "this_week":
      return `This Week (${ticket.due_at ? new Date(ticket.due_at).toLocaleString() : ""})`;
    case "next_week":
      return `Next Week (${ticket.due_at ? new Date(ticket.due_at).toLocaleString() : ""})`;
    case "custom":
      return ticket.due_at ? new Date(ticket.due_at).toLocaleString() : "Custom (no date)";
    default:
      return ticket.due_at ? new Date(ticket.due_at).toLocaleString() : "No Due Date";
  }
}


// ---------- Dashboard ----------
async function dashboard_(req, res) {
  try {
    const clientId = req.user.client_id;

    // Tickets list
    const [tickets] = await pool.query(
      `SELECT t.*, 
              COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees e ON e.id = t.assigned_to
    LEFT JOIN users u ON u.id = e.user_id
        WHERE t.client_id=? AND t.status != 'archived'
     ORDER BY t.created_at DESC LIMIT 100`,
      [clientId]
    );

    tickets.forEach((t) => {
      t.due_label = formatDue(t);
    });

    // Totals
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total_tickets,
              SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed
       FROM tickets WHERE client_id=?`,
      [clientId]
    );

    // Employees
    const [employees] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.position,
              u.role, u.username, u.email
        FROM employees e
        JOIN users u ON u.id = e.user_id
        WHERE e.employment_type = 'client'
        and e.user_id <> ?
        and u.client_id = ?
        ORDER BY e.id desc`, [req.user.id, clientId]
    );

    const [managers] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name 
       FROM employees e 
       WHERE e.employment_type = 'client'
        AND e.position = 'Manager' ;`
    )

    res.render("clientAdmin/dashboard", {
      user: req.user,
      tickets,
      employees,
      managers,
      totals, // ✅ pass totals
    });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).send("Server error");
  }
}

async function dashboard(req, res) {
  try {
    const clientId = req.user.client_id;

    // Tickets list (only open + in_progress for dashboard table)
    const [tickets] = await pool.query(
      `SELECT t.*, 
              COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees e ON e.id = t.assigned_to
    LEFT JOIN users u ON u.id = e.user_id
        WHERE t.client_id=? AND t.status != 'archived'          
     ORDER BY t.created_at DESC LIMIT 50`,
      [clientId]
    );

    // AND t.status IN ('open','in_progress')
    tickets.forEach((t) => {
      t.due_label = formatDue(t);
    });

    // Totals with new status categories
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total_tickets,
              SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
              SUM(CASE WHEN status='unassigned' THEN 1 ELSE 0 END) AS unassigned,
              SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
              SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed,
              SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) AS expired
       FROM tickets WHERE client_id=?`,
      [clientId]
    );

    // Employees
    const [employees] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.position,
              u.role, u.username, u.email
        FROM employees e
        JOIN users u ON u.id = e.user_id
        WHERE e.employment_type = 'client'
        and e.user_id <> ?
        and u.client_id = ?
        ORDER BY e.id desc`,
      [req.user.id, clientId]
    );

    const [managers] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name 
       FROM employees e 
       WHERE e.employment_type = 'client'
        AND e.position = 'Manager' ;`
    )

    res.render("clientadmin/dashboard", {
      user: req.user, tickets, totals, employees, managers
    });
  } catch (err) {
    console.error(err);
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
        WHERE t.client_id=? and t.status != 'discarded'
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

async function listTicketsWithStatus(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const status = req.query.status;
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.due_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id=? AND t.status =?
        ORDER BY t.id DESC
        LIMIT 200`,
      [clientId, status]
    );
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error("listTickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function getManagerEmployeeId(userId) {
  const [[row]] = await pool.query("SELECT id FROM employees WHERE user_id=? LIMIT 1", [userId]);
  return row ? row.id : null;
}

// ---------- Create manager (modal submit) ----------
async function createManager(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { username, email, password, first_name, last_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });
  const mgrEmpId = await getManagerEmployeeId(u.id);
  try {
    const password_hash = bcrypt ? await bcrypt.hash(password, 10) : password;

    const [rUser] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'manager')",
      [clientId, username || null, email, password_hash]
    );
    const user_id = rUser.insertId;

    await pool.query(
      "INSERT INTO employees (user_id, first_name, last_name, position, manager_id, employment_type) VALUES (?,?,?,?,?, 'client')",
      [user_id, first_name || null, last_name || null, "Manager", mgrEmpId]
    );

    res.json({ success: true, user_id });
  } catch (err) {
    console.error("clientAdmin createManager error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

// ---------- Action: create client employee (users + employees) ----------
async function createClientEmployee(req, res) {
  const clientId = req.user.client_id;
  const { username, email, password, first_name, last_name, date_of_joining } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });
  try {
    const pw_hash = bcrypt ? await bcrypt.hash(password, 10) : password;
    const [rUser] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'employee')",
      [clientId, username || null, email, pw_hash]
    );
    const user_id = rUser.insertId;

    await pool.query(
      "INSERT INTO employees (user_id, first_name, last_name, date_of_joining, position, employment_type) VALUES (?,?,?,?,'Employee','client')",
      [user_id, first_name || null, last_name || null, date_of_joining || null]
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

// ---------- Create ticket (modal submit) ----------
async function createTicket(req, res) { //console.log('create ticket'); return;
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
        // default to custom with null
        dueAt = null;
    }

    const assignedEmployeeId = assigned_to && assigned_to !== "" ? Number(assigned_to) : null;

    // Insert into tickets
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
    console.error("createTicket error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Ticket detail page ----------
async function ticketPage_(req, res) {
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

// Helper: format MySQL datetime -> HTML datetime-local
// function formatForDatetimeLocal(dt) {
//   if (!dt) return "";
//   const d = new Date(dt);
//   const pad = n => n.toString().padStart(2, "0");
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// }

function formatForDatetimeLocal(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = n => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

    // 🔹 Fetch employees (for assigning tickets)
    const [employees] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.position,
              u.role, u.username, u.email
         FROM employees e
    LEFT JOIN users u ON u.id = e.user_id
        WHERE u.client_id=? AND e.employment_type = 'internal'`,
      [clientId]
    );

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

    // Format due_at for datetime-local input
    t.due_at_formatted = formatForDatetimeLocal(t.due_at); //console.log(t.due_at)

    res.render("clientadmin/ticket", {
      title: `Ticket #${t.id}`,
      user: u,
      ticket: t,
      employees,   // ✅ now passed to template
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
    return res.status(400).json({ success: false, error: "Content required" });
  }
  try {
    // Ensure the ticket belongs to client and the comment belongs to ticket
    const [[tk]] = await pool.query("SELECT id FROM tickets WHERE id=? AND client_id=? LIMIT 1", [ticketId, clientId]);
    if (!tk) return res.status(404).json({ success: false, error: "Not found" });

    const [[row]] = await pool.query(
      "SELECT id, user_id FROM ticket_comments WHERE id=? AND ticket_id=? LIMIT 1",
      [commentId, ticketId]
    );
    if (!row) return res.status(404).json({ success: false, error: "Comment not found" });
    if (row.user_id !== u.id) return res.status(403).json({ success: false, error: "You can edit only your own comment" });

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
    res.json({ success: true, comment });
  } catch (e) {
    console.error("clientAdmin updateTicketComment error:", e);
    res.status(500).json({ success: false, error: "Server error" });
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
    if (!tk) return res.status(404).json({ success: false, error: "Not found" });

    await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [dbStatus, id]);
    res.json({ success: true, status: dbStatus });
  } catch (e) {
    console.error("clientAdmin updateTicketStatus error:", e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function updateEmployee(req, res) {
  try {
    const { id, first_name, last_name, position, manager_id, date_of_joining } = req.body;
    const clientId = req.user.client_id;

    // ensure employee belongs to this client
    const [[emp]] = await pool.query(
      "SELECT e.id FROM employees e WHERE e.id=? AND e.client_id=? LIMIT 1",
      [id, clientId]
    );
    if (!emp) return res.status(403).json({ success: false, error: "Unauthorized" });

    await pool.query(
      `UPDATE employees 
          SET first_name=?, last_name=?, position=?, manager_id=?, date_of_joining=?
        WHERE id=? AND client_id=?`,
      [first_name, last_name, position, manager_id || null, date_of_joining || null, id, clientId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("updateEmployee error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function discardTicket(req, res) {
  const clientId = req.user.client_id;
  const ticketId = req.params.id;

  try {
    const [result] = await pool.query(
      `UPDATE tickets 
          SET status='discarded', updated_at=NOW() 
        WHERE id=? AND client_id=?`,
      [ticketId, clientId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Ticket not found or unauthorized");
    }

    // ✅ Redirect to dashboard after success
    res.redirect("/client-admin");
  } catch (err) {
    console.error("discardTicket error:", err);
    res.status(500).send("Server error");
  }
}


async function editTicket_(req, res) {
  const clientId = req.user.client_id;
  const ticketId = req.params.id;
  const { subject, description, due_option, due_at, assigned_to } = req.body;

  try {
    await pool.query(
      `UPDATE tickets 
          SET subject=?, description=?, due_option=?, due_at=?, assigned_to=?, updated_at=NOW()
        WHERE id=? AND client_id=?`,
      [subject, description, due_option, due_at || null, assigned_to || null, ticketId, clientId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

async function editTicket(req, res) { //console.log(req.body); return;
  const clientId = req.user.client_id;
  const ticketId = req.params.id;
  const { subject, description, due_option, due_at, assigned_to, priority } = req.body;
  // console.log(req.body);
  try {
    let finalDueAt = null;

    // Compute due_at based on due_option
    const now = new Date();
    switch (due_option) {
      case "today":
        finalDueAt = new Date();
        finalDueAt.setHours(23, 59, 59, 0);
        break;

      case "tomorrow":
        finalDueAt = new Date();
        finalDueAt.setDate(now.getDate() + 1);
        finalDueAt.setHours(23, 59, 59, 0);
        break;

      case "this_week":
        finalDueAt = new Date();
        const dayOfWeek = finalDueAt.getDay(); // 0 = Sunday
        const daysToSunday = 7 - dayOfWeek;
        finalDueAt.setDate(now.getDate() + daysToSunday);
        finalDueAt.setHours(23, 59, 59, 0);
        break;

      case "next_week":
        finalDueAt = new Date();
        const daysToNextSunday = 7 - finalDueAt.getDay() + 7;
        finalDueAt.setDate(now.getDate() + daysToNextSunday);
        finalDueAt.setHours(23, 59, 59, 0);
        break;

      case "custom":
        finalDueAt = due_at ? new Date(due_at) : null;
        break;

      default:
        finalDueAt = null;
    }

    await pool.query(
      `UPDATE tickets 
          SET subject=?, description=?, due_option=?, due_at=?, assigned_to=?, updated_at=NOW(), priority=?
        WHERE id=? AND client_id=?`,
      [subject, description, due_option, finalDueAt, assigned_to || null, priority, ticketId, clientId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("editTicket error:", err);
    res.status(500).json({ success: false, message: "Server error" });
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
  updateTicketStatus,
  createClientEmployee,     // NEW
  resetEmployeePassword,
  updateEmployee,
  listTicketsWithStatus,
  discardTicket,
  editTicket
};
