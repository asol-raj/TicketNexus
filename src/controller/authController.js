const jwt = require("jsonwebtoken");
const bcrypt = (() => { try { return require("bcryptjs"); } catch { return null; } })();
const pool = require("../../db").promise();

const JWT_SECRET = process.env.JWT_SECRET || "change_this_jwt_secret";
const JWT_EXPIRES = "9h"; // 9 hours

// POST /auth/login
// async function login(req, res) {
//   // You changed the form to send "username" – this can be username OR email
//   const { username, password } = req.body || {};
//   if (!username || !password) return res.status(400).json({ error: "Username/email and password are required." });

//   try {
//     const [rows] = await pool.query(
//       "SELECT id, client_id, username, email, password_hash, role, admin_type FROM users WHERE email=? OR username=? LIMIT 1",
//       [username, username]
//     );
//     const user = rows[0];
//     if (!user) return res.status(401).json({ error: "Invalid credentials." });

//     const ok = bcrypt ? await bcrypt.compare(password, user.password_hash) : password === user.password_hash;
//     if (!ok) return res.status(401).json({ error: "Invalid credentials." });

//     if (user.role === "super_admin") {
//       // Session for super admin
//       req.session.auth = {
//         id: user.id, email: user.email, username: user.username, role: user.role, client_id: user.client_id
//       };
//       return res.json({ success: true, redirect: "/admin" });
//     }

//     // JWT for everyone else
//     const payload = {
//       id: user.id,
//       email: user.email,
//       username: user.username,
//       role: user.role,
//       admin_type: user.admin_type || null,
//       client_id: user.client_id || null,
//       first_name: user.first_name || null,
//       last_name: user.last_name || null,
//     }; console.log(payload);
//     const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

//     res.cookie("jwt", token, {
//       httpOnly: true,
//       sameSite: "lax",
//       maxAge: 9 * 60 * 60 * 1000, // 9 hours
//       // secure: true, // enable with HTTPS in prod
//     });

//     // Role-based default redirects
//     let redirect = "/client";
//     if (user.role === "admin" && user.admin_type === "internal") redirect = "/internal";
//     if (user.role === "admin" && user.admin_type === "client") redirect = "/client-admin";
//     if (user.role === "manager") redirect = "/manager";
//     if (user.role === "employee") redirect = "/employee";
//     return res.json({ success: true, redirect });
//   } catch (err) {
//     console.error("auth login error:", err);
//     return res.status(500).json({ error: "Server error" });
//   }
// }

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username/email and password are required." });
  }

  try {
    // 1) Find user by email OR username
    const [rows] = await pool.query(
      "SELECT id, client_id, username, email, password_hash, role, admin_type FROM users WHERE email=? OR username=? LIMIT 1",
      [username, username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    // 2) Verify password
    const ok = bcrypt ? await bcrypt.compare(password, user.password_hash) : password === user.password_hash;
    if (!ok) return res.status(401).json({ error: "Invalid credentials." });

    // 3) Super admin uses session-based auth (as you already do)
    if (user.role === "super_admin") {
      req.session.auth = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        client_id: user.client_id,
      };
      return res.json({ success: true, redirect: "/admin" });
    }

    // 4) Pull employment_type (for managers/employees), and names for convenience
    const [[emp]] = await pool.query(
      "SELECT employment_type, first_name, last_name FROM employees WHERE user_id=? LIMIT 1",
      [user.id]
    );

    // 5) Build JWT payload (include employment_type!)
    const payload = {
      id: user.id,
      client_id: user.client_id || null,
      role: user.role,
      email: user.email || null,
      username: user.username || null,
      admin_type: user.admin_type || null,                      // 'internal' | 'client' for admins
      employment_type: emp ? emp.employment_type : null,        // 'internal' | 'client' for mgr/employee
      first_name: emp ? emp.first_name : null,
      last_name:  emp ? emp.last_name  : null,
    };
    // console.log("LOGIN PAYLOAD =>", payload);

    // 6) Sign JWT for 9 hours
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES || "9h" });

    res.cookie("jwt", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 9 * 60 * 60 * 1000, // 9 hours
      // secure: true, // enable in production with HTTPS
    });

    // 7) Decide redirect using role + type
    let redirect = "/";
    if (user.role === "admin") {
      redirect = user.admin_type === "client" ? "/client-admin" : "/internal";
    } else if (user.role === "manager") {
      redirect = (payload.employment_type === "client") ? "/client-manager" : "/manager"; // your internal manager router
    } else if (user.role === "employee") {
      redirect = (payload.employment_type === "client") ? "/client-employee" : "/employee";
    } else {
      // fallback for any other roles
      redirect = "/"; 
    }

    return res.json({ success: true, redirect });
  } catch (err) {
    console.error("auth login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}


// GET /auth/logout (clears both session and jwt)
function logout(req, res) {
  req.session?.destroy(() => { });
  res.clearCookie("connect.sid");
  res.clearCookie("jwt");
  res.redirect("/login");
}

module.exports = { login, logout };
