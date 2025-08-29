const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
const pool = require("../../db").promise();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

async function hashPassword(pw) { return bcrypt ? await bcrypt.hash(pw, 10) : pw; }
async function createEmployeeRow({ user_id, first_name = null, last_name = null, position = null, manager_employee_id = null }) {
  await pool.query(
    "INSERT INTO employees (user_id, first_name, last_name, position, manager_id) VALUES (?,?,?,?,?)",
    [user_id, first_name, last_name, position, manager_employee_id]
  );
}

// === Presence (lightweight online/offline) ========================
// You can add this table in schema (recommended):
// CREATE TABLE user_presence (user_id INT PRIMARY KEY, last_seen TIMESTAMP NOT NULL,
//   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
async function presencePing(req, res) {
  const u = req.user;
  try {
    await pool.query(
      `INSERT INTO user_presence (user_id, last_seen)
       VALUES (?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP`,
      [u.id]
    );
    res.json({ success: true });
  } catch (err) {
    // If table doesn't exist yet, just ignore so UI still works
    console.warn("presence ping failed (add user_presence table to enable):", err.message);
    res.json({ success: true, degraded: true });
  }
}

function presenceWindowMinutes() { return 10; } // consider "online" if pinged within last 10 mins

// async function dashboard(req, res) {
//   try {
//     const u = req.user; // from JWT
//     const clientId = u.client_id;

//     const [[{ cnt_users = 0 } = {}]] = await pool.query(
//       "SELECT COUNT(*) AS cnt_users FROM users WHERE client_id=?", [clientId]
//     );
//     const [[{ cnt_mgr = 0 } = {}]] = await pool.query(
//       "SELECT COUNT(*) AS cnt_mgr FROM users WHERE client_id=? AND role='manager'", [clientId]
//     );
//     const [[{ cnt_emp = 0 } = {}]] = await pool.query(
//       "SELECT COUNT(*) AS cnt_emp FROM users WHERE client_id=? AND role='employee'", [clientId]
//     );

//     res.render("internal/dashboard", {
//       title: "Internal Admin Dashboard",
//       user: u,
//       stats: { users: cnt_users, managers: cnt_mgr, employees: cnt_emp },
//     });
//   } catch (err) {
//     console.error("internal dashboard error:", err);
//     res.status(500).send("Server error");
//   }
// }

