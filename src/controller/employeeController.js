const pool = require("../../db").promise();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ===================== Multer for attachments =====================
function attachmentsMiddleware() {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "attachments");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
      cb(null, name);
    },
  });
  return multer({ storage }).array("attachments");
}

// ===================== Dashboard =====================
async function dashboard(req, res) {
  const userId = req.user.id;

  // Manager name
  const [[mgr]] = await pool.query(
    `SELECT CONCAT(m.first_name,' ',m.last_name) AS managerName
       FROM employees e
  LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.user_id=? LIMIT 1`,
    [userId]
  );

  // Ticket stats (today + pending, exclude closed/resolved)
  const [[stats]] = await pool.query(
    `SELECT 
        SUM(CASE WHEN DATE(t.created_at)=CURDATE() THEN 1 ELSE 0 END) AS today_assigned,
        SUM(CASE WHEN t.status IN ('open','in_progress') THEN 1 ELSE 0 END) AS pending
       FROM tickets t
      WHERE t.assigned_to = (SELECT id FROM employees WHERE user_id=? LIMIT 1)
        AND t.status NOT IN ('closed','resolved')`,
    [userId]
  );

  // Chart data
  const [[chart]] = await pool.query(
    `SELECT
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed
       FROM tickets 
      WHERE assigned_to = (SELECT id FROM employees WHERE user_id=? LIMIT 1)`,
    [userId]
  );

  // My assigned tickets (exclude closed/resolved)
  const [assigned] = await pool.query(
    `SELECT t.*, TIMESTAMPDIFF(HOUR,t.updated_at,NOW()) AS age_hours
       FROM tickets t
      WHERE t.assigned_to = (SELECT id FROM employees WHERE user_id=? LIMIT 1)
        AND t.status NOT IN ('closed','resolved')
   ORDER BY t.updated_at DESC`,
    [userId]
  );

  // Unassigned tickets (exclude closed/resolved)
  const [unassigned] = await pool.query(
    `SELECT t.* FROM tickets t
      WHERE t.assigned_to IS NULL AND t.status NOT IN ('closed','resolved')
   ORDER BY t.created_at DESC LIMIT 20`
  );

  // res.render("employee/dashboard", {
  //   emp: req.user,
  //   managerName: mgr?.managerName || null,
  //   loginTime: req.session.loginTime || new Date(),
  //   elapsedMinutes: Math.floor((Date.now() - (req.session.loginTime || Date.now())) / 60000),
  //   stats: stats || { today_assigned: 0, pending: 0 },
  //   chart: chart || { open: 0, in_progress: 0, resolved: 0, closed: 0 },
  //   assigned: assigned || [],
  //   unassigned: unassigned || [],
  // });

  res.render("employee/dashboard", {
  user: req.user,   // ✅ add this line so navbar has access
  emp: req.user,
  managerName: mgr?.managerName || null,
  loginTime: req.session.loginTime || new Date(),
  elapsedMinutes: Math.floor((Date.now() - (req.session.loginTime || Date.now())) / 60000),
  stats: stats || { today_assigned: 0, pending: 0 },
  chart: chart || { open: 0, in_progress: 0, resolved: 0, closed: 0 },
  assigned: assigned || [],
  unassigned: unassigned || [],
});
}

// ===================== Ticket page =====================
async function ticketPage(req, res) {
  const id = Number(req.params.id);

  const [[ticket]] = await pool.query(
    `SELECT t.*,
            COALESCE(CONCAT(ae.first_name,' ',ae.last_name), au.username, au.email) AS assignee_label,
            COALESCE(CONCAT(re.first_name,' ',re.last_name), ru.username, ru.email) AS raised_by_label
       FROM tickets t
  LEFT JOIN employees ae ON ae.id = t.assigned_to
  LEFT JOIN users au ON au.id = ae.user_id
  LEFT JOIN users ru ON ru.id = t.raised_by
  LEFT JOIN employees re ON re.user_id = ru.id
      WHERE t.id=? LIMIT 1`,
    [id]
  );

  if (!ticket) return res.status(404).send("Ticket not found");

  const [comments] = await pool.query(
    `SELECT c.*, 
            COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS author_label
       FROM ticket_comments c
  LEFT JOIN users u ON u.id=c.user_id
  LEFT JOIN employees e ON e.user_id=u.id
      WHERE c.ticket_id=? ORDER BY c.created_at DESC`,
    [id]
  );

  const [attachments] = await pool.query(
    `SELECT ta.*, 
            COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS uploader_label,
            CASE WHEN ta.file_path REGEXP '\\\\.(jpg|jpeg|png|gif|webp|svg)$' THEN 1 ELSE 0 END AS is_image
       FROM ticket_attachments ta
  LEFT JOIN users u ON u.id=ta.uploaded_by
  LEFT JOIN employees e ON e.user_id=u.id
      WHERE ta.ticket_id=? ORDER BY ta.uploaded_at DESC`,
    [id]
  );

  res.render("employee/ticket", {
    user: req.user,
    ticket,
    comments,
    attachments,
  });
}

