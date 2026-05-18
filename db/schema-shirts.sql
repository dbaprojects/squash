-- BC Club Shirt Order 2026 — run in Squash Supabase SQL editor
-- Temporary table — delete after order closes

CREATE TABLE IF NOT EXISTS shirt_orders (
  member_number TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT,
  orders        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shirt_orders ENABLE ROW LEVEL SECURITY;

-- Open policy — no Supabase Auth; member_number is the sole identifier
CREATE POLICY "shirt_orders_all" ON shirt_orders
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
