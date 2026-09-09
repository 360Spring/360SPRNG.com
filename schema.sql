-- 360SPRNG — D1 schema
-- Run once against a fresh database:
--   wrangler d1 execute 360sprng-orders --remote --file=./schema.sql
--
-- NOTE: the live repo has no checked-in schema file — this is reconstructed
-- from the column list in the existing _worker.js INSERT statement. If you're
-- pointing this build at the SAME database_id as the live site, you almost
-- certainly already have this table and can skip running this file.

CREATE TABLE IF NOT EXISTS orders (
  ref             TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  name            TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  country         TEXT,
  address         TEXT,
  city            TEXT,
  region          TEXT,
  postal          TEXT,
  digital_address TEXT,
  notes           TEXT,
  items           TEXT,
  total           REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (email);
