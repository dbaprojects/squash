# Squash Club — Claude Reference

## Project identity
- **Name:** Squash Club Booking & Handicap Manager
- **Owner:** David Barkess — personal project, unrelated to SAP/DealSensAI work
- **Purpose:** Court session booking, player handicap tracking, weekly schedule management
- **Location:** `C:\Users\I061437\OneDrive\Projects\Squash`
- **Current version:** v2.0 (Supabase + GitHub Pages)

---

## CLAUDE.md maintenance — NON-NEGOTIABLE
Update this file after every non-trivial change. Record new patterns, gotchas, and design decisions. Living technical journal.

---

## Architecture

- **Backend:** Node.js + Express (`server.js`)
- **DB adapter pattern:** `db/index.js` picks adapter from `DB_BACKEND` env var
  - `db/sqlite.js` — local dev (better-sqlite3, synchronous API)
  - `db/supabase.js` — production stub (all methods throw; implement when migrating)
- **Frontend:** Single-page app — `public/index.html` + `public/app.js` + `public/style.css`
- **Auth:** Session-based (`express-session` + SQLite session store locally)
  - Local: enter email → instant login if found in players table
  - Prod (Supabase): swap `routes/auth.js` to call `supabase.auth.signInWithOtp`
- **No framework, no build step** — vanilla JS fetch-based SPA

---

## Running locally

```bash
cd "C:\Users\I061437\OneDrive\Projects\Squash"
npm install
node db/seed.js        # creates squash.db with seed data
npm start              # http://localhost:3000
```

Seed login emails:
- `admin@squashclub.local` (admin)
- `alice@squashclub.local`
- `bob@squashclub.local`

---

## File structure

```
server.js              — Express entry; mounts all routes; session middleware
db/
  index.js             — exports chosen adapter (DB_BACKEND env var)
  sqlite.js            — full SQLite implementation (better-sqlite3, sync)
  supabase.js          — stub; implement when switching to Supabase
  schema-sqlite.sql    — SQLite DDL
  schema-supabase.sql  — Postgres/Supabase DDL (run in Supabase SQL editor)
  seed.js              — dev seed data
routes/
  auth.js              — login/logout/me; exports requireSession + requireAdmin middleware
  players.js           — /api/me, /api/players CRUD, /api/players/:id/handicaps
  events.js            — /api/events CRUD + /api/events/generate-week
  templates.js         — /api/templates CRUD
  signups.js           — /api/signups CRUD
public/
  index.html           — SPA shell (2 top-level views: #view-login, #view-app)
  app.js               — all frontend logic; ST = global state object
  style.css            — minimal mobile-friendly styles
```

---

## Data model summary

| Table | Key columns |
|---|---|
| `players` | id, email (unique), first_name, last_name, is_admin, current_handicap, active |
| `handicap_history` | id, player_id, handicap_value (-35 to +10), changed_at, changed_by, notes |
| `session_templates` | id, name, day_of_week (1=Mon,3=Wed,6=Sat), start_time, end_time, max_signups |
| `events` | id, title, event_date, start_time, end_time, max_signups, template_id |
| `signups` | id, event_id, signed_up_by, player_id (nullable), guest_name (nullable), is_reserve |

**Signup constraint (app-level):** exactly one of `player_id` or `guest_name` must be set.
`signed_up_by` = who performed the action; `player_id` = who is attending (may differ).

**Attendance:** implicit — presence in `signups` = attended. No separate attendance column.

---

## Adapter interface (both adapters must implement)

```
players:   list(), get(id), getByEmail(email), create(data), update(id, data), deactivate(id)
handicaps: history(playerId), add({playerId, value, changedBy, notes})
events:    list(from, to), get(id), create(data), update(id, data), delete(id), findByTemplateAndDate(templateId, date)
templates: list(), get(id), create(data), update(id, data), delete(id)
signups:   forEvent(eventId), countForEvent(eventId), findPlayerOnEvent(eventId, playerId), get(id), add(data), remove(id)
```

