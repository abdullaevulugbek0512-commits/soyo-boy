import { pool } from './db.js';

export const ownerIds = () =>
  (process.env.OWNER_IDS || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
export const deliveryFee = () => Math.max(0, Math.round(Number(process.env.DELIVERY_FEE || 0)) || 0);
export const money = (n, lang = 'uz') =>
  Number(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + (lang === 'ru' ? ' сум' : " so'm");

export class OrderError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

export async function customerLang(id) {
  const { rows } = await pool.query('SELECT lang FROM customers WHERE telegram_id = $1', [id]);
  return rows[0]?.lang === 'ru' ? 'ru' : 'uz';
}

export async function createOrder(user, body) {
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const address = String(body.address ?? '').trim();
  if (name.length < 2 || name.length > 80) throw new OrderError('bad_name');
  if (!/^\+?[0-9\s()-]{7,20}$/.test(phone)) throw new OrderError('bad_phone');
  if (address.length < 5 || address.length > 300) throw new OrderError('bad_address');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw new OrderError('bad_items');

  const want = new Map();
  for (const it of body.items) {
    const id = Number(it.variant_id);
    const qty = Number(it.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new OrderError('bad_items');
    want.set(id, (want.get(id) || 0) + qty);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO customers (telegram_id, first_name, username) VALUES ($1,$2,$3)
       ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name, username = EXCLUDED.username`,
      [user.id, user.first_name ?? null, user.username ?? null]
    );
    await client.query('UPDATE customers SET phone = $2 WHERE telegram_id = $1', [user.id, phone]);

    const pending = await client.query(
      "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status IN ('awaiting_payment','payment_check')",
      [user.id]
    );
    if (pending.rows[0].n >= 3) throw new OrderError('too_many');

    const { rows } = await client.query(
      `SELECT v.id, v.color_uz, v.size, v.stock, p.name_uz,
              CASE WHEN p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
                   THEN p.sale_price ELSE p.price END AS unit_price
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = ANY($1) AND p.active`,
      [[...want.keys()]]
    );
    if (rows.length !== want.size) throw new OrderError('gone');
    let itemsTotal = 0;
    for (const v of rows) {
      const qty = want.get(v.id);
      if (v.stock < qty) throw new OrderError('stock', `${v.name_uz} ${v.color_uz} ${v.size}`);
      itemsTotal += v.unit_price * qty;
    }
    const fee = deliveryFee();
    const o = await client.query(
      `INSERT INTO orders (customer_id, customer_name, items_total, delivery_fee, phone, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [user.id, name, itemsTotal, fee, phone, address]
    );
    for (const v of rows) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, color, size, qty, unit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [o.rows[0].id, v.id, v.name_uz, v.color_uz, v.size, want.get(v.id), v.unit_price]
      );
    }
    await client.query('COMMIT');
    return o.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrder(id, lang = 'uz') {
  const o = await pool.query(
    `SELECT o.*, c.username, c.lang FROM orders o JOIN customers c ON c.telegram_id = o.customer_id WHERE o.id = $1`, [id]);
  if (!o.rows[0]) return null;
  const items = await pool.query(
    `SELECT oi.qty, oi.unit_price, oi.size,
            CASE WHEN $2 = 'ru' THEN p.name_ru ELSE p.name_uz END AS name,
            CASE WHEN $2 = 'ru' THEN v.color_ru ELSE v.color_uz END AS color
     FROM order_items oi JOIN variants v ON v.id = oi.variant_id JOIN products p ON p.id = v.product_id
     WHERE oi.order_id = $1 ORDER BY oi.id`, [id, lang]);
  return { ...o.rows[0], items: items.rows };
}

// Mijozning oxirgi to'lanmagan buyurtmasiga chek biriktiradi
export async function attachReceipt(customerId, receipt) {
  const { rows } = await pool.query(
    `SELECT id, status FROM orders WHERE customer_id = $1 AND status IN ('awaiting_payment','payment_check')
     ORDER BY id DESC LIMIT 1`, [customerId]);
  if (!rows[0]) return { state: 'none' };
  if (rows[0].status === 'payment_check') return { state: 'already', id: rows[0].id };
  const u = await pool.query(
    `UPDATE orders SET status = 'payment_check', receipt_file_id = $2
     WHERE id = $1 AND status = 'awaiting_payment' RETURNING id`, [rows[0].id, receipt]);
  return u.rowCount ? { state: 'ok', id: rows[0].id } : { state: 'already', id: rows[0].id };
}

// Egasi tasdiqlaganda: qoldiq kamayadi (ikki kishi oxirgi donani ololmaydi), buyurtma "paid" bo'ladi
export async function confirmPayment(orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = await client.query('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o.rows[0]) { await client.query('ROLLBACK'); return { state: 'missing' }; }
    if (o.rows[0].status !== 'payment_check') { await client.query('ROLLBACK'); return { state: 'already', status: o.rows[0].status }; }
    const items = await client.query(
      `SELECT oi.variant_id, oi.qty, oi.product_name, oi.color, oi.size FROM order_items oi WHERE oi.order_id = $1`, [orderId]);
    for (const it of items.rows) {
      const u = await client.query('UPDATE variants SET stock = stock - $2 WHERE id = $1 AND stock >= $2', [it.variant_id, it.qty]);
      if (!u.rowCount) {
        await client.query('ROLLBACK');
        return { state: 'nostock', item: `${it.product_name} ${it.color} ${it.size}` };
      }
    }
    await client.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [orderId]);
    await client.query('COMMIT');
    return { state: 'ok' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectPayment(orderId) {
  const u = await pool.query(
    `UPDATE orders SET status = 'awaiting_payment', receipt_file_id = NULL
     WHERE id = $1 AND status = 'payment_check' RETURNING id`, [orderId]);
  return u.rowCount ? { state: 'ok' } : { state: 'already' };
}
