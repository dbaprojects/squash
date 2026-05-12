-- Run in Supabase SQL editor after schema-supabase.sql

CREATE TABLE IF NOT EXISTS hof_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_month     DATE NOT NULL,        -- always 1st of month
  winner_name     TEXT,                 -- NULL when not_played
  winner_hc       NUMERIC,              -- HC at time of play
  winner_score    INTEGER,              -- NULL for pre-2026 records
  runner_up_name  TEXT,
  runner_up_hc    NUMERIC,
  runner_up_score INTEGER,
  not_played      BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_by      UUID REFERENCES players(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hof_month ON hof_results(event_month);

ALTER TABLE hof_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hof_select" ON hof_results
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "hof_admin_all" ON hof_results
  FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());
