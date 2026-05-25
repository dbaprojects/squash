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

-- Default config
INSERT INTO ladder_config (key, value) VALUES ('division_size', '9')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO ladder_config (key, value) VALUES ('challenge_range', '3')
  ON CONFLICT (key) DO NOTHING;

-- ── Challenges ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ladder_challenges (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  challenged_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message            TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  -- status: 'pending' | 'accepted' | 'declined' | 'completed' | 'forfeited'
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  winner_id          UUID REFERENCES players(id),
  result_recorded_by UUID REFERENCES players(id)
);
ALTER TABLE ladder_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges_open" ON ladder_challenges FOR ALL USING (TRUE) WITH CHECK (TRUE);
