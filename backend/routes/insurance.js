const express = require("express");
const { getDb } = require("../db/database");
const { asyncHandler } = require("../middleware/asyncHandler");

/* ════════════════════════════
   PUBLIC API ROUTER
   ════════════════════════════ */
const apiRouter = express.Router();

apiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = await getDb();
    const products = db
      .prepare(
        "SELECT * FROM insurance_products WHERE active = 1 ORDER BY sort_order ASC",
      )
      .all();
    res.json(products);
  }),
);

module.exports = { apiRouter };
