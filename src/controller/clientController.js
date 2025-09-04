const pool = require("../../db");

async function dashboard(req, res) {
  try {
    const u = req.session.auth;
    let stats = { my_tickets: 0, users_in_client: 0 };
    if (u.client_id) {
      const [[{ cnt_t = 0 } = {}]] = await pool.query("SELECT COUNT(*) AS cnt_t FROM tickets WHERE client_id=?", [u.client_id]);
      const [[{ cnt_u = 0 } = {}]] = await pool.query("SELECT COUNT(*) AS cnt_u FROM users WHERE client_id=?", [u.client_id]);
      stats.my_tickets = cnt_t;
      stats.users_in_client = cnt_u;
    }
    res.render("client/dashboard", { title: "Dashboard", user: u, stats });
  } catch (err) {
    console.error("client dashboard error:", err);
    res.status(500).send("Server error");
  }
}

module.exports = { dashboard };
