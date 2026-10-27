import { pool } from './db.js';

const SIZES = {
  shim: ['30', '32', '34', '36', '38'],
  kurtka: ['S', 'M', 'L', 'XL', 'XXL'],
  oyoq: ['40', '41', '42', '43', '44', '45'],
  koylak: ['S', 'M', 'L', 'XL', 'XXL'],
  kardigan: ['S', 'M', 'L', 'XL'],
};

// Format: o'zbekcha nom | ruscha nom | rang (uz) | rang (ru) | rang kodi | narx (so'm) | chegirma %
// DIQQAT: narxlar sinov uchun, haqiqiy narxlarni admin paneldan kiritasan.
const DATA = {
  shim: [
    "Klassik shim|Классические брюки|Qora|Чёрный|#1b1b1b|280000|0",
    "Jinsi shim|Джинсы|Ko'k|Синий|#6f94c4|320000|15",
    "Kargo shim|Карго|Yashil|Зелёный|#4b5232|340000|0",
    "Sport shim|Спортивные штаны|Kulrang|Серый|#b9b9b9|220000|0",
    "Keng jinsi|Широкие джинсы|Qora|Чёрный|#2a2a2a|350000|0",
    "Lenen shim|Льняные брюки|Bezh|Бежевый|#dccfb6|300000|20",
    "Yo'lli sport shim|Спортивные штаны с полосками|Qora|Чёрный|#1b1b1b|240000|0",
    "Chinos shim|Чиносы|To'q ko'k|Тёмно-синий|#1f2b4d|290000|0",
    "Kargo jogger|Карго-джоггеры|Qora|Чёрный|#1b1b1b|330000|0",
    "Velvet shim|Вельветовые брюки|Krem|Кремовый|#eadfc8|310000|0",
  ],
  kurtka: [
    "Jinsi kurtka|Джинсовая куртка|Qora|Чёрный|#2a2a2a|480000|0",
    "Charm kurtka|Кожаная куртка|Qora|Чёрный|#1b1b1b|1150000|10",
    "Varsity kurtka|Варсити куртка|To'q ko'k|Тёмно-синий|#1f2b4d|690000|0",
    "Field kurtka|Полевая куртка|Yashil|Зелёный|#4b5232|620000|0",
    "Puffer kurtka|Пуховик|Qora|Чёрный|#1b1b1b|890000|20",
    "Harrington kurtka|Куртка Харрингтон|Bezh|Бежевый|#d9c7a4|540000|0",
    "Jun kurtka|Шерстяная куртка|To'q kulrang|Тёмно-серый|#3d3d3d|760000|0",
    "Shamol o'tkazmas kurtka|Ветровка|Qora|Чёрный|#1b1b1b|420000|0",
    "Zamsha kurtka|Замшевая куртка|Jigarrang|Коричневый|#6b4426|980000|0",
    "Trench kurtka|Тренч|Qora|Чёрный|#1b1b1b|830000|0",
  ],
  oyoq: [
    "Klassik tufli|Классические туфли|Qora|Чёрный|#1b1b1b|520000|0",
    "Oq krossovka|Белые кроссовки|Oq|Белый|#f4f4f4|480000|0",
    "Sport krossovka|Спортивные кроссовки|Qora-kulrang|Чёрно-серый|#2a2a2a|450000|10",
    "Yugurish krossovkasi|Беговые кроссовки|Qora|Чёрный|#1b1b1b|560000|0",
    "Basketbol krossovkasi|Баскетбольные кроссовки|Oq-qora|Бело-чёрный|#e8e8e8|690000|0",
    "Zamsha mokasin|Замшевые мокасины|Qora|Чёрный|#1b1b1b|420000|0",
    "Chelsi botinka|Ботинки челси|Qora|Чёрный|#1b1b1b|640000|15",
    "Baland krossovka|Высокие кроссовки|Qora-oq|Чёрно-белый|#e8e8e8|720000|0",
    "Massiv krossovka|Массивные кроссовки|Qora|Чёрный|#1b1b1b|590000|0",
    "Yengil krossovka|Лёгкие кроссовки|Oq-kulrang|Бело-серый|#dcdcdc|540000|0",
  ],
  koylak: [
    "Klassik ko'ylak|Классическая рубашка|Oq|Белый|#fafafa|190000|0",
    "Klassik ko'ylak|Классическая рубашка|Qora|Чёрный|#1b1b1b|190000|0",
    "Chiziqli ko'ylak|Рубашка в полоску|Moviy|Голубой|#a9c4e8|210000|0",
    "Lenen ko'ylak|Льняная рубашка|Bezh|Бежевый|#dccfb6|230000|15",
    "Yozgi ko'ylak|Летняя рубашка|Qora|Чёрный|#1b1b1b|170000|0",
    "Flanel ko'ylak|Фланелевая рубашка|Katak|Клетка|#555555|240000|0",
    "Denim ko'ylak|Джинсовая рубашка|Ko'k|Синий|#4f79ad|260000|0",
    "Overshirt|Овершёрт|Yashil|Зелёный|#4b5232|280000|0",
    "Polo ko'ylak|Рубашка поло|Oq|Белый|#fafafa|160000|0",
    "Dizaynli ko'ylak|Дизайнерская рубашка|Qora|Чёрный|#1b1b1b|300000|0",
  ],
  kardigan: [
    "Klassik kardigan|Классический кардиган|Qora|Чёрный|#1b1b1b|260000|0",
    "Trikotaj kardigan|Трикотажный кардиган|Bezh|Бежевый|#e6dccb|280000|0",
    "Oversize kardigan|Оверсайз кардиган|Kulrang|Серый|#4a4a4a|300000|10",
    "Kollej kardigan|Колледж кардиган|To'q ko'k|Тёмно-синий|#1f2b4d|340000|0",
    "Zip kardigan|Кардиган на молнии|Qora|Чёрный|#1b1b1b|320000|0",
    "Cho'ntakli kardigan|Кардиган с карманами|Yashil|Зелёный|#3f4a2f|290000|0",
    "Sport kardigan|Спортивный кардиган|Kulrang|Серый|#b4b4b4|270000|0",
    "Naqshli kardigan|Кардиган с узором|Qora-oq|Чёрно-белый|#2a2a2a|380000|0",
    "Jun kardigan|Шерстяной кардиган|Jigarrang|Коричневый|#6b4426|360000|0",
    "Qalin kardigan|Плотный кардиган|Krem|Кремовый|#eadfc8|350000|0",
  ],
};

export async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products');
  if (rows[0].n > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cats = await client.query('SELECT id, slug FROM categories');
    const catId = Object.fromEntries(cats.rows.map((c) => [c.slug, c.id]));
    const saleEnds = new Date(Date.now() + 30 * 24 * 3600 * 1000);

    for (const [slug, items] of Object.entries(DATA)) {
      let n = 0;
      for (const line of items) {
        n += 1;
        const [nameUz, nameRu, colUz, colRu, hex, price, pct] = line.split('|');
        const priceNum = Number(price);
        const sale = Number(pct) > 0 ? Math.round((priceNum * (100 - Number(pct))) / 100 / 1000) * 1000 : null;
        const p = await client.query(
          `INSERT INTO products (category_id, name_uz, name_ru, price, sale_price, sale_ends_at, images)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [catId[slug], nameUz, nameRu, priceNum, sale, sale ? saleEnds : null, [`/img/${slug}-${n}.jpg`]]
        );
        for (const size of SIZES[slug]) {
          await client.query(
            `INSERT INTO variants (product_id, color_uz, color_ru, color_hex, size, stock)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [p.rows[0].id, colUz, colRu, hex, size, 5]
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log('Sinov kiyimlari qo‘shildi (50 ta).');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
