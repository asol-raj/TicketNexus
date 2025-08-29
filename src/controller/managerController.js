const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
const pool = require("../../db").promise();

function presenceWindowMinutes() { return 10; } // online if pinged in 10 mins
async function hashPassword(pw) { return bcrypt ? await bcrypt.hash(pw, 10) : pw; }

/** Helper: get this manager's employee.id (for scoping team) */
async function getManagerEmployeeId(userId) {
  const [[row]] = await pool.query("SELECT id FROM employees WHERE user_id=? LIMIT 1", [userId]);
  return row ? row.id : null;
}

/** GET /manager  - render 3-column dashboard */
async function dashboard(req, res) {
  const u = req.user; // JWT payload
  const clientId = u.client_id;

  try {
    const managerEmpId = await getManagerEmployeeId(u.id);

    // Team: employees who report to this manager
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

    // Tickets (left): all tickets for this client; newest first
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

    // For assignment selects: only this manager's team members
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

    res.render("manager/dashboard", {
      title: "Manager Dashboard",
      user: u,        // for navbar greeting
      team,           // center table
      tickets,        // left panel list
      teamSelect      // for assignment dropdowns
    });
  } catch (err) {
    console.error("manager dashboard error:", err);
    res.status(500).send("Server error");
  }
}

/** GET /manager/data/team  - JSON team + counts + presence */
async function getTeam(req, res) {
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
    res.json({ success: true, team });
  } catch (err) {
    console.error("manager getTeam error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

/** GET /manager/data/tickets  - JSON all tickets for this client */
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
    console.error("manager getTickets error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

/** PUT /manager/tickets/:id/assign  - assign to an employee in manager's team */
async function assignTicket(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { id } = req.params; // ticket id
  const { employee_id } = req.body || {}; // employees.id
  if (!employee_id) return res.status(400).json({ error: "employee_id is required" });

  try {
    const managerEmpId = await getManagerEmployeeId(u.id);

    // Verify ticket belongs to this client
    const [[tix]] = await pool.query(`SELECT id, client_id FROM tickets WHERE id=?`, [id]);
    if (!tix || tix.client_id != clientId) return res.status(404).json({ error: "Ticket not found" });

    // Verify employee belongs to this manager's team
    const [[ok]] = await pool.query(
      `SELECT e.id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE e.id=? AND ux.client_id=? AND ux.role='employee' AND e.manager_id=?`,
      [employee_id, clientId, managerEmpId]
    );
    if (!ok) return res.status(400).json({ error: "Employee not in your team" });

    await pool.query(`UPDATE tickets SET assigned_to=? WHERE id=?`, [employee_id, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("manager assignTicket error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

/** PUT /manager/employees/:employee_id/profile  - edit team member profile */
async function updateEmployeeProfile(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { employee_id } = req.params;
  const { first_name, last_name, position, date_of_joining } = req.body || {};

  try {
    const managerEmpId = await getManagerEmployeeId(u.id);
    // Ensure this employee is in manager's team
    const [[row]] = await pool.query(
      `SELECT e.id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE e.id=? AND ux.client_id=? AND e.manager_id=?`,
      [employee_id, clientId, managerEmpId]
    );
    if (!row) return res.status(403).json({ error: "Not your team member" });

    await pool.query(
      `UPDATE employees SET first_name=?, last_name=?, position=?, date_of_joining=?
        WHERE id=?`,
      [first_name || null, last_name || null, position || null, date_of_joining || null, employee_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("manager updateEmployeeProfile error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

/** PUT /manager/employees/:employee_id/reset-password  - reset team member password */
async function resetEmployeePassword(req, res) {
  const u = req.user;
  const clientId = u.client_id;
  const { employee_id } = req.params;
  const { new_password } = req.body || {};
  if (!new_password) return res.status(400).json({ error: "new_password is required" });

  try {
    const managerEmpId = await getManagerEmployeeId(u.id);
    // Resolve employee_id -> users.id; validate team
    const [[emp]] = await pool.query(
      `SELECT e.id, e.user_id
         FROM employees e
         JOIN users ux ON ux.id = e.user_id
        WHERE e.id=? AND ux.client_id=? AND e.manager_id=?`,
      [employee_id, clientId, managerEmpId]
    );
    if (!emp) return res.status(403).json({ error: "Not your team member" });

    const password_hash = await hashPassword(new_password);
    await pool.query(`UPDATE users SET password_hash=? WHERE id=?`, [password_hash, emp.user_id]);

    res.json({ success: true });
  } catch (err) {
    console.error("manager resetEmployeePassword error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

module.exports = {
  dashboard,
  getTeam,
  getTickets,
  assignTicket,
  updateEmployeeProfile,
  resetEmployeePassword,
};
