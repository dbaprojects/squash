-- Division Ladder tables
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS ladder_positions (
  player_id  UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL UNIQUE,   -- 1-based overall rank; division derived from this
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ladder_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ladder_open" ON ladder_positions FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS ladder_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE ladder_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ladder_config_open" ON ladder_config FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Default division size (9 players per division = 4 divisions for ~36 players)
INSERT INTO ladder_config (key, value) VALUES ('division_size', '9')
  ON CONFLICT (key) DO NOTHING;
