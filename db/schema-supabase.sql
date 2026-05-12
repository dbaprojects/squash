-- Run in Supabase SQL editor
-- Full schema + RLS for Squash Club app

CREATE TABLE IF NOT EXISTS players (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  is_super_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  current_handicap NUMERIC,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  phone            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handicap_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id),
  handicap_value  NUMERIC NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by      UUID NOT NULL REFERENCES players(id),
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS session_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,  -- 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 0=Sun
  start_time  TEXT NOT NULL,     -- HH:MM
  end_time    TEXT NOT NULL,     -- HH:MM
  max_signups INTEGER,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID NOT NULL REFERENCES players(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  event_date  DATE NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  max_signups INTEGER,
  template_id UUID REFERENCES session_templates(id),
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES players(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  signed_up_by  UUID NOT NULL REFERENCES players(id),
  player_id     UUID REFERENCES players(id),
  guest_name    TEXT,
  is_reserve    BOOLEAN NOT NULL DEFAULT FALSE,
  signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_signups_event    ON signups(event_id);
CREATE INDEX IF NOT EXISTS idx_handicap_player  ON handicap_history(player_id);
CREATE INDEX IF NOT EXISTS idx_events_date      ON events(event_date);

-- ── Helper: check if calling auth user is admin ──────────────────────────────
-- SECURITY DEFINER bypasses RLS to avoid infinite recursion in player policies
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM players WHERE email = auth.email() AND active = TRUE LIMIT 1),
    FALSE
  );
$$;

-- ── Enable RLS ────────────────────────────────────────────────────────────────
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE signups           ENABLE ROW LEVEL SECURITY;

-- ── Players policies ──────────────────────────────────────────────────────────
CREATE POLICY "players_select" ON players
  FOR SELECT TO authenticated USING (active = TRUE OR is_admin_user());

CREATE POLICY "players_admin_all" ON players
  FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ── Events policies ───────────────────────────────────────────────────────────
CREATE POLICY "events_select" ON events
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "events_admin_all" ON events
  FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ── Templates policies ────────────────────────────────────────────────────────
CREATE POLICY "templates_select" ON session_templates
  FOR SELECT TO authenticated USING (active = TRUE OR is_admin_user());

CREATE POLICY "templates_admin_all" ON session_templates
  FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ── Signups policies ──────────────────────────────────────────────────────────
CREATE POLICY "signups_select" ON signups
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "signups_insert" ON signups
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "signups_delete" ON signups
  FOR DELETE TO authenticated
  USING (
    signed_up_by = (SELECT id FROM players WHERE email = auth.email() LIMIT 1)
    OR is_admin_user()
  );

-- ── Handicap history policies ─────────────────────────────────────────────────
CREATE POLICY "handicaps_select" ON handicap_history
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "handicaps_admin_all" ON handicap_history
  FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ── Migration: add is_super_admin (run once on existing DB) ──────────────────
-- ALTER TABLE players ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
