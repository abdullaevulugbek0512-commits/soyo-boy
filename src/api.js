import { Router } from 'express';
import { pool } from './db.js';
import { verifyInitData } from './auth.js';
import { createOrder, OrderError, deliveryFee } from './orders.js';

let cache = { at: 0, data: null };
export const invalidateCatalog = () => { cache = { at: 0, data: null }; };

export function makeApi({ botToken, onOrderCreated }) {
  const api = Router();

  api.get('/catalog', async (_req, res) => {
    try {
      if (!cache.data || Date.now() - cache.at > 20000) {
        const cats = await pool.query('SELECT id, slug, name_uz, name_ru FROM categories ORDER BY sort');
        const prods = await pool.query(`
          SELECT p.id, c.slug AS category, p.name_uz, p.name_ru, p.price,
                 CASE WHEN p.sale_price IS NOT NULL AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
                      THEN p.sale_price END AS sale_price,
                 p.images,
                 COALESCE(json_agg(json_build_object('id', v.id, 'color_uz', v.color_uz, 'color_ru', v.color_ru,
                          'hex', v.color_hex, 'size', v.size, 'stock', v.stock) ORDER BY v.id)
                          FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
          FROM products p
          JOIN categories c ON c.id = p.category_id
          LEFT JOIN variants v ON v.product_id = p.id
          WHERE p.active
          GROUP BY p.id, c.slug, c.sort
          ORDER BY c.sort, p.id`);
        cache = { at: Date.now(), data: { categories: cats.rows, products: prods.rows } };
      }
      res.set('Cache-Control', 'no-store').json({ ...cache.data, delivery_fee: deliveryFee() });
    } catch (err) {
      console.error('Katalog xatosi:', err.message);
      res.status(500).json({ error: 'server' });
    }
  });

  api.post('/order', async (req, res) => {
    const user = verifyInitData(req.body?.initData, botToken);
    if (!user) return res.status(401).json({ error: 'auth' });
    try {
      const id = await createOrder(user, req.body);
      onOrderCreated(id).catch((e) => console.error('Mijozga xabar yuborib bo‘lmadi:', e.message));
      res.json({ ok: true, id });
    } catch (err) {
      if (err instanceof OrderError) {
        const status = err.code === 'stock' || err.code === 'gone' ? 409 : err.code === 'too_many' ? 429 : 400;
        invalidateCatalogIf(err.code);
        return res.status(status).json({ error: err.code, detail: err.detail });
      }
      console.error('Buyurtma xatosi:', err.message);
      res.status(500).json({ error: 'server' });
    }
  });

  return api;
}
const invalidateCatalogIf = (code) => { if (code === 'stock' || code === 'gone') invalidateCatalog(); };