SQLite adapter is synchronous (better-sqlite3). Supabase adapter must be async — routes use `await` so both work.

---

## Generate-week logic

`POST /api/events/generate-week` (admin)
- Accepts optional `{weekStartDate: 'YYYY-MM-DD'}` — defaults to next Monday
- For each active template: computes date for that `day_of_week` within the target week
- Skips if an event already exists with same `template_id` + `event_date` (idempotent)
- `day_of_week`: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
- Date arithmetic uses UTC noon to avoid DST edge cases in `dateForDow()`

---

## Reserve logic

- When `event.max_signups` is set and `signups.countForEvent()` >= max: `is_reserve = true`
- No hard block — anyone can sign up; overflow is auto-flagged
- Reserve count shown in event detail UI with yellow badge

---

## Frontend state (ST object in app.js)

```js
ST = {
  player: null,       // current session player (set after login)
  players: [],        // all players — loaded lazily for admin dropdown
  events: [],         // upcoming events from GET /api/events
  templates: [],      // session templates
  currentEvent: null  // event detail being viewed
}
```

---

## Auth middleware (routes/auth.js)

- `requireSession` — sets `req.player`; returns 401 if no session
- `requireAdmin` — calls `requireSession` then checks `req.player.is_admin`; returns 403 if not admin
- Both exported and imported by all other route files

---

## Gotchas & decisions

- **`node:sqlite` (built-in)** used instead of `better-sqlite3` — no native compilation required. Available in Node 22+; stable in Node 24+. API is nearly identical to better-sqlite3 (`prepare().run()`, `.get()`, `.all()`).
- **Session store:** `memorystore` (pure JS, in-memory). Sessions survive server runtime but reset on restart — acceptable for local dev. For production, swap to a persistent store.
- **SQLite `is_admin`/`is_reserve`/`active`** stored as INTEGER (0/1) — SQLite has no BOOLEAN. Route responses return them as JS booleans.
- **Players dropdown in signup form:** only loaded when `is_admin = true` (non-admins can only sign up themselves or a guest). All players are pre-loaded into `ST.players` on first click.
- **`ensurePlayers()`** in app.js pre-loads the players list lazily on first interaction with the app view.
- **Date display:** `fmtDate()` uses `dateStr + 'T12:00:00'` (local noon) to prevent timezone-off-by-one when rendering dates.
- **`deactivate` vs delete:** Players are soft-deleted (active=0). They still appear in `signups` history but cannot log in and don't appear in the active player list.

---

## Migrating to Supabase

1. Run `db/schema-supabase.sql` in the Supabase SQL editor
2. Implement all methods in `db/supabase.js` using `supabase.from(...)`
3. Update `routes/auth.js` to use `supabase.auth.signInWithOtp` + OTP verify flow
4. Set env vars: `DB_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
5. Note: Supabase uses UUID natively; SQLite uses `crypto.randomUUID()` strings — both are UUID strings, compatible

---

## Versioning
Increment version comment in this file and add a note below for each meaningful change.

| Version | Description |
|---|---|
| v1.0 | Initial build — SQLite backend, all core features |
| v1.1 | Schedule card redesign: Join/Cancel top-left, horizontal attendee chips (green=confirmed, amber=reserve, blue=guest), inline Add Guest when signed up; user switcher dropdown in header; 12 total test players in seed |
| v1.2 | Join/Cancel button moved to RHS of card, larger; admin events filter (upcoming/past/date-range); `db/seed-history.js` generates 10 weeks past + next week at 80-110% capacity; fixed `forEvent` missing `player_first` field causing "Guest" chip bug |
| v2.0 | Migrated to Supabase (DB + Auth) + GitHub Pages; removed Express backend from production path; Google OAuth replaces email login; user switcher removed; docs/app.js uses Supabase JS client directly; normaliseSignup/normaliseEvent map nested responses to existing field names |
