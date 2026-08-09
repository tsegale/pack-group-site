const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const { getDb } = require("../db/database");
const { validateCsrf } = require("../middleware/requireAuth");
const { asyncHandler } = require("../middleware/asyncHandler");

const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");

/* ── IMAGE VALIDATION ── */
function isValidImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return true;
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return true;
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    cb(null, ok.includes(file.mimetype));
  },
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function withImages(db, property) {
  if (!property) return null;
  const imgs = db
    .prepare(
      "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC",
    )
    .all(property.id);
  return { ...property, images: imgs };
}

/* ════════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get(
  "/featured",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const props = db
      .prepare(
        "SELECT * FROM properties WHERE featured = 1 AND status = 'available' ORDER BY created_at DESC",
      )
      .all();
    res.json(props.map((p) => withImages(db, p)));
  }),
);

apiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const { status, type } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit, 10) || 9),
    );
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (type) {
      conditions.push("type = ?");
      params.push(type);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = db
      .prepare(`SELECT COUNT(*) as c FROM properties ${where}`)
      .get(...params).c;
    const props = db
      .prepare(
        `SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    res.json({
      properties: props.map((p) => withImages(db, p)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

apiRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const prop = db
      .prepare("SELECT * FROM properties WHERE slug = ?")
      .get(req.params.slug);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    res.json(withImages(db, prop));
  }),
);

/* ════════════════════════════════
   ADMIN ROUTER
   ════════════════════════════════ */
const adminRouter = express.Router();

/* LIST */
const ADMIN_PAGE_SIZE = 20;
adminRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const filter = req.query.status || "all";
    const currentPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (currentPage - 1) * ADMIN_PAGE_SIZE;
    const where = filter === "all" ? "" : "WHERE status = ?";
    const params = filter === "all" ? [] : [filter];

    const total = db
      .prepare(`SELECT COUNT(*) as c FROM properties ${where}`)
      .get(...params).c;
    const props = db
      .prepare(
        `SELECT * FROM properties ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, ADMIN_PAGE_SIZE, offset);

    const propsWithImgs = props.map((p) => {
      const cover = db
        .prepare(
          "SELECT filename FROM property_images WHERE property_id = ? AND is_cover = 1 LIMIT 1",
        )
        .get(p.id);
      return { ...p, coverImage: cover ? cover.filename : null };
    });
    res.render("admin/properties", {
      title: "Properties",
      page: "properties",
      user: req.session.user,
      csrfToken: req.session.csrfToken,
      properties: propsWithImgs,
      filter,
      currentPage,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
      flash: req.session.flash || null,
    });
    delete req.session.flash;
  }),
);

/* NEW FORM */
adminRouter.get("/new", (req, res) => {
  res.render("admin/property-form", {
    title: "Add Property",
    page: "properties",
    user: req.session.user,
    csrfToken: req.session.csrfToken,
    property: null,
    images: [],
    flash: null,
  });
});

/* CREATE */
adminRouter.post(
  "/",
  upload.array("images", 20),
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    let {
      title,
      type,
      price,
      levy,
      bedrooms,
      bathrooms,
      location,
      description,
      status,
      units_available,
      rental_option,
      contact_phone,
      featured,
      slug,
    } = req.body;

    if (!title || !location || !price) {
      return res.render("admin/property-form", {
        title: "Add Property",
        page: "properties",
        user: req.session.user,
        csrfToken: req.session.csrfToken,
        property: req.body,
        images: [],
        flash: {
          type: "error",
          msg: "Title, location, and price are required.",
        },
      });
    }

    slug = slug ? slugify(slug) : slugify(title);

    const existing = db
      .prepare("SELECT id FROM properties WHERE slug = ?")
      .get(slug);
    if (existing) slug = slug + "-" + Date.now();

    const result = db
      .prepare(
        `
      INSERT INTO properties
        (title, type, price, levy, bedrooms, bathrooms, location,
         description, status, units_available, rental_option,
         contact_phone, featured, slug)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        title.trim(),
        type || "sale",
        parseFloat(price) || 0,
        levy || null,
        parseInt(bedrooms) || 0,
        parseInt(bathrooms) || 0,
        location.trim(),
        description || null,
        status || "available",
        parseInt(units_available) || 1,
        rental_option === "on" ? 1 : 0,
        contact_phone || "0858196462",
        featured === "on" ? 1 : 0,
        slug,
      );

    const propId = result.lastInsertRowid;
    const { urls, manifest, coverPosition } = _parseImageUpload(req);
    _saveImages(db, propId, req.files || [], urls, manifest, coverPosition);

    req.session.flash = {
      type: "success",
      msg: `"${title}" created successfully.`,
    };
    res.redirect(`/admin/properties/${propId}/edit`);
  }),
);