// ===================== Comments =====================
async function listTicketComments(req, res) {
  const id = Number(req.params.id);
  const [rows] = await pool.query(
    `SELECT c.*, 
            COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS author_label
       FROM ticket_comments c
  LEFT JOIN users u ON u.id=c.user_id
  LEFT JOIN employees e ON e.user_id=u.id
      WHERE c.ticket_id=? ORDER BY c.created_at DESC`,
    [id]
  );
  res.json({ success: true, comments: rows });
}

async function createTicketComment(req, res) {
  const id = Number(req.params.id);
  const content = (req.body?.content || "").trim();
  if (!content) return res.status(400).json({ success: false, error: "Empty comment" });

  await pool.query(
    "INSERT INTO ticket_comments(ticket_id,user_id,content,created_at) VALUES (?,?,?,NOW())",
    [id, req.user.id, content]
  );

  const [[row]] = await pool.query(
    `SELECT c.*, 
            COALESCE(CONCAT(e.first_name,' ',e.last_name), u.username, u.email) AS author_label
       FROM ticket_comments c
  LEFT JOIN users u ON u.id=c.user_id
  LEFT JOIN employees e ON e.user_id=u.id
      WHERE c.ticket_id=? AND c.user_id=? ORDER BY c.created_at DESC LIMIT 1`,
    [id, req.user.id]
  );

  res.json({ success: true, comment: row });
}

async function updateTicketComment(req, res) {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const content = (req.body?.content || "").trim();
  if (!content) return res.status(400).json({ success: false, error: "Empty content" });

  const [[c]] = await pool.query("SELECT * FROM ticket_comments WHERE id=? AND ticket_id=?", [commentId, id]);
  if (!c) return res.status(404).json({ success: false, error: "Comment not found" });
  if (c.user_id !== req.user.id) return res.status(403).json({ success: false, error: "Not your comment" });

  await pool.query("UPDATE ticket_comments SET content=?, updated_at=NOW() WHERE id=?", [content, commentId]);

  res.json({ success: true, comment: { ...c, content } });
}

// ===================== Attachments =====================
async function addTicketAttachments(req, res) {
  const id = Number(req.params.id);
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ success: false, error: "No files uploaded" });

  const inserted = [];
  for (const f of files) {
    const filePath = path.join("uploads", "attachments", f.filename);
    const [result] = await pool.query(
      "INSERT INTO ticket_attachments(ticket_id,uploaded_by,file_path,uploaded_at) VALUES (?,?,?,NOW())",
      [id, req.user.id, filePath]
    );
    inserted.push({
      id: result.insertId,
      ticket_id: id,
      uploaded_by: req.user.id,
      file_path: filePath,
    });
  }
  res.json({ success: true, attachments: inserted });
}

// ===================== Self-Assign =====================
async function selfAssignTicket(req, res) {
  const ticketId = Number(req.params.id);
  const userId = req.user.id;

  const [[emp]] = await pool.query("SELECT id FROM employees WHERE user_id=? LIMIT 1", [userId]);
  if (!emp) return res.status(400).json({ success: false, error: "Employee record not found" });

  await pool.query("UPDATE tickets SET assigned_to=?, updated_at=NOW() WHERE id=?", [emp.id, ticketId]);
  res.json({ success: true });
}

async function updateTicketStatus(req, res) {
  const ticketId = Number(req.params.id);
  const status = req.body.status;
  const valid = ["open", "in_progress", "resolved", "closed"];
  if (!valid.includes(status)) return res.status(400).json({ success: false, error: "Invalid status" });

  // Ensure ticket belongs to this employee
  const [[ticket]] = await pool.query(
    `SELECT t.* FROM tickets t
      WHERE t.id=? AND t.assigned_to=(SELECT id FROM employees WHERE user_id=? LIMIT 1)`,
    [ticketId, req.user.id]
  );
  if (!ticket) return res.status(403).json({ success: false, error: "Not your ticket" });

  await pool.query("UPDATE tickets SET status=?, updated_at=NOW() WHERE id=?", [status, ticketId]);
  res.json({ success: true });
}


// ===================== Exports =====================
module.exports = {
  attachmentsMiddleware,
  dashboard,
  ticketPage,
  listTicketComments,
  createTicketComment,
  updateTicketComment,
  addTicketAttachments,
  selfAssignTicket,
  updateTicketStatus
};
