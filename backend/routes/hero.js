const express = require("express");
const { getDb } = require("../db/database");
const { validateCsrf } = require("../middleware/requireAuth");

function clampOpacity(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 0.55;
  return Math.min(1, Math.max(0, n));
}

function validAlign(v) {
  return ["left", "center", "right"].includes(v) ? v : "left";
}

/* ════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get("/", (req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT * FROM hero_settings WHERE id = 1").get();
  const slides = db
    .prepare(
      "SELECT * FROM hero_slides WHERE active = 1 ORDER BY sort_order ASC",
    )
    .all();
  res.json({ settings, slides });
});

/* ════════════════════════════
   ADMIN ROUTER
   ════════════════════════════ */
const adminRouter = express.Router();

/* LIST SLIDES */
adminRouter.get("/slides", (req, res) => {
  const db = getDb();
  const slides = db
    .prepare("SELECT * FROM hero_slides ORDER BY sort_order ASC")
    .all();
  res.json(slides);
});

/* CREATE SLIDE */
adminRouter.post("/slides", validateCsrf, (req, res) => {
  const db = getDb();
  const {
    background_url,
    overlay_opacity,
    tag_text,
    heading,
    subheading,
    cta_label,
    cta_url,
    accent_color,
    content_align,
    active,
  } = req.body;

  if (!background_url || !heading) {
    return res
      .status(400)
      .json({ error: "Background image and heading are required." });
  }

  const maxOrder =
    db.prepare("SELECT MAX(sort_order) as m FROM hero_slides").get().m || 0;

  const result = db
    .prepare(
      `INSERT INTO hero_slides
        (sort_order, active, background_url, overlay_opacity, tag_text, heading,
         subheading, cta_label, cta_url, accent_color, content_align)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      maxOrder + 1,
      active === false ? 0 : 1,
      String(background_url).trim(),
      clampOpacity(overlay_opacity),
      tag_text || null,
      String(heading).trim(),
      subheading || null,
      cta_label || null,
      cta_url || null,
      accent_color || null,
      validAlign(content_align),
    );

  const slide = db
    .prepare("SELECT * FROM hero_slides WHERE id = ?")
    .get(result.lastInsertRowid);
  res.json(slide);
});

/* REORDER — must be registered before the /:id routes below */
adminRouter.put("/slides/reorder", validateCsrf, (req, res) => {
  const db = getDb();
  const order = Array.isArray(req.body) ? req.body : req.body.order;
  if (!Array.isArray(order)) {
    return res
      .status(400)
      .json({ error: "Expected an array of {id, sort_order}." });
  }
  const update = db.prepare(
    "UPDATE hero_slides SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
  );
  const updateMany = db.transaction((rows) => {
    rows.forEach((row) => update.run(row.sort_order, row.id));
  });
  updateMany(order);
  res.json({ ok: true });
});

/* UPDATE SLIDE */
adminRouter.put("/slides/:id", validateCsrf, (req, res) => {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM hero_slides WHERE id = ?")
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Slide not found." });

  const {
    background_url,
    overlay_opacity,
    tag_text,
    heading,
    subheading,
    cta_label,
    cta_url,
    accent_color,
    content_align,
    active,
  } = req.body;

  if (!background_url || !heading) {
    return res
      .status(400)
      .json({ error: "Background image and heading are required." });
  }

  db.prepare(
    `UPDATE hero_slides SET
      background_url = ?, overlay_opacity = ?, tag_text = ?, heading = ?,
      subheading = ?, cta_label = ?, cta_url = ?, accent_color = ?,
      content_align = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    String(background_url).trim(),
    clampOpacity(overlay_opacity),
    tag_text || null,
    String(heading).trim(),
    subheading || null,
    cta_label || null,
    cta_url || null,
    accent_color || null,
    validAlign(content_align),
    active === false ? 0 : 1,
    req.params.id,
  );

  const slide = db
    .prepare("SELECT * FROM hero_slides WHERE id = ?")
    .get(req.params.id);
  res.json(slide);
});

/* DELETE SLIDE */
adminRouter.delete("/slides/:id", validateCsrf, (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM hero_slides WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* TOGGLE ACTIVE (inline AJAX) */
adminRouter.post("/slides/:id/toggle", validateCsrf, (req, res) => {
  const db = getDb();
  const slide = db
    .prepare("SELECT active FROM hero_slides WHERE id = ?")
    .get(req.params.id);
  if (!slide) return res.status(404).json({ error: "Slide not found." });
  const newVal = slide.active ? 0 : 1;
  db.prepare(
    "UPDATE hero_slides SET active = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(newVal, req.params.id);
  res.json({ active: newVal });
});

/* GLOBAL SETTINGS */
adminRouter.get("/settings", (req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT * FROM hero_settings WHERE id = 1").get();
  res.json(settings);
});

adminRouter.put("/settings", validateCsrf, (req, res) => {
  const db = getDb();
  const { mode, autoplay, interval_ms, show_arrows, show_dots } = req.body;
  db.prepare(
    `UPDATE hero_settings SET
      mode = ?, autoplay = ?, interval_ms = ?, show_arrows = ?, show_dots = ?
     WHERE id = 1`,
  ).run(
    mode === "static" ? "static" : "carousel",
    autoplay ? 1 : 0,
    Math.max(1000, parseInt(interval_ms, 10) || 6000),
    show_arrows ? 1 : 0,
    show_dots ? 1 : 0,
  );
  const settings = db.prepare("SELECT * FROM hero_settings WHERE id = 1").get();
  res.json(settings);
});

module.exports = { apiRouter, adminRouter };
