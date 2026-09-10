import { Router } from "express";
import {
  listProducts,
  getProduct,
  searchForSale,
  createSale,
  createWebsiteOrder,
  updateOrderStatus,
} from "../services/catalog.js";
import { query } from "../db.js";
import { requireAdmin, staffAuth } from "../middleware/auth.js";

export const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, service: "wellsneakers-api", db: true });
  } catch (err) {
    res.status(503).json({ ok: false, db: false, error: String(err.message) });
  }
});

/** Public catalog for website */
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
    // hide zero sizes on public endpoint
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

/** Website checkout */
router.post("/orders", async (req, res, next) => {
  try {
    const { customerName, phone, address, fulfillment, items } = req.body || {};
    if (!customerName || !phone || !items?.length) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    const order = await createWebsiteOrder({
      customerName,
      phone,
      address,
      fulfillment,
      items,
    });
    res.status(201).json({ ok: true, order });
  } catch (err) {
    next(err);
  }
});

/** Staff */
router.use("/staff", staffAuth);

router.get("/staff/search", async (req, res, next) => {
  try {
    const products = await searchForSale(req.query.q || req.query.filter_name || "");
    res.json({ ok: true, products });
  } catch (err) {
    next(err);
  }
});

router.post("/staff/sales", async (req, res, next) => {
  try {
    const body = req.body || {};
    const sale = await createSale({
      staffUserId: null,
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

router.get("/staff/orders", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM website_orders ORDER BY created_at DESC LIMIT 100`
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
    for (const s of b.sizes || []) {
      if (!s.size || Number(s.qty) <= 0) continue;
      await query(
        `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, size) DO UPDATE SET qty = EXCLUDED.qty`,
        [product.id, String(s.size), Number(s.qty)]
      );
      await query(
        `INSERT INTO stock_arrivals (product_id, size, qty, label_printed)
         VALUES ($1,$2,$3,FALSE)`,
        [product.id, String(s.size), Number(s.qty)]
      );
      await query(
        `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
         VALUES ($1,$2,$3,'arrival','product',$4)`,
        [product.id, String(s.size), Number(s.qty), product.id]
      );
    }
    const full = await getProduct(product.id);
    res.status(201).json({ ok: true, product: full });
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
