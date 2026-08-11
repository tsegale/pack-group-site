require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const session = require("express-session");
const helmet = require("helmet");
const { createSqlJsClient } = require("./db/sqlJsClient");
const SqliteStore = require("better-sqlite3-session-store")(session);

const { requireAuth } = require("./middleware/requireAuth");
const { asyncHandler } = require("./middleware/asyncHandler");

const authRouter = require("./routes/auth");
const {
  apiRouter: propApi,
  adminRouter: propAdmin,
} = require("./routes/properties");
const { apiRouter: insApi } = require("./routes/insurance");
const {
  apiRouter: leadsApi,
  adminRouter: leadsAdmin,
} = require("./routes/leads");
const { apiRouter: heroApi, adminRouter: heroAdmin } = require("./routes/hero");
const settingsRouter = require("./routes/settings");
const accountRouter = require("./routes/account");
const { verifyTransporters } = require("./utils/mailer");

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_ROOT = path.join(__dirname, "./");

/* ── TRUST PROXY (Railway/reverse proxy/Passenger) ── */
app.set("trust proxy", 1);

/* ── VIEW ENGINE ── */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ── SECURITY HEADERS ── */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

/* ── BODY PARSING ── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* On the deployed server, server.js and the rest of this app sit in the
   SAME folder as the public HTML files (SITE_ROOT === __dirname) — so
   express.static(SITE_ROOT) below would otherwise also serve pack.db,
   node_modules, source code, .env, etc. directly (e.g. GET /db/pack.db).
   Block every internal-only top-level entry before static or route
   handling gets a chance to serve it. */
const BLOCKED_TOP_LEVEL = [
  "db",
  "routes",
  "middleware",
  "views",
  "node_modules",
  "server.js",
  "app.js",
  "package.json",
  "package-lock.json",
  ".env",
  ".env.production",
  ".gitignore",
  "README.md",
];
app.use((req, res, next) => {
  const firstSegment = req.path.split("/")[1];
  if (BLOCKED_TOP_LEVEL.includes(firstSegment)) {
    return res.status(404).end();
  }
  next();
});

/* Clean public URLs, mapped to their static HTML file. Registered before
   express.static() so they take priority over direct file access. */
const CLEAN_PAGES = {
  "/": "index.html",
  "/real-estate": "real-estate.html",
  "/insurance": "insurance.html",
  "/listings": "listings.html",
  "/about": "about.html",
  "/contact": "contact.html",
};

/* 301s for the old .html URLs, so nothing that already linked or bookmarked
   them breaks. /listing.html has no slug in the path, so it falls back to
   the listings index rather than a specific property. */
const LEGACY_REDIRECTS = {
  "/index.html": "/",
  "/real-estate.html": "/real-estate",
  "/insurance.html": "/insurance",
  "/listings.html": "/listings",
  "/about.html": "/about",
  "/contact.html": "/contact",
  "/listing.html": "/listings",
};

/* Sessions live in their own sql.js-backed database, separate from pack.db.
   Server startup is wrapped in an async function because sql.js's WASM
   module has to finish loading before the session store (and later, any
   route touching pack.db) can be used. */