/* EDIT FORM */
adminRouter.get(
  "/:id/edit",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const prop = db
      .prepare("SELECT * FROM properties WHERE id = ?")
      .get(req.params.id);
    if (!prop) return res.redirect("/admin/properties");
    const images = db
      .prepare(
        "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order",
      )
      .all(prop.id);
    res.render("admin/property-form", {
      title: `Edit — ${prop.title}`,
      page: "properties",
      user: req.session.user,
      csrfToken: req.session.csrfToken,
      property: prop,
      images,
      flash: req.session.flash || null,
    });
    delete req.session.flash;
  }),
);

/* UPDATE */
adminRouter.post(
  "/:id",
  upload.array("images", 20),
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const prop = db
      .prepare("SELECT * FROM properties WHERE id = ?")
      .get(req.params.id);
    if (!prop) return res.redirect("/admin/properties");

    let {
      title,
      type,
      price,
      levy,
      bedrooms,
      bathrooms,
      location,
      description,
      status,
      units_available,
      rental_option,
      contact_phone,
      featured,
      slug,
    } = req.body;

    if (!slug || slugify(slug) === "") slug = slugify(title);
    else slug = slugify(slug);

    const conflict = db
      .prepare("SELECT id FROM properties WHERE slug = ? AND id != ?")
      .get(slug, prop.id);
    if (conflict) slug = slug + "-" + Date.now();

    db.prepare(
      `
      UPDATE properties SET
        title = ?, type = ?, price = ?, levy = ?, bedrooms = ?, bathrooms = ?,
        location = ?, description = ?, status = ?, units_available = ?,
        rental_option = ?, contact_phone = ?, featured = ?, slug = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `,
    ).run(
      title.trim(),
      type || "sale",
      parseFloat(price) || 0,
      levy || null,
      parseInt(bedrooms) || 0,
      parseInt(bathrooms) || 0,
      location.trim(),
      description || null,
      status || "available",
      parseInt(units_available) || 1,
      rental_option === "on" ? 1 : 0,
      contact_phone || "0858196462",
      featured === "on" ? 1 : 0,
      slug,
      prop.id,
    );

    const { urls, manifest, coverPosition } = _parseImageUpload(req);
    if ((req.files && req.files.length > 0) || urls.length > 0) {
      _saveImages(db, prop.id, req.files || [], urls, manifest, coverPosition);
    }

    req.session.flash = {
      type: "success",
      msg: `"${title}" updated successfully.`,
    };
    res.redirect(`/admin/properties/${prop.id}/edit`);
  }),
);

/* DELETE */
adminRouter.post(
  "/:id/delete",
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const prop = db
      .prepare("SELECT * FROM properties WHERE id = ?")
      .get(req.params.id);
    if (prop) {
      const imgs = db
        .prepare("SELECT filename FROM property_images WHERE property_id = ?")
        .all(prop.id);
      imgs.forEach((img) => {
        if (img.filename.startsWith("uploads/")) {
          const fpath = path.join(UPLOADS_DIR, path.basename(img.filename));
          if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
        }
      });
      db.prepare("DELETE FROM properties WHERE id = ?").run(prop.id);
    }
    req.session.flash = { type: "success", msg: "Property deleted." };
    res.redirect("/admin/properties");
  }),
);

/* TOGGLE FEATURED */
adminRouter.post(
  "/:id/toggle-featured",
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const prop = db
      .prepare("SELECT featured FROM properties WHERE id = ?")
      .get(req.params.id);
    if (!prop) return res.status(404).json({ error: "Property not found" });
    const newVal = prop.featured ? 0 : 1;
    db.prepare("UPDATE properties SET featured = ? WHERE id = ?").run(
      newVal,
      req.params.id,
    );
    res.json({ featured: newVal });
  }),
);

/* SET COVER IMAGE */
adminRouter.post(
  "/:id/images/:imgId/cover",
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    db.prepare(
      "UPDATE property_images SET is_cover = 0 WHERE property_id = ?",
    ).run(req.params.id);
    db.prepare(
      "UPDATE property_images SET is_cover = 1 WHERE id = ? AND property_id = ?",
    ).run(req.params.imgId, req.params.id);
    res.json({ ok: true });
  }),
);

/* DELETE IMAGE */
adminRouter.post(
  "/:id/images/:imgId/delete",
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const img = db
      .prepare("SELECT * FROM property_images WHERE id = ? AND property_id = ?")
      .get(req.params.imgId, req.params.id);
    if (img) {
      if (img.filename.startsWith("uploads/")) {
        const fpath = path.join(UPLOADS_DIR, path.basename(img.filename));
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
      }
      db.prepare("DELETE FROM property_images WHERE id = ?").run(img.id);
      if (img.is_cover) {
        const next = db
          .prepare(
            "SELECT id FROM property_images WHERE property_id = ? ORDER BY sort_order LIMIT 1",
          )
          .get(req.params.id);
        if (next)
          db.prepare(
            "UPDATE property_images SET is_cover = 1 WHERE id = ?",
          ).run(next.id);
      }
    }
    res.json({ ok: true });
  }),
);

