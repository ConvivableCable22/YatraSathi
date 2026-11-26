-- YatraSathi Cloudflare D1 Migration 0003: Razorpay Test-Mode Payment Orders
-- Preserves all tables from 0001_email_delivery.sql and 0002_workspace_persistence.sql.
-- Target: Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  trip_id TEXT,
  product_sku TEXT NOT NULL,
  purpose TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode = 'test'),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'disabled')),
  webhook_event_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders (user_id, created_at DESC);
