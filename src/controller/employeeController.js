const pool = require("../../db").promise();

function minutesBetween(date1, date2) {
  return Math.floor((date2.getTime() - date1.getTime()) / 60000);
}

async function dashboard(req, res) {
  const u = req.user; // JWT payload
  const clientId = u.client_id;

  try {
    // Employee & manager info
    const [[emp]] = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.manager_id,
              m.id AS mgr_emp_id,
              CONCAT(m.first_name,' ',m.last_name) AS manager_name
         FROM employees e
    LEFT JOIN employees m ON e.manager_id = m.id
        WHERE e.user_id=?`,
      [u.id]
    );
    if (!emp) return res.status(404).send("Employee profile missing");

    // Tickets assigned to this employee
    const [assigned] = await pool.query(
      `SELECT t.id, t.subject, t.status, t.priority, t.created_at,
              TIMESTAMPDIFF(HOUR, t.created_at, NOW()) AS age_hours
         FROM tickets t
        WHERE t.client_id=? AND t.assigned_to=?
        ORDER BY t.created_at DESC`,
      [clientId, emp.id]
    );

    // Unassigned tickets (visibility)
    const [unassigned] = await pool.query(
      `SELECT t.id, t.subject, t.priority, t.created_at
         FROM tickets t
        WHERE t.client_id=? AND t.assigned_to IS NULL
        ORDER BY t.created_at DESC
        LIMIT 10`,
      [clientId]
    );

    // Status counts for pie chart (my tickets)
    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS cnt
         FROM tickets
        WHERE client_id=? AND assigned_to=?
        GROUP BY status`,
      [clientId, emp.id]
    );
    const statusMap = { open:0, in_progress:0, resolved:0, closed:0 };
    for (const r of statusRows) {
      if (statusMap.hasOwnProperty(r.status)) statusMap[r.status] = r.cnt;
    }

    // Login time from JWT iat
    const loginTime = new Date(u.iat * 1000);
    const elapsedMinutes = minutesBetween(loginTime, new Date());

    // Ticket stats
    const todayStr = new Date().toISOString().slice(0, 10);
    const [[{ today_assigned = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS today_assigned
         FROM tickets
        WHERE client_id=? AND assigned_to=? AND DATE(created_at)=?`,
      [clientId, emp.id, todayStr]
    );
    const [[{ pending = 0 } = {}]] = await pool.query(
      `SELECT COUNT(*) AS pending
         FROM tickets
        WHERE client_id=? AND assigned_to=? AND status NOT IN ('resolved','closed')`,
      [clientId, emp.id]
    );

    res.render("employee/dashboard", {
      title: "Employee Dashboard",
      user: u,
      emp,
      managerName: emp.manager_name,
      assigned,
      unassigned,
      loginTime,
      elapsedMinutes,
      stats: { today_assigned, pending },
      chart: {
        open: statusMap.open,
        in_progress: statusMap.in_progress,
        resolved: statusMap.resolved,
        closed: statusMap.closed,
      }
    });
  } catch (err) {
    console.error("employee dashboard error:", err);
    res.status(500).send("Server error");
  }
}

module.exports = { dashboard };
