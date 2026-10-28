-- Saxiy Bazar bot: baza tuzilmasi (qayta ishga tushganda xavfsiz, hech narsani o'chirmaydi)

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id),
  name_uz TEXT NOT NULL,
  name_ru TEXT NOT NULL,
  description_uz TEXT,
  description_ru TEXT,
  price INT NOT NULL CHECK (price >= 0),
  sale_price INT CHECK (sale_price >= 0),
  sale_ends_at TIMESTAMPTZ,
  images TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Har bir rang + razmer uchun alohida qoldiq
CREATE TABLE IF NOT EXISTS variants (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_uz TEXT NOT NULL,
  color_ru TEXT NOT NULL,
  color_hex TEXT,
  size TEXT NOT NULL,
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, color_uz, size)
);

CREATE TABLE IF NOT EXISTS customers (
  telegram_id BIGINT PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  phone TEXT,
  lang TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: awaiting_payment, payment_check, paid, ready, cancelled
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(telegram_id),
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  items_total INT NOT NULL,
  delivery_fee INT NOT NULL DEFAULT 0,
  phone TEXT,
  address TEXT,
  receipt_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INT NOT NULL REFERENCES variants(id),
  product_name TEXT NOT NULL,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price INT NOT NULL
);

-- role: owner (hammasini boshqaradi) yoki staff (faqat buyurtmani ko'radi va "tayyor" qiladi)
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Karta raqami, yetkazib berish narxi, egasining Telegram ID si shu yerda turadi
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id) WHERE active;

INSERT INTO categories (slug, name_uz, name_ru, sort) VALUES
  ('shim',      'Shimlar',       'Брюки',        1),
  ('kurtka',    'Kurtkalar',     'Куртки',       2),
  ('oyoq',      'Oyoq kiyimlar', 'Обувь',        3),
  ('koylak',    'Ko''ylaklar',   'Рубашки',      4),
  ('jemper',    'Jemperlar',     'Джемперы',     5),
  ('kardigan',  'Kardiganlar',   'Кардиганы',    6)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
