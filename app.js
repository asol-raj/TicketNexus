require("dotenv").config();
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const ejs = require("ejs");
const { passport } = require("./src/middlewares/jwtAuth");

const app = express();
ejs.delimiter = "?";

// ===== Middleware =====
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());
app.use("/attachments", require("./src/router/attachments"));

// Sessions (for SUPER ADMIN only routes we build)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_this_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      sameSite: "lax",
      // secure: true, // enable when behind HTTPS
    },
  })
);

// Static files
app.use(express.static(path.join(__dirname, "src", "public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));
app.use(expressLayouts);
app.set("layout", "layouts/layout");


// Routes
app.use("/", require("./src/router/routes"));
app.use("/auth", require("./src/router/auth"));
app.use("/admin", require("./src/router/admin"));
app.use("/client", require("./src/router/client"));
app.use("/manager", require("./src/router/manager"));
app.use("/internal", require("./src/router/internal"));
app.use("/employee", require("./src/router/employee"));
app.use("/client-admin", require("./src/router/clientAdmin"));
app.use("/client-manager", require("./src/router/clientManager"));



// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


