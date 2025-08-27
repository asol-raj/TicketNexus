const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
const pool = require("../../db").promise();

async function hashPassword(pw) { return bcrypt ? await bcrypt.hash(pw, 10) : pw; }
async function createEmployeeRow({ user_id, first_name = null, last_name = null, position = null, manager_employee_id = null }) {
  await pool.query(
    "INSERT INTO employees (user_id, first_name, last_name, position, manager_id) VALUES (?,?,?,?,?)",
    [user_id, first_name, last_name, position, manager_employee_id]
  );
}

async function dashboard(req, res) {
  try {
    const u = req.user;
    const clientId = u.client_id;

    const [[{ cnt_users = 0 } = {}]] = await pool.query(
      "SELECT COUNT(*) AS cnt_users FROM users WHERE client_id=?", [clientId]
    );
    const [[{ cnt_mgr = 0 } = {}]] = await pool.query(
      "SELECT COUNT(*) AS cnt_mgr FROM users WHERE client_id=? AND role='manager'", [clientId]
    );
    const [[{ cnt_emp = 0 } = {}]] = await pool.query(
      "SELECT COUNT(*) AS cnt_emp FROM users WHERE client_id=? AND role='employee'", [clientId]
    );

    res.render("clientadmin/dashboard", {
      title: "Client Admin Dashboard",
      user: u,
      stats: { users: cnt_users, managers: cnt_mgr, employees: cnt_emp },
    });
  } catch (err) {
    console.error("clientAdmin dashboard error:", err);
    res.status(500).send("Server error");
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
    console.error("clientAdmin createManager error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    res.status(500).json({ error: "Server error" });
  }
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

module.exports = { dashboard, createManager, createEmployee };
