import { Router } from "express";
import {
  listProducts,
  getProduct,
  searchForSale,
  createSale,
  createWebsiteOrder,
  updateOrderStatus,
} from "../services/catalog.js";
import { buildLabelHtml, buildBarcodePng } from "../services/labels.js";
import { notifyNewOrder } from "../services/notify.js";
import { query, withTransaction } from "../db.js";
import { requireAdmin, staffAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

export const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, service: "wellsneakers-api", db: true });
  } catch (err) {
    res.status(503).json({ ok: false, db: false, error: String(err.message) });
  }
});

router.get("/catalog", async (req, res, next) => {
  try {
    const rows = await listProducts({
      brand: req.query.brand,
      size: req.query.size,
      q: req.query.q,
      inStockOnly: req.query.inStock !== "0",
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ ok: true, products: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/catalog/:id", async (req, res, next) => {
  try {
    const product = await getProduct(req.params.id);
    if (!product) return res.status(404).json({ ok: false, error: "not_found" });
    product.sizes = (product.sizes || []).filter((s) => Number(s.qty) > 0);
    if (!product.sizes.length) {
      return res.status(404).json({ ok: false, error: "out_of_stock" });
    }
    res.json({ ok: true, product });
  } catch (err) {
    next(err);
  }
});

router.get("/brands", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT brand, COUNT(*)::int AS products
       FROM products WHERE active AND brand <> ''
       GROUP BY brand ORDER BY brand`
    );
    res.json({ ok: true, brands: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const { customerName, phone, address, fulfillment, items } = req.body || {};
    if (!customerName || !phone || !items?.length) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    const { order, items: lines } = await createWebsiteOrder({
      customerName,
      phone,
      address,
      fulfillment,
      items,
    });
    const notify = await notifyNewOrder(order, lines);
    res.status(201).json({ ok: true, order, notify });
  } catch (err) {
    next(err);
  }
});

/** Public label HTML for print (also used from miniapp) */
router.get("/labels/:productId", async (req, res, next) => {
  try {
    const product = await getProduct(req.params.productId);
    if (!product) return res.status(404).send("not found");
    const html = await buildLabelHtml(product, {
      size: req.query.size || "",
      date: req.query.date || "",
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    next(err);
  }
});

router.get("/labels/:productId/barcode.png", async (req, res, next) => {
  try {
    const product = await getProduct(req.params.productId);
    if (!product) return res.status(404).end();
    const png = await buildBarcodePng(product.article || product.barcode);
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    next(err);
  }
});

router.use("/staff", staffAuth);

router.get("/staff/me", (req, res) => {
  res.json({ ok: true, staff: req.staff });
});

router.get("/staff/search", async (req, res, next) => {
  try {
    const products = await searchForSale(req.query.q || req.query.filter_name || "", {
      includeZero: req.query.all === "1" || req.query.includeZero === "1",
    });
    res.json({ ok: true, products });
  } catch (err) {
    next(err);
  }
});

router.post("/staff/sales", async (req, res, next) => {
  try {
    const body = req.body || {};
    const sale = await createSale({
      staffUserId: req.staff?.id || null,
      items: body.items,
      paymentMethod: body.paymentMethod || body.payment_method,
      delivery: body.delivery,
      discountByn: body.discountByn ?? body.discount_byn,
      comment: body.comment,
      paidCash: body.paidCash ?? body.paid_cash_byn,
      paidCard: body.paidCard ?? body.paid_card_byn,
    });
    res.status(201).json({ ok: true, sale });
  } catch (err) {
    next(err);
  }
});

router.get("/staff/orders", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.*,
        COALESCE(json_agg(json_build_object(
          'product_name', i.product_name, 'size', i.size, 'qty', i.qty, 'article', i.article, 'price_byn', i.price_byn
        )) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM website_orders o
       LEFT JOIN website_order_items i ON i.order_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 100`
    );
    res.json({ ok: true, orders: rows });
  } catch (err) {
    next(err);
  }
});

router.patch("/staff/orders/:id/status", async (req, res, next) => {
  try {
    const order = await updateOrderStatus(req.params.id, req.body?.status);
    res.json({ ok: true, order });
  } catch (err) {
    next(err);
  }
});