// === Dashboard render =============================================
async function dashboard(req, res) {
  const u = req.user;               // JWT payload
  const clientId = u.client_id;

  try {
    // 1) all employees of this client (for assignment dropdown)
    // need both employees.id (for tickets.assigned_to) and a display label
    const [employees] = await pool.query(
      `SELECT e.id AS employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS label
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id = ? AND u.role = 'employee'
        ORDER BY label ASC`,
      [clientId]
    );

    // 2) tickets list (right column) — note: subject (not title), assigned_to is employees.id
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
        LIMIT 30`,
      [clientId]
    );

    // 3) KPIs (center column)
    const [[{ open_tickets = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS open_tickets
         FROM tickets
        WHERE client_id=? AND status IN ('open','in_progress')`,
      [clientId]
    );

    const [[{ total_employees = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS total_employees
         FROM users
        WHERE client_id=? AND role='employee'`,
      [clientId]
    );

    const [[{ online_employees = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS online_employees
         FROM users u
         JOIN user_presence p ON p.user_id = u.id
        WHERE u.client_id=? AND u.role='employee'
          AND p.last_seen >= (CURRENT_TIMESTAMP - INTERVAL ? MINUTE)`,
      [clientId, presenceWindowMinutes()]
    );

    const offline_employees = Math.max(0, total_employees - online_employees);

    // SLA buckets (by priority)
    const buckets = ["low", "medium", "high", "urgent"];
    const sla = {};
    for (const pr of buckets) {
      const [[{ cnt = 0 } = {}]] = await pool.query(
        `SELECT COUNT(*) AS cnt
           FROM tickets
          WHERE client_id=? AND priority=? AND status IN ('open','in_progress')`,
        [clientId, pr]
      );
      sla[pr] = cnt;
    }

    res.render("internal/dashboard", {
      title: "Internal Admin",
      user: u,                         // for navbar greeting and role badge
      assigns: { employees },          // for the assign dropdowns
      tickets,                         // right column
      summary: {                       // center column KPIs
        open_tickets,
        total_employees,
        online_employees,
        offline_employees,
        sla
      }
    });
  } catch (err) {
    console.error("internal dashboard error:", err);
    res.status(500).send("Server error");
  }
}

// === JSON endpoints for dynamic refresh ===========================
async function getSummary(req, res) {
  const u = req.user;
  const clientId = u.client_id;

  try {
    const [[{ open_tickets = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS open_tickets FROM tickets WHERE client_id=? AND status IN ('open','in_progress')`,
      [clientId]
    );

    const [[{ total_employees = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS total_employees FROM users WHERE client_id=? AND role='employee'`,
      [clientId]
    );

    const [[{ online_employees = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS online_employees
         FROM users u
         JOIN user_presence p ON p.user_id = u.id
        WHERE u.client_id=? AND u.role='employee'
          AND p.last_seen >= (CURRENT_TIMESTAMP - INTERVAL ? MINUTE)`,
      [clientId, presenceWindowMinutes()]
    );

    const offline_employees = Math.max(0, total_employees - online_employees);

    const prBuckets = ["low", "medium", "high", "urgent"];
    const sla = {};
    for (const p of prBuckets) {
      const [[{ cnt = 0 } = {}]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM tickets WHERE client_id=? AND priority=? AND status IN ('open','in_progress')`,
        [clientId, p]
      );
      sla[p] = cnt;
    }

    res.json({
      success: true,
      open_tickets, total_employees, online_employees, offline_employees, sla
    });
  } catch (err) {
    console.error("internal getSummary error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function getTickets(req, res) {
  const u = req.user;
  const clientId = u.client_id;

  try {
    const [tickets] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              t.assigned_to,
              COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                       NULLIF(au.username,''), au.email) AS assignee_label
         FROM tickets t
    LEFT JOIN employees ae ON ae.id = t.assigned_to
    LEFT JOIN users au ON au.id = ae.user_id
        WHERE t.client_id = ?
        ORDER BY t.id DESC`,
      [clientId]
    );

    res.json({ success: true, tickets });
  } catch (err) {
    console.error("internal getTickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// ---------- Assign / Reassign (uses employees.id) ----------
async function assignTicket(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { id } = req.params;                  // ticket id
  const { employee_id } = req.body || {};     // employees.id

  if (!employee_id) return res.status(400).json({ error: "employee_id is required" });

  try {
    // Verify ticket belongs to this client
    const [[ticket]] = await pool.query(
      `SELECT id, client_id FROM tickets WHERE id=? LIMIT 1`,
      [id]
    );
    if (!ticket || ticket.client_id != clientId) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Verify employee belongs to this client
    const [[emp]] = await pool.query(
      `SELECT e.id
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE e.id=? AND u.client_id=? AND u.role='employee'
        LIMIT 1`,
      [employee_id, clientId]
    );
    if (!emp) return res.status(400).json({ error: "Invalid employee for this client" });

    // Update assignment
    await pool.query(`UPDATE tickets SET assigned_to=? WHERE id=?`, [employee_id, id]);

    // Optionally insert into ticket_assignments history table here

    res.json({ success: true });
  } catch (err) {
    console.error("internal assignTicket error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

async function createManager(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { username, email, password, first_name, last_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    const password_hash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'manager')",
      [clientId, username || null, email, password_hash]
    );
    const user_id = result.insertId;

    await createEmployeeRow({ user_id, first_name, last_name, position: "Manager" });

    res.json({ success: true, user_id });
  } catch (err) {
    console.error("createManager error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

async function createEmployee(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { username, email, password, first_name, last_name, manager_id } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    // how many managers exist for this client?
    const [mgrRows] = await pool.query(
      `SELECT e.id AS employee_id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE ux.client_id=? AND ux.role='manager'`,
      [clientId]
    );
    const count = mgrRows.length;

    if (count === 0) {
      return res.status(400).json({ error: "Create a manager first before adding employees." });
    }

    let chosenManagerId = manager_id ? Number(manager_id) : null;

    if (count === 1 && !chosenManagerId) {
      chosenManagerId = mgrRows[0].employee_id; // auto-assign the ONLY manager
    }

    if (count > 1 && !chosenManagerId) {
      return res.status(400).json({ error: "Please select a manager for this employee." });
    }

    // validate manager_id belongs to this client and is role=manager
    const [[okMgr]] = await pool.query(
      `SELECT e.id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE e.id=? AND ux.client_id=? AND ux.role='manager'
        LIMIT 1`,
      [chosenManagerId, clientId]
    );
    if (!okMgr) {
      return res.status(400).json({ error: "Invalid manager selection." });
    }

    // create user (role=employee)
    const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
    const password_hash = bcrypt ? await bcrypt.hash(password, 10) : password;

    const [result] = await pool.query(
      "INSERT INTO users (client_id, username, email, password_hash, role) VALUES (?,?,?,?, 'employee')",
      [clientId, username || null, email, password_hash]
    );
    const user_id = result.insertId;

    // create employees row (manager_id set)
    await pool.query(
      "INSERT INTO employees (user_id, first_name, last_name, position, manager_id) VALUES (?,?,?,?,?)",
      [user_id, first_name || null, last_name || null, "Employee", chosenManagerId]
    );

    res.json({ success: true, user_id });
  } catch (err) {
    console.error("createEmployee error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
}

// List managers for this client (returns employees.id + display label)
async function listManagers(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  try {
    const [managers] = await pool.query(
      `SELECT e.id AS manager_employee_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS label
         FROM employees e
         JOIN users u ON u.id = e.user_id
        WHERE u.client_id=? AND u.role='manager'
        ORDER BY label ASC`,
      [clientId]
    );
    res.json({ success: true, managers });
  } catch (err) {
    console.error("listManagers error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

/** Render ticket detail page */
async function ticketPage(req, res) {
  const { id } = req.params;
  try {
    const [[t]] = await pool.query(
      `SELECT
          t.*,
          COALESCE(CONCAT(ae.first_name,' ',ae.last_name),
                  NULLIF(au.username,''), au.email) AS assignee_label,
          COALESCE(CONCAT(re.first_name,' ',re.last_name),
                  NULLIF(ru.username,''), ru.email) AS raised_by_label
        FROM tickets t
        LEFT JOIN employees ae ON ae.id = t.assigned_to
        LEFT JOIN users     au ON au.id = ae.user_id
        LEFT JOIN users     ru ON ru.id = t.raised_by
        LEFT JOIN employees re ON re.user_id = ru.id   -- 🔧 add this line
        WHERE t.id = ? LIMIT 1`,
      [id]
    );
    if (!t) return res.status(404).send("Ticket not found");

    const [attachmentsRaw] = await pool.query(
      `SELECT ta.id, ta.file_path, ta.uploaded_by, ta.uploaded_at,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS uploader_label
         FROM ticket_attachments ta
         JOIN users u ON u.id = ta.uploaded_by
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE ta.ticket_id=?
        ORDER BY ta.id DESC`,
      [id]
    );
    const imageExt = new Set([".jpg",".jpeg",".png",".gif",".webp",".svg"]);
    const attachments = (attachmentsRaw||[]).map(a => ({
      ...a,
      is_image: imageExt.has(path.extname(a.file_path||"").toLowerCase())
    }));

    const [comments] = await pool.query(
      `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
         FROM ticket_comments c
         JOIN users u ON u.id = c.user_id
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE c.ticket_id=?
        ORDER BY c.id DESC`,
      [id]
    );

    res.render("internal/ticket", {
      title: `Ticket #${t.id}`,
      user: req.user,
      ticket: t,
      attachments,
      comments
    });
  } catch (e) {
    console.error("internal ticketPage error:", e);
    res.status(500).send("Server error");
  }
}

// ---------- Comments ----------
async function listTicketComments(req, res) {
  const { id } = req.params;
  try {
    const [comments] = await pool.query(
      `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
         FROM ticket_comments c
         JOIN users u ON u.id = c.user_id
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE c.ticket_id=?
        ORDER BY c.id DESC`,
      [id]
    );
    res.json({ success: true, comments });
  } catch (e) {
    console.error("internal listTicketComments error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

async function createTicketComment(req, res) {
  const { id } = req.params;
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: "Write something first." });
  try {
    const [r] = await pool.query(
      "INSERT INTO ticket_comments (ticket_id, user_id, comment, created_at) VALUES (?,?,?,NOW())",
      [id, req.user.id, content.trim()]
    );
    const [[row]] = await pool.query(
      `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name), NULLIF(u.username,''), u.email) AS author_label
         FROM ticket_comments c
         JOIN users u ON u.id = c.user_id
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE c.id=?`,
      [r.insertId]
    );
    res.json({ success:true, comment: row });
  } catch (e) {
    console.error("internal createTicketComment error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

// ---------- Attachments ----------
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
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

function attachmentsMiddleware() {
  return upload.array("attachments", 10); // IMPORTANT: field name 'attachments'
}

async function addTicketAttachments(req, res) {
  const { id } = req.params;
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ success:false, error:"No files uploaded" });

  try {
    const inserted = [];
    for (const f of files) {
      const rel = path.join("uploads","tickets", path.basename(f.path)).replace(/\\/g, "/");
      const [r] = await pool.query(
        "INSERT INTO ticket_attachments (ticket_id, file_path, uploaded_by) VALUES (?,?,?)",
        [id, rel, req.user.id]
      );
      inserted.push({ id: r.insertId, file_path: rel });
    }
    res.json({ success:true, attachments: inserted });
  } catch (e) {
    console.error("internal addTicketAttachments error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

// ---------- Status ----------
async function updateTicketStatus(req, res) {
  const { id } = req.params;
  const map = { pending: "open", in_progress: "in_progress", resolved: "closed" };
  const dbStatus = map[(req.body?.status || "").toLowerCase()] || "open";
  try {
    await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [dbStatus, id]);
    res.json({ success:true, status: dbStatus });
  } catch (e) {
    console.error("internal updateTicketStatus error:", e);
    res.status(500).json({ success:false, error:"Server error" });
  }
}

async function updateTicketComment(req, res) {
  const { id: ticketId, commentId } = req.params;
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ success:false, error:"Content required" });
  }
  try {
    // Load the comment to verify author + ticket
    const [[row]] = await pool.query(
      "SELECT id, user_id, ticket_id FROM ticket_comments WHERE id=? AND ticket_id=? LIMIT 1",
      [commentId, ticketId]
    );
    if (!row) return res.status(404).json({ success:false, error:"Comment not found" });
    if (row.user_id !== req.user.id) {
      return res.status(403).json({ success:false, error:"You can edit only your own comment" });
    }

    await pool.query(
      "UPDATE ticket_comments SET comment=?, updated_at=NOW() WHERE id=?",
      [content.trim(), commentId]
    );

    // Return updated view-model
    const [[updated]] = await pool.query(
      `SELECT c.id, c.comment AS content, c.created_at, c.user_id AS author_id,
              COALESCE(CONCAT(e.first_name,' ',e.last_name),
                       NULLIF(u.username,''), u.email) AS author_label
         FROM ticket_comments c
         JOIN users u ON u.id = c.user_id
    LEFT JOIN employees e ON e.user_id = u.id
        WHERE c.id=?`,
      [commentId]
    );
    return res.json({ success:true, comment: updated });
  } catch (e) {
    console.error("internal updateTicketComment error:", e);
    return res.status(500).json({ success:false, error:"Server error" });
  }
}



module.exports = {
  dashboard,
  createManager,
  createEmployee,
  presencePing,
  getSummary,
  getTickets,
  assignTicket,
  listManagers,
  ticketPage,
  listTicketComments,
  createTicketComment,
  attachmentsMiddleware,
  addTicketAttachments,
  updateTicketStatus,
  updateTicketComment
};
