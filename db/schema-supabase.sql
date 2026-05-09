-- Run in Supabase SQL editor

CREATE TABLE players (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  current_handicap NUMERIC,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE handicap_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id),
  handicap_value  NUMERIC NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by      UUID NOT NULL REFERENCES players(id),
  notes           TEXT
);

CREATE TABLE session_templates (
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

CREATE TABLE events (
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

CREATE TABLE signups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  signed_up_by  UUID NOT NULL REFERENCES players(id),
  player_id     UUID REFERENCES players(id),
  guest_name    TEXT,
  is_reserve    BOOLEAN NOT NULL DEFAULT FALSE,
  signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes         TEXT
);

CREATE INDEX idx_signups_event ON signups(event_id);
CREATE INDEX idx_handicap_player ON handicap_history(player_id);
CREATE INDEX idx_events_date ON events(event_date);
