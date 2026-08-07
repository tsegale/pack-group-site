const express = require("express");
const { getDb } = require("../db/database");

/* ════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get("/", (req, res) => {
  const db = getDb();
  const products = db
    .prepare(
      "SELECT * FROM insurance_products WHERE active = 1 ORDER BY sort_order ASC",
    )
    .all();
  res.json(products);
});

module.exports = { apiRouter };
