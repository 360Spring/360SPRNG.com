-- 360SPRNG — D1 schema
-- Reflects the ACTUAL live "360sprng-orders" schema, pulled directly from
-- production on 2026-09-09 (previous version of this file was hand-written
-- and had drifted: no `id` column, `ref` as PRIMARY KEY instead of UNIQUE,
-- `total` as REAL instead of INTEGER, and neither index below was applied).
--
-- Safe to run against a fresh database — every statement is idempotent:
--   wrangler d1 execute 360sprng-orders --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ref             TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  country         TEXT,
  address         TEXT,
  city            TEXT,
  region          TEXT,
  postal          TEXT,
  digital_address TEXT,
  notes           TEXT,
  items           TEXT NOT NULL,
  total           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (email);
