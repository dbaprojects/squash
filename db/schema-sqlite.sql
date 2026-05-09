CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  current_handicap REAL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS handicap_history (
  id              TEXT PRIMARY KEY,
  player_id       TEXT NOT NULL REFERENCES players(id),
  handicap_value  REAL NOT NULL,
  changed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  changed_by      TEXT NOT NULL REFERENCES players(id),
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS session_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,  -- 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 0=Sun
  start_time  TEXT NOT NULL,     -- HH:MM
  end_time    TEXT NOT NULL,     -- HH:MM
  max_signups INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  event_date  TEXT NOT NULL,     -- YYYY-MM-DD
  start_time  TEXT NOT NULL,     -- HH:MM
  end_time    TEXT NOT NULL,     -- HH:MM
  max_signups INTEGER,
  template_id TEXT REFERENCES session_templates(id),
  notes       TEXT,
  created_by  TEXT NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signups (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  signed_up_by  TEXT NOT NULL REFERENCES players(id),
  player_id     TEXT REFERENCES players(id),
  guest_name    TEXT,
  is_reserve    INTEGER NOT NULL DEFAULT 0,
  signed_up_at  TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_signups_event ON signups(event_id);
CREATE INDEX IF NOT EXISTS idx_handicap_player ON handicap_history(player_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