/* MOVE IMAGE */
adminRouter.post(
  "/:id/images/:imgId/move",
  validateCsrf,
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const { direction } = req.body;
    const imgs = db
      .prepare(
        "SELECT * FROM property_images WHERE property_id = ? ORDER BY sort_order ASC",
      )
      .all(req.params.id);
    const idx = imgs.findIndex((i) => i.id == req.params.imgId);
    if (idx === -1) return res.json({ ok: false });
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= imgs.length) return res.json({ ok: false });
    const a = imgs[idx],
      b = imgs[swapIdx];
    db.prepare("UPDATE property_images SET sort_order = ? WHERE id = ?").run(
      b.sort_order,
      a.id,
    );
    db.prepare("UPDATE property_images SET sort_order = ? WHERE id = ?").run(
      a.sort_order,
      b.id,
    );
    res.json({ ok: true });
  }),
);

/* ── INTERNAL HELPERS ── */

/* Reads the staged-image manifest submitted by property-form.ejs.
   image_manifest describes the client-chosen order as a sequence of
   {kind:'file'|'url'}; the nth 'file' entry maps to req.files[n], the
   nth 'url' entry maps to the nth entry of image_urls_json. cover_position
   is an index into the manifest, or empty if no explicit cover was chosen.
   Both are sent as single JSON fields (not repeated form fields) since
   multer/append-field only arrays bracketed field names. */
function _parseImageUpload(req) {
  let manifest = null;
  try {
    manifest = req.body.image_manifest
      ? JSON.parse(req.body.image_manifest)
      : null;
  } catch (e) {
    manifest = null;
  }
  if (!Array.isArray(manifest)) manifest = null;

  let rawUrls = [];
  try {
    rawUrls = req.body.image_urls_json
      ? JSON.parse(req.body.image_urls_json)
      : [];
  } catch (e) {
    rawUrls = [];
  }
  if (!Array.isArray(rawUrls)) rawUrls = [];

  const urls = rawUrls
    .map((u) => String(u).trim())
    .filter((u) => /^https?:\/\//i.test(u));

  const coverPosition =
    req.body.cover_position !== undefined && req.body.cover_position !== ""
      ? parseInt(req.body.cover_position, 10)
      : null;

  return { urls, manifest, coverPosition };
}

function _saveUploadedFile(file) {
  if (!isValidImage(file.buffer)) return null;
  const ext =
    file.mimetype === "image/png"
      ? ".png"
      : file.mimetype === "image/webp"
        ? ".webp"
        : ".jpg";
  const filename = "uploads/" + uuid() + ext;
  fs.writeFileSync(
    path.join(UPLOADS_DIR, path.basename(filename)),
    file.buffer,
  );
  return filename;
}

/* Saves newly added images for a property. Supports two intermixed
   sources — uploaded files and pasted image URLs — combined in the
   order described by `manifest`. Falls back to files-only, in given
   order, when no manifest is present. */
function _saveImages(db, propId, files, urls, manifest, coverPosition) {
  urls = urls || [];
  const existCount = db
    .prepare("SELECT COUNT(*) as c FROM property_images WHERE property_id = ?")
    .get(propId).c;
  const insert = db.prepare(
    "INSERT INTO property_images (property_id, filename, sort_order, is_cover) VALUES (?, ?, ?, ?)",
  );

  const filenames = [];
  if (manifest && manifest.length) {
    let fileIdx = 0;
    let urlIdx = 0;
    manifest.forEach((entry) => {
      if (entry && entry.kind === "file") {
        const file = files[fileIdx++];
        if (!file) return;
        const filename = _saveUploadedFile(file);
        if (filename) filenames.push(filename);
      } else if (entry && entry.kind === "url") {
        const url = urls[urlIdx++];
        if (url) filenames.push(url);
      }
    });
  } else {
    files.forEach((file) => {
      const filename = _saveUploadedFile(file);
      if (filename) filenames.push(filename);
    });
    urls.forEach((url) => filenames.push(url));
  }

  if (filenames.length === 0) return;

  const explicitCover =
    Number.isInteger(coverPosition) &&
    coverPosition >= 0 &&
    coverPosition < filenames.length;
  if (explicitCover) {
    db.prepare(
      "UPDATE property_images SET is_cover = 0 WHERE property_id = ?",
    ).run(propId);
  }

  filenames.forEach((filename, i) => {
    const isCover = explicitCover
      ? i === coverPosition
        ? 1
        : 0
      : existCount === 0 && i === 0
        ? 1
        : 0;
    insert.run(propId, filename, existCount + i, isCover);
  });
}

module.exports = { apiRouter, adminRouter };
