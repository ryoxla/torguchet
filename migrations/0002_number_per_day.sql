-- Нумерация документов: ПЛ- и РН- начинаются заново каждый день, ПН- каждый год.
-- Раньше номер был уникален за всё время, из-за чего «ПЛ-1» сегодня совпадал со старым «ПЛ-1».
-- Теперь уникальна пара «номер + день» (для приходных «номер + год»), день считается по Москве.
ALTER TABLE payments        DROP CONSTRAINT IF EXISTS payments_number_key;
ALTER TABLE orders_sale     DROP CONSTRAINT IF EXISTS orders_sale_number_key;
ALTER TABLE orders_purchase DROP CONSTRAINT IF EXISTS orders_purchase_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS payments_number_day_uq
  ON payments (number, ((created_at AT TIME ZONE 'Europe/Moscow')::date));
CREATE UNIQUE INDEX IF NOT EXISTS orders_sale_number_day_uq
  ON orders_sale (number, ((created_at AT TIME ZONE 'Europe/Moscow')::date));
CREATE UNIQUE INDEX IF NOT EXISTS orders_purchase_number_year_uq
  ON orders_purchase (number, (EXTRACT(year FROM created_at AT TIME ZONE 'Europe/Moscow')::int));
