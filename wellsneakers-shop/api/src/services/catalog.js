import { query, withTransaction } from "../db.js";

export async function listProducts({ brand, size, q, inStockOnly = true, limit = 500, offset = 0 }) {
  const params = [];
  const where = ["p.active = TRUE"];
  if (brand) {
    params.push(brand);
    where.push(`p.brand = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(`(lower(p.name) LIKE $${params.length} OR lower(p.article) LIKE $${params.length} OR lower(p.barcode) LIKE $${params.length})`);
  }
  if (size) {
    params.push(size);
    where.push(`EXISTS (SELECT 1 FROM product_sizes s WHERE s.product_id = p.id AND s.size = $${params.length} AND s.qty > 0)`);
  }
  if (inStockOnly) {
    where.push(`EXISTS (SELECT 1 FROM product_sizes s WHERE s.product_id = p.id AND s.qty > 0)`);
  }
  const whereSql = where.join(" AND ");
  const countSql = `SELECT COUNT(*)::int AS total FROM products p WHERE ${whereSql}`;
  const { rows: countRows } = await query(countSql, params);
  const total = countRows[0]?.total || 0;

  params.push(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  params.push(Math.max(Number(offset) || 0, 0));
  const sql = `
    SELECT p.*,
      COALESCE(json_agg(json_build_object('size', s.size, 'qty', s.qty) ORDER BY s.size)
        FILTER (WHERE s.id IS NOT NULL ${inStockOnly ? "AND s.qty > 0" : ""}), '[]') AS sizes
    FROM products p
    LEFT JOIN product_sizes s ON s.product_id = p.id
    WHERE ${whereSql}
    GROUP BY p.id
    ORDER BY p.name
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await query(sql, params);
  return { products: rows, total, limit: params[params.length - 2], offset: params[params.length - 1] };
}

export async function getProduct(idOrArticle) {
  const byId = /^\d+$/.test(String(idOrArticle));
  const { rows } = await query(
    `
    SELECT p.*,
      COALESCE(json_agg(json_build_object('size', s.size, 'qty', s.qty) ORDER BY s.size)
        FILTER (WHERE s.id IS NOT NULL), '[]') AS sizes,
      COALESCE((
        SELECT json_agg(json_build_object('url', i.url, 'sort_order', i.sort_order) ORDER BY i.sort_order)
        FROM product_images i WHERE i.product_id = p.id
      ), '[]') AS images
    FROM products p
    LEFT JOIN product_sizes s ON s.product_id = p.id
    WHERE ${byId ? "p.id = $1" : "p.article = $1 OR p.barcode = $1"}
    GROUP BY p.id
    `,
    [idOrArticle]
  );
  return rows[0] || null;
}

/** Kassa-style autocomplete: article / name. By default only sizes with qty > 0. */
export async function searchForSale(filter, { includeZero = false } = {}) {
  const q = String(filter || "").trim();
  if (!q) return [];
  const having = includeZero
    ? "TRUE"
    : "SUM(CASE WHEN s.qty > 0 THEN s.qty ELSE 0 END) > 0";
  const sizeFilter = includeZero ? "" : "FILTER (WHERE s.qty > 0)";
  const { rows } = await query(
    `
    SELECT p.id, p.name, p.brand, p.article, p.barcode, p.price_byn,
      COALESCE(json_agg(json_build_object('size', s.size, 'qty', s.qty) ORDER BY s.size)
        ${sizeFilter}, '[]') AS sizes
    FROM products p
    LEFT JOIN product_sizes s ON s.product_id = p.id
    WHERE p.active AND (
      p.article ILIKE $1 OR p.barcode ILIKE $1 OR p.name ILIKE $2
    )
    GROUP BY p.id
    HAVING ${having}
    ORDER BY
      CASE WHEN p.article = $3 OR p.barcode = $3 THEN 0 ELSE 1 END,
      p.name
    LIMIT 20
    `,
    [q, `%${q}%`, q]
  );
  return rows;
}

export async function createSale({ staffUserId, items, paymentMethod, delivery, discountByn, comment, paidCash, paidCard }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("empty_items"), { status: 400 });
  }
  return withTransaction(async (client) => {
    let total = 0;
    const normalized = [];
    for (const item of items) {
      const qty = Number(item.qty) || 1;
      const price = Number(item.price_byn);
      const { rows: prows } = await client.query(
        `SELECT id, name, article, price_byn FROM products WHERE id = $1 AND active`,
        [item.product_id]
      );
      const product = prows[0];
      if (!product) throw Object.assign(new Error("product_not_found"), { status: 404 });
      const { rows: srows } = await client.query(
        `SELECT qty FROM product_sizes WHERE product_id = $1 AND size = $2 FOR UPDATE`,
        [product.id, item.size]
      );
      const stock = srows[0];
      if (!stock || stock.qty < qty) {
        throw Object.assign(new Error("insufficient_stock"), { status: 409, detail: { article: product.article, size: item.size } });
      }
      const linePrice = Number.isFinite(price) ? price : Number(product.price_byn);
      total += linePrice * qty;
      normalized.push({
        product_id: product.id,
        size: String(item.size),
        qty,
        price_byn: linePrice,
        product_name: product.name,
        article: product.article,
      });
    }
    const discount = Number(discountByn) || 0;
    total = Math.max(0, total - discount);

    const { rows: saleRows } = await client.query(
      `INSERT INTO sales (operation, staff_user_id, payment_method, delivery, discount_byn, total_byn, paid_cash_byn, paid_card_byn, comment)
       VALUES ('sale', $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        staffUserId || null,
        paymentMethod || "cash",
        Boolean(delivery),
        discount,
        total,
        Number(paidCash) || 0,
        Number(paidCard) || 0,
        comment || "",
      ]
    );
    const sale = saleRows[0];
    for (const line of normalized) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, size, qty, price_byn, product_name, article)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sale.id, line.product_id, line.size, line.qty, line.price_byn, line.product_name, line.article]
      );
      await client.query(
        `UPDATE product_sizes SET qty = qty - $1 WHERE product_id = $2 AND size = $3`,
        [line.qty, line.product_id, line.size]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
         VALUES ($1,$2,$3,'sale','sale',$4)`,
        [line.product_id, line.size, -line.qty, sale.id]
      );
    }
    return sale;
  });
}