async function start() {
  const sessionClient = await createSqlJsClient(
    path.join(__dirname, "db", "sessions.db"),
  );

  /* ── SESSION ── */
  app.use(
    session({
      store: new SqliteStore({
        client: sessionClient,
        expired: { clear: true, intervalMs: 15 * 60 * 1000 },
      }),
      secret: process.env.SESSION_SECRET || "dev-secret-please-change",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  /* ── CSRF TOKEN (per-session) ── */
  app.use((req, res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
  });

  /* ── STATIC: admin uploads ── */
  app.use(
    "/uploads",
    express.static(path.join(__dirname, "public", "uploads")),
  );

  /* ── STATIC: admin CSS ── */
  app.use("/admin-assets", express.static(path.join(__dirname, "public")));

  /* ── PUBLIC API ── */
  app.use("/api/properties", propApi);
  app.use("/api/insurance", insApi);
  app.use("/api/leads", leadsApi);
  app.use("/api/hero", heroApi);

  /* ── ADMIN ── */
  app.get("/admin", (req, res) => {
    res.redirect(req.session.userId ? "/admin/dashboard" : "/admin/login");
  });
  app.use("/admin", authRouter);

  app.get(
    "/admin/dashboard",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { getDb } = require("./db/database");
      const db = await getDb();

      const weekAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const stats = {
        activeListings: db
          .prepare(
            "SELECT COUNT(*) as c FROM properties WHERE status = 'available'",
          )
          .get().c,
        totalListings: db.prepare("SELECT COUNT(*) as c FROM properties").get()
          .c,
        newLeads: db
          .prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= ?")
          .get(weekAgo).c,
        totalLeads: db.prepare("SELECT COUNT(*) as c FROM leads").get().c,
        reLeads: db
          .prepare(
            "SELECT COUNT(*) as c FROM leads WHERE source_division = 'real-estate'",
          )
          .get().c,
        insLeads: db
          .prepare(
            "SELECT COUNT(*) as c FROM leads WHERE source_division = 'insurance'",
          )
          .get().c,
        newStatus: db
          .prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'new'")
          .get().c,
      };
      const recentLeads = db
        .prepare(
          `
        SELECT l.*, p.title as property_title
        FROM leads l LEFT JOIN properties p ON l.property_id = p.id
        ORDER BY l.created_at DESC LIMIT 5
      `,
        )
        .all();

      res.render("admin/dashboard", {
        title: "Dashboard",
        page: "dashboard",
        user: req.session.user,
        csrfToken: req.session.csrfToken,
        stats,
        recentLeads,
        flash: req.session.flash || null,
      });
      delete req.session.flash;
    }),
  );

  app.use("/admin/properties", requireAuth, propAdmin);
  app.use("/admin/leads", requireAuth, leadsAdmin);
  app.use("/admin/api/hero", requireAuth, heroAdmin);
  app.use("/admin/settings", requireAuth, settingsRouter);
  app.use("/admin/account", requireAuth, accountRouter);

  /* ── CLEAN PUBLIC PAGE URLs ── */
  Object.entries(CLEAN_PAGES).forEach(([route, file]) => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(SITE_ROOT, file));
    });
  });

  /* listing.html itself still reads the slug — from the URL path now
     instead of a ?slug= query param, see listing.html's own script. */
  app.get("/listing/:slug", (req, res) => {
    res.sendFile(path.join(SITE_ROOT, "listing.html"));
  });

  /* ── LEGACY .html REDIRECTS ── */
  Object.entries(LEGACY_REDIRECTS).forEach(([oldPath, newPath]) => {
    app.get(oldPath, (req, res) => {
      res.redirect(301, newPath);
    });
  });

  /* ── STATIC SITE (must be last) ── */
  app.use(express.static(SITE_ROOT));

  /* ── 404 FALLBACK ── */
  app.use((req, res) => {
    if (req.path.startsWith("/admin")) {
      return res.status(404).render("admin/error", {
        title: "404 Not Found",
        message: "The page you requested does not exist.",
        csrfToken: req.session.csrfToken || "",
        user: req.session.user || { name: "" },
        page: "",
      });
    }
    res.status(404).sendFile(path.join(SITE_ROOT, "index.html"));
  });

  /* ── ERROR HANDLER ── */
  app.use((err, req, res, _next) => {
    console.error(err);
    if (req.path.startsWith("/api")) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.status(500).render("admin/error", {
      title: "Server Error",
      message:
        process.env.NODE_ENV === "production"
          ? "Something went wrong."
          : err.message,
      csrfToken: req.session.csrfToken || "",
      user: req.session.user || { name: "" },
      page: "",
    });
  });

  app.listen(PORT, () => {
    console.log(`Pack Group server running on http://localhost:${PORT}`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  });

  verifyTransporters();
}

start();
