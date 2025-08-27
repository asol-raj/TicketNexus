const bcrypt = (() => {
  try { return require("bcryptjs"); } catch (e) { return null; }
})();
const pool = require("../../db").promise();

async function hashPassword(pw) {
  return bcrypt ? await bcrypt.hash(pw, 10) : pw;
}

async function createEmployeeRow({ user_id, first_name = null, last_name = null, position = null, manager_employee_id = null }) {
  await pool.query(
    "INSERT INTO employees (user_id, first_name, last_name, position, manager_id) VALUES (?,?,?,?,?)",
    [user_id, first_name, last_name, position, manager_employee_id]
  );
}

/**
 * Creates a user and (if not super_admin) creates an employees row.
 * Note: username optional.
 */
async function createUser({ client_id, username = null, email, password, role, admin_type = null, first_name = null, last_name = null }) {
  const password_hash = await hashPassword(password);

  if (role !== "admin") admin_type = null;

  const [result] = await pool.query(
    "INSERT INTO users (client_id, username, email, password_hash, role, admin_type) VALUES (?,?,?,?,?,?)",
    [client_id, username, email, password_hash, role, admin_type]
  );
  const user_id = result.insertId;

  // Create employees row for all non-super_admin roles
  if (role !== "super_admin") {
    await createEmployeeRow({ user_id, first_name, last_name, position: role === "admin" ? "Admin" : role });
  }

  return user_id;
}

// GET /admin (dashboard render)
async function dashboard(req, res) {
  try {
    const [[{ total_clients = 0 } = {}]] =
      await pool.query("SELECT COUNT(*) AS total_clients FROM clients");
    const [[{ total_users = 0 } = {}]] =
      await pool.query("SELECT COUNT(*) AS total_users FROM users");

    res.render("superadmin/dashboard", {
      title: "Super Admin Dashboard",
      stats: { total_clients, total_users },
      user: req.session.auth, // unified session
    });
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).send("Server error");
  }
}

// GET /admin/clients (JSON for selects)
async function listClients(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, name FROM clients ORDER BY name ASC");
    res.json({ success: true, clients: rows });
  } catch (err) {
    console.error("listClients error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

// POST /admin/clients
async function createClient(req, res) {
  const { name, contact_email, contact_phone, address } = req.body || {};
  if (!name) return res.status(400).json({ error: "Client name is required." });
  try {
    const [result] = await pool.query(
      "INSERT INTO clients (name, contact_email, contact_phone, address) VALUES (?,?,?,?)",
      [name, contact_email || null, contact_phone || null, address || null]
    );
    return res.json({ success: true, client_id: result.insertId });
  } catch (err) {
    console.error("createClient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/** POST /admin/internal-admins  -> role=admin, admin_type=internal */
async function createInternalAdmin(req, res) {
  const { clientId, username, email, password, first_name, last_name } = req.body || {};
  if (!clientId || !email || !password) return res.status(400).json({ error: "clientId, email and password are required." });

  try {
    const user_id = await createUser({
      client_id: clientId,
      username,
      email,
      password,
      role: "admin",
      admin_type: "internal",
      first_name,
      last_name
    });
    return res.json({ success: true, user_id });
  } catch (err) {
    console.error("createInternalAdmin error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    return res.status(500).json({ error: "Server error" });
  }
}

/** POST /admin/client-admins -> role=admin, admin_type=client */
async function createClientAdmin(req, res) {
  const { clientId, username, email, password, first_name, last_name } = req.body || {};
  if (!clientId || !email || !password) return res.status(400).json({ error: "clientId, email and password are required." });

  try {
    const user_id = await createUser({
      client_id: clientId,
      username,
      email,
      password,
      role: "admin",
      admin_type: "client",
      first_name,
      last_name
    });
    return res.json({ success: true, user_id });
  } catch (err) {
    console.error("createClientAdmin error:", err);
    if (err && err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Email or username already exists." });
    return res.status(500).json({ error: "Server error" });
  }
}


// GET admins for listing
async function listAdmins(req, res) {
  try {
    const [internal] = await pool.query(
      `SELECT u.id, u.username, u.email, c.name AS client_name
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.role='admin' AND u.admin_type='internal'
       ORDER BY c.name, u.email`
    );

    const [clientAdmins] = await pool.query(
      `SELECT u.id, u.username, u.email, c.name AS client_name
       FROM users u
       JOIN clients c ON u.client_id = c.id
       WHERE u.role='admin' AND u.admin_type='client'
       ORDER BY c.name, u.email`
    );

    res.json({ success: true, internal, clientAdmins });
  } catch (err) {
    console.error("listAdmins error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
}


module.exports = {
  dashboard,
  listClients,
  createClient,
  createInternalAdmin,
  createClientAdmin,
  listAdmins,
};