export async function createWebsiteOrder({ customerName, phone, address, fulfillment, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("empty_items"), { status: 400 });
  }
  return withTransaction(async (client) => {
    let total = 0;
    const normalized = [];
    for (const item of items) {
      const qty = Number(item.qty) || 1;
      const { rows: prows } = await client.query(
        `SELECT id, name, article, price_byn FROM products WHERE id = $1 AND active`,
        [item.product_id]
      );
      const product = prows[0];
      if (!product) throw Object.assign(new Error("product_not_found"), { status: 404 });
      const { rows: srows } = await client.query(
        `SELECT qty FROM product_sizes WHERE product_id = $1 AND size = $2 FOR UPDATE`,
        [product.id, item.size]
      );
      if (!srows[0] || srows[0].qty < qty) {
        throw Object.assign(new Error("insufficient_stock"), { status: 409 });
      }
      const price = Number(product.price_byn);
      total += price * qty;
      normalized.push({
        product_id: product.id,
        size: String(item.size),
        qty,
        price_byn: price,
        product_name: product.name,
        article: product.article,
      });
    }

    const orderNumber = await nextOrderNumber(client);
    const { rows: orows } = await client.query(
      `INSERT INTO website_orders (order_number, customer_name, phone, address, fulfillment, total_byn)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orderNumber, customerName, phone, address || "", fulfillment || "pickup", total]
    );
    const order = orows[0];
    for (const line of normalized) {
      await client.query(
        `INSERT INTO website_order_items (order_id, product_id, size, qty, price_byn, product_name, article)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, line.product_id, line.size, line.qty, line.price_byn, line.product_name, line.article]
      );
      await client.query(
        `UPDATE product_sizes SET qty = qty - $1 WHERE product_id = $2 AND size = $3`,
        [line.qty, line.product_id, line.size]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
         VALUES ($1,$2,$3,'website_order','website_order',$4)`,
        [line.product_id, line.size, -line.qty, order.id]
      );
    }
    return { order, items: normalized };
  });
}

async function nextOrderNumber(client) {
  const { rows } = await client.query(
    `INSERT INTO app_meta (key, value) VALUES ('order_seq', '1')
     ON CONFLICT (key) DO UPDATE SET value = (app_meta.value::int + 1)::text
     RETURNING value`
  );
  const n = String(rows[0].value).padStart(5, "0");
  return `WS-${n}`;
}

export async function updateOrderStatus(orderId, status) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM website_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = rows[0];
    if (!order) throw Object.assign(new Error("not_found"), { status: 404 });
    if (order.status === "cancelled") throw Object.assign(new Error("already_cancelled"), { status: 409 });

    if (status === "cancelled" && order.status !== "cancelled") {
      const { rows: items } = await client.query(
        `SELECT * FROM website_order_items WHERE order_id = $1`,
        [orderId]
      );
      for (const line of items) {
        await client.query(
          `INSERT INTO product_sizes (product_id, size, qty) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, size) DO UPDATE SET qty = product_sizes.qty + EXCLUDED.qty`,
          [line.product_id, line.size, line.qty]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, size, delta, reason, ref_type, ref_id)
           VALUES ($1,$2,$3,'cancel','website_order',$4)`,
          [line.product_id, line.size, line.qty, orderId]
        );
      }
    }

    const { rows: updated } = await client.query(
      `UPDATE website_orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [orderId, status]
    );
    return updated[0];
  });
}
