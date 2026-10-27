import { Router } from 'express';
import { pool } from './db.js';

export const api = Router();

let cache = { at: 0, data: null };

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
    res.set('Cache-Control', 'no-store').json(cache.data);
  } catch (err) {
    console.error('Katalog xatosi:', err.message);
    res.status(500).json({ error: 'server' });
  }
});