router.get("/staff/arrivals", requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, p.name AS product_name, p.article
       FROM stock_arrivals a
       JOIN products p ON p.id = a.product_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    res.json({ ok: true, arrivals: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/staff/arrivals/:id/printed", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE stock_arrivals SET label_printed = TRUE WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, arrival: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/staff/products", requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.article) {
      return res.status(400).json({ ok: false, error: "name_and_article_required" });
    }
    const barcode = b.barcode || b.article;
    const { rows } = await query(
      `INSERT INTO products (name, brand, article, barcode, price_byn)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.name, b.brand || "", b.article, barcode, Number(b.price_byn) || 0]
    );
    const product = rows[0];
    const arrivalIds = [];
    for (const s of b.sizes || []) {
      if (!s.size || Number(s.qty) <= 0) continue;
      await query(
        `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, size) DO UPDATE SET qty = product_sizes.qty + EXCLUDED.qty`,
        [product.id, String(s.size), Number(s.qty)]
      );
      const { rows: arows } = await query(
        `INSERT INTO stock_arrivals (product_id, size, qty, label_printed, staff_user_id)
         VALUES ($1,$2,$3,FALSE,$4) RETURNING id`,
        [product.id, String(s.size), Number(s.qty), req.staff?.id || null]
      );
      arrivalIds.push(arows[0].id);
      await query(
        `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
         VALUES ($1,$2,$3,'arrival','product',$4)`,
        [product.id, String(s.size), Number(s.qty), product.id]
      );
    }
    const full = await getProduct(product.id);
    res.status(201).json({
      ok: true,
      product: full,
      arrivalIds,
      labelUrls: (full.sizes || [])
        .filter((s) => Number(s.qty) > 0)
        .map((s) => `/api/labels/${product.id}?size=${encodeURIComponent(s.size)}`),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/staff/stock", requireAdmin, async (req, res, next) => {
  try {
    const { product_id, size, qty } = req.body || {};
    if (!product_id || !size || !(Number(qty) > 0)) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    await query(
      `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, size) DO UPDATE SET qty = product_sizes.qty + EXCLUDED.qty`,
      [product_id, String(size), Number(qty)]
    );
    const { rows } = await query(
      `INSERT INTO stock_arrivals (product_id, size, qty, label_printed, staff_user_id)
       VALUES ($1,$2,$3,FALSE,$4) RETURNING *`,
      [product_id, String(size), Number(qty), req.staff?.id || null]
    );
    await query(
      `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
       VALUES ($1,$2,$3,'arrival','arrival',$4)`,
      [product_id, String(size), Number(qty), rows[0].id]
    );
    res.status(201).json({
      ok: true,
      arrival: rows[0],
      labelUrl: `/api/labels/${product_id}?size=${encodeURIComponent(size)}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/staff/products/:id", async (req, res, next) => {
  try {
    const product = await getProduct(req.params.id);
    if (!product) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, product });
  } catch (err) {
    next(err);
  }
});

router.get("/staff/next-article", requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(article, '\\D', '', 'g'), '')::bigint), 1000) + 1 AS next
       FROM products`
    );
    res.json({ ok: true, article: String(rows[0].next) });
  } catch (err) {
    next(err);
  }
});

router.patch("/staff/products/:id", requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE products SET
         name = COALESCE($2, name),
         brand = COALESCE($3, brand),
         price_byn = COALESCE($4, price_byn),
         active = COALESCE($5, active),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.brand ?? null,
        b.price_byn != null ? Number(b.price_byn) : null,
        typeof b.active === "boolean" ? b.active : null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    const full = await getProduct(rows[0].id);
    res.json({ ok: true, product: full });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/staff/products/:id/photo",
  requireAdmin,
  upload.single("photo"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: "photo_required" });
      const product = await getProduct(req.params.id);
      if (!product) return res.status(404).json({ ok: false, error: "not_found" });
      const url = `/uploads/${req.file.filename}`;
      await query(
        `INSERT INTO product_images (product_id, url, sort_order)
         VALUES ($1, $2, COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id=$1), 0))`,
        [product.id, url]
      );
      const full = await getProduct(product.id);
      res.status(201).json({ ok: true, url, product: full });
    } catch (err) {
      next(err);
    }
  }
);

/** Inventory: set absolute qty per size (сверка). */
router.post("/staff/inventory", requireAdmin, async (req, res, next) => {
  try {
    const { product_id, sizes } = req.body || {};
    if (!product_id || !Array.isArray(sizes)) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    const result = await withTransaction(async (client) => {
      const changes = [];
      for (const s of sizes) {
        const size = String(s.size || "").trim();
        const qty = Math.max(0, Number(s.qty) || 0);
        if (!size) continue;
        const { rows: cur } = await client.query(
          `SELECT qty FROM product_sizes WHERE product_id = $1 AND size = $2 FOR UPDATE`,
          [product_id, size]
        );
        const prev = cur[0] ? Number(cur[0].qty) : 0;
        const delta = qty - prev;
        await client.query(
          `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, size) DO UPDATE SET qty = EXCLUDED.qty`,
          [product_id, size, qty]
        );
        if (delta !== 0) {
          await client.query(
            `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
             VALUES ($1,$2,$3,'inventory','product',$4)`,
            [product_id, size, delta, product_id]
          );
        }
        changes.push({ size, prev, qty, delta });
      }
      return changes;
    });
    const product = await getProduct(product_id);
    res.json({ ok: true, changes: result, product });
  } catch (err) {
    next(err);
  }
});
