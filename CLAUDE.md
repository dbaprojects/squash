# Squash Club — Claude Reference

## Project identity
- **Name:** BC Squash Section — Booking & Handicap Manager
- **Owner:** Club admin — personal project
- **Purpose:** Court session booking, player handicap tracking, weekly schedule management, Hall of Fame
- **Location:** `[local project directory]`
- **Current version:** v5.61
- **Production URL:** GitHub Pages (static, `docs/` branch)

---

## CLAUDE.md maintenance — NON-NEGOTIABLE
Update this file after every non-trivial change. Record new patterns, gotchas, and design decisions. Living technical journal.

---

## Architecture

- **Backend:** None in production — pure static SPA served from GitHub Pages (`docs/`)
- **Database:** Supabase (Postgres) — JS client v2 called directly from the browser
- **Auth:** Phone number login → localStorage session persistence; cookie fallback for iOS/PWA
  - On sign-in: user enters phone → matched against `players.phone` → confirm identity → `localStorage.setItem('squash_player', JSON.stringify(player))`
  - On reload: `localStorage` fast path → re-validates against Supabase; falls back to cookie
  - No Supabase Auth / OTP — all auth is app-level
- **Frontend:** Single-page app — `docs/index.html` + `docs/app.js` + `docs/style.css`
- **No framework, no build step** — vanilla JS, Supabase JS CDN, Chart.js CDN

---

## Supabase credentials

- **URL:** `[redacted — see app.js]`
- **Anon key:** `[redacted — see app.js]` (safe to be in client code)
- **Service role key:** stored in memory only — used for seed scripts, never committed

---

## File structure

```
docs/
  index.html          — SPA shell (production)
  dev.html            — SPA shell (development/staging — ladder.js loaded here first)
  app.js              — all frontend logic (~2700 lines)
  ladder.js           — Division Ladder feature; patches showSection/navTo/loadHome/loadAdminTab
  style.css           — mobile-first styles, BC navy/gold palette
  bcss.png            — BC crest logo
  manifest.json       — PWA manifest
  version.json        — {"version":"X.Y","build":"TIMESTAMP"} — remote version check for PWA cache bust
db/
  schema-supabase.sql — Postgres DDL for core tables
  schema-hof.sql      — DDL for hof_results table + RLS
  schema-audit.sql    — DDL for audit_log table + RLS
  schema-ladder.sql   — DDL for ladder_positions + ladder_config tables + RLS
  seed-ladder.sql     — One-time seed of initial ladder order from whiteboard
  load-hof.js         — seeds hof_results from hof.xlsx (run once with service role key)
  reseed.js           — rebuilds historical signups/handicap data
hof.xlsx              — source data for Hall of Fame (53 records, 2019–2026)
names and hcs.xlsx    — player name/HC reference data
```

---

## Data model

| Table | Key columns |
|---|---|
| `players` | id (UUID), first_name, last_name, phone, email, is_admin, is_super_admin, current_handicap, active, pending |
| `handicap_history` | id, player_id, handicap_value (-35 to +10), changed_at, changed_by, notes |
| `session_templates` | id, name, day_of_week (1=Mon,3=Wed,6=Sat), start_time, end_time, max_signups |
| `events` | id, title, event_date, start_time, end_time, max_signups, template_id |
| `signups` | id, event_id, signed_up_by, player_id (nullable), guest_name (nullable), is_reserve, signed_up_at, notes |
| `hof_results` | id, event_month (DATE, unique, always 1st), winner_name, winner_hc, winner_score, runner_up_name, runner_up_hc, runner_up_score, not_played, notes, created_by, created_at |
| `audit_log` | id, player_id, event_type, metadata (JSONB), created_at |
| `ladder_positions` | player_id (UUID PK → players), position (INTEGER UNIQUE), updated_at |
| `ladder_config` | key (TEXT PK), value (TEXT) — stores division_size and challenge_range |

**Signup constraint (app-level):** exactly one of `player_id` or `guest_name` must be set.
`signed_up_by` = who performed the action; `player_id` = who is attending (may differ).

**Attendance:** implicit — presence in `signups` = attended. No separate attendance column.

**`hof_results.event_month`:** always stored as `YYYY-MM-01` (first of month). Unique index enforces one result per month.

---

## RLS policy pattern

All tables use inline admin check (NOT a helper function — Supabase SQL editor can't resolve functions defined outside the policy):

```sql
COALESCE((SELECT is_admin FROM players WHERE email = auth.email() AND active = TRUE LIMIT 1), FALSE)
```

HoF SELECT policy allows anon access (`FOR SELECT USING (TRUE)` with no role restriction) because the app queries HoF before Supabase session is always restored on mobile.

---

## Player roles

| Field | Meaning |
|---|---|
| `active` | Can log in and appears in player lists |
| `pending` | Registered but awaiting admin approval |
| `is_admin` | Can manage events, players, HoF (view-only for HoF CRUD) |
| `is_super_admin` | Full access including HoF add/edit/delete |

HoF CRUD (add/edit/delete) is restricted to `is_super_admin` only — regular admins can view the admin HoF list but buttons are hidden.

---

## Frontend sections (nav views)

| View | ID | Load fn | Description |
|---|---|---|---|
| Sign-Up | `view-schedule` | `loadSchedule()` | Upcoming events with Join/Cancel and attendance chips |
| Handicaps | `view-ladder` | `loadLadder()` | Player HC list, grid, movers, distribution; player HC modal |
| HoF | `view-hof` | `loadHof()` | Hall of Fame — leaderboards + year-grouped results table |
| Division Ladder | `view-division-ladder` | `loadDivisionLadder()` | 2×2 grid of 4 divisions; player highlight + challenge zone; defined in ladder.js |
| Player detail | `view-player` | `openPlayerView()` | Full player profile — HC chart + attendance tabs |
| Audit log | `view-audit` | loaded inline | Super-admin only; event log with type/period filters |
| Admin | `view-admin` | tabs | Players, Events, Templates, HoF, Reports, Ladder (super_admin) |

---

## Key frontend state variables

```js
// Global
ST = { player, players, events, templates, currentEvent }

// Ladder (HC)
ladderPlayers, ladderSearch, ladderStatusFilter ('active'|'inactive'|'all')
playerHistoryArr, ladderMonths, ladderYearMode ('last12'|'YYYY')
ladderAllYears, ladderSectionView ('list'|'grid'|'movers'|'dist')
_playerHcChart, _distChart
_playerHcSeries, _playerHcPeriod, _playerSignupCount12m

// Division Ladder (ladder.js globals)
_ladderPositions  // [{position, player_id, players:{first_name,last_name,current_handicap}}]
_ladderDivSize    // from ladder_config.division_size (default 9)
_challengeRange   // from ladder_config.challenge_range (default 3)
_ladderInList     // admin reorder: ordered array of player_id
_ladderPool       // admin reorder: unranked player objects
_ladderAllPlayers // all active players

// HoF
hofResults, hofNameFilter, hofStatusFilter ('all'|'active'|'inactive')
hofPlayerMap  // normalized name → { active: bool } — for name matching in filter + edit form

// Reports
reportsFilter  // 'last12' | 'last2y' | 'last3y' | 'all' | 'YYYY'
```

---

## HC ladder logic

- `computeLadderMonths()` — derives `ladderMonths` array from `ladderYearMode`:
  - `'last12'` → rolling 12 months from today
  - current year → Jan to current month
  - past year → Jan–Dec of that year
- `buildFilledSeries(history)` — complete monthly series with carry-forward from first entry to today
- `effectiveHcAt(playerId, targetMonth)` — carry-forward HC value at a given month
- `getFilteredPlayers()` — shared filter by search text + status (active/inactive/all)
- HC chart y-axis: reversed, fixed range min:-35 max:6
- HC table row colors: `ph-row-improved` (green, HC decreased = better) / `ph-row-worsened` (orange, HC increased)

---

## HoF public view

- Filter bar: name search (applies to winner OR runner-up) + Active/Inactive/All status buttons
- Status filter matches names via `hofPlayerMap` built from players table
- Two side-by-side leaderboards: Most Titles (🏆) and Most #2's (🥈), top 5 each
- HC shown inline in brackets: "Player Name (-6)"
- Table: Month | Champion (HC) | Runner-Up (HC) | Score — no separate HC columns
- `hofPlayerMap` is built in `loadHof()` by fetching all players in parallel with hof_results

---

## HoF edit form

- `openHofForm(record)` calls `showFormModal(...)` — NOT `openFormModal` (that doesn't exist)
- Name fields show inline warning "Name not in player list" when entry doesn't match `hofPlayerMap`
- `hofCheckName(inputId, warnId)` — checks input value against hofPlayerMap on each keystroke

---

## Schedule / event cards

- No click-to-open detail — clicking a card does nothing (detail view `openEvent()` still exists but is not wired to card clicks)
- Admin/super-admin: each attendance chip has a `×` delete button calling `removeSignupChip(signupId, eventId)`
- `removeSignupChip()` deletes the signup and calls `promoteFirstReserve()` to backfill if needed

---

## Reports tab

- Period filter at top: Last 12m / Last 2y / Last 3y / All time / per-year buttons (years derived from earliest event)
- All data (KPIs, charts, attendance table) re-fetches on filter change via `renderReportsTab(filter)`
- `getReportsDateRange(filter)` returns `{ from, to, label }` for the chosen period
- Charts: Weekly Attendance (stacked bar) + Avg Fill Rate by Session
- New: **Most Frequent Players** table — derived from confirmed signups for events in the period (filtered by event_date, not signed_up_at)
- KPIs: Sessions, Total Attendances, Avg Fill %, Avg per Session

---

## Navigation model (v4.3+)

No nav tabs. The home screen is the hub; users navigate via home cards.

- **Header logo** (`#header-home-btn`) — always clickable, calls `goHome()`
- **`← Home` button** (`#btn-back-home`) — visible on all non-home sections
- **`#header-page-title`** — centered between logo and ← Home; set by `showSection()` from a titles map; empty string on home
- `showSection(id)` — shows the given section, toggles `#btn-back-home` visibility, sets `#header-page-title` text
- `goHome()` — calls `showSection('view-home') + loadHome()`
- `goToAdmin()` — admin-guarded, calls `showSection('view-admin') + loadAdminTab('tab-players')`
- `navTo(view, callback)` — navigate from home cards to schedule/ladder/hof/admin
- Sign-out + user-switch: now in the home footer (`#home-footer`), not in a hamburger menu
- `loadUserSwitcher()` populates `#home-switcher-dropdown` and shows `#home-user-switcher-wrap`

---



Used in Ladder and HoF: a `#xxx-filter-bar` div is inserted adjacent to the main content div. It's rebuilt on fresh data load but NOT rebuilt on subsequent filter-change renders — preserves input focus. For HoF specifically, `loadHof()` removes the old filter bar before re-creating it (ensures correct DOM position after nav).

---

## Modal / form modal functions

| Function | Purpose |
|---|---|
| `openModal()` / `closeModal()` | `#modal-overlay` — used for HC history modal |
| `showFormModal(title, html)` | `#form-overlay` — used for all CRUD forms |
| `closeFormModal()` | Closes `#form-overlay` |

Do NOT use `openFormModal` — it doesn't exist. Always use `showFormModal`.

---

## PWA

- `manifest.json` in `docs/`; theme color `#1B2A6B`; Apple touch icon `bcss-transparent.png`
- Install banner: iOS shows "Add to Home Screen" instructions; Android shows native install prompt
- `localStorage.pwa_dismissed` prevents re-showing after dismissal

---

## Seed / utility scripts

```bash
# Load HoF data from hof.xlsx (run once)
SUPABASE_SERVICE_ROLE_KEY=... node db/load-hof.js

# Rebuild historical signups + handicap history
SUPABASE_SERVICE_ROLE_KEY=... node db/reseed.js

# Insert 6 test challenges covering all visible status combos (safe — no position changes)
# Run in Supabase SQL editor: db/seed-test-challenges.sql
```

---

## Division Ladder (ladder.js)

The division ladder is implemented entirely in `docs/ladder.js`, loaded after `app.js`. It uses monkey-patching to extend app behaviour without modifying `app.js` directly — useful for feature development before promotion to production.

**Monkey-patches applied (IIFE at top of ladder.js):**
- `showSection` — adds `view-division-ladder` to the hidden-section list; sets header title to "Ladders"
- `navTo` — intercepts `'division-ladder'` route and calls `loadDivisionLadder()`
- `loadHome` — fetches ladder data in parallel with the original call; injects Ladders home tile
- `loadAdminTab` — handles `'tab-ladder'`; shows Ladder tab button for super_admin

**Division derivation:** always computed as `ceil(position / _ladderDivSize)` — no division column. Changing `division_size` in `ladder_config` re-bands all players automatically.

**Home tile** (`#home-card-division-ladder`): always removed and re-created in `_injectLadderHomeCard()` to prevent stale data. **Dev** shows "🍺 LADDERS ⚔️" centred title + flat list of active+recent rows (capped at 6) + "View all ladder info →" footer. **Prod** shows "Ladders" title + D1–D4 grid (top 3 per division) + active challenges. Row format: `[icon] winner v loser` — icon carries meaning (⏳ pending, 🎾 accepted, 🍺 completed, 🐔 declined/dodged, 👻 forfeited/ghosted); winner always LHS. Must be inserted before the admin card.

**`winner_pos_change`** column in `ladder_challenges`: stores winner's position improvement. **`loser_pos_change`** column: places the loser dropped — always 1 for normal results and declines; may be several for forfeits (challenged drops to just below challenger).

**Forfeit logic (`_applyForfeitResult`)**: removes challenged from the sorted list, reinserts after challenger, renumbers all positions. `winner_pos_change = 0` — challenger gets no jump reward. Challenger may shift up by 1 as a natural side-effect of the reshuffling.

**`db/seed-test-challenges.sql`**: inserts 6 test entries (pending, accepted, completed×2, declined, forfeited) using player IDs from `ladder_positions`. Safe — does not modify positions.

**Public view:** 2×2 grid of 4 division cards. Logged-in player row highlighted amber. Players within `_challengeRange` positions above show green ▲ badge. Last division shows all remaining players (may exceed `_ladderDivSize`). Banner above grid; Rules of Engagement below.

**Admin reorder** (super_admin, Admin → Ladder tab): HTML5 drag-and-drop within "In Ladder" list; drag from "Not in Ladder" pool. Save does DELETE all + INSERT new positions (not upsert) to handle removals cleanly. Division size and challenge range configurable via `saveAdminConfig()` which upserts to `ladder_config`.

**Null guard:** Supabase FK join can return `players: null` if player was deleted. Always guard with `p.players &&` or `.filter(p => p.players)`.

---

## WhatsApp integration

Current state (v5.18–5.20): super_admin players list has a WA button that opens a pre-filled `wa.me` / `web.whatsapp.com` message. Manual send — no API.

Considered options for deeper integration:

| Approach | Effort | Cost | Notes |
|---|---|---|---|
| `wa.me` links | Zero | Free | User manually sends; good for share/notify buttons anywhere in app |
| Meta WhatsApp Business Cloud API | Medium | Free (low vol) | Automated templated messages; needs Meta Business account + approved templates |
| Twilio / MessageBird | Low–medium | Per-message fee | Wraps Meta API, easier setup, handles verification complexity |
| Inbound webhook (reply commands) | High | — | Players text "CANCEL Wed" → auto-removes signup; needs persistent HTTPS endpoint |

**Preferred path if automated notifications are built:**
- Trigger: Supabase Edge Function (database webhook or scheduled)
- Channel: Meta Cloud API (free tier sufficient for club volume)
- Use cases in priority order: ladder challenge issued/accepted, session reminder (24h), admin alert for pending player approval, sign-up confirmation

**Constraint:** No backend in production — all automation must live in Supabase Edge Functions.

---

## Doom easter egg

`docs/doom.html` — standalone page, triggered from the home screen.
- Uses **js-dos v6.22** (CDN) + **DOSBox WASM**
- Loads `docs/doom.ZIP` (Doom shareware Episode 1, id Software freely-distributable) from same origin
- BC navy/gold header styling, `← Back to Squash` link
- **Trigger:** 5-second press-and-hold on the HCRR home tile — panel fills red bottom-to-top during hold; normal tap still navigates to HoF
- **Desktop:** keyboard controls hint shown after load
- **Mobile:** virtual joystick (left) + SHOOT/USE/ESC buttons (right); joystick fires arrow key events on direction change, supports diagonals, 12px dead zone
- **iOS gotchas fixed:** synthetic `mousedown` after `touchend` blocked (600ms guard); touchmove >10px aborts timer; `-webkit-touch-callout:none` on trophy image suppresses iOS save/share popup
- SHOOT button fires both Ctrl (weapon) and Enter (menu select)
- Custom squash-themed sprites discussed but not implemented

---

## Gotchas & decisions

- **`is_admin_user()` SQL function does NOT work** in Supabase SQL editor — inline the check directly in each policy
- **HoF SELECT policy must allow anon** — mobile Safari sometimes hasn't restored the Supabase session when the HoF query runs; data is not sensitive
- **HC carry-forward:** `buildFilledSeries()` fills every calendar month from first HC entry to today, carrying forward the last known value. Chart shows 0-radius points for carry-forward months
- **Signup reserve promotion:** `promoteFirstReserve()` is called after any signup deletion (leave or admin chip delete) to backfill from the reserve list
- **Reports attendance query:** uses events in the date range (filtered by `event_date`) with nested signups — NOT `signed_up_at` — so the period correctly reflects when sessions occurred
- **HoF event_month:** stored as `YYYY-MM-01` string; `fmtHofMonth()` displays as "Jan 2026" etc.
- **Date display:** `fmtDate()` uses `dateStr + 'T12:00:00'` (local noon) to prevent timezone off-by-one
- **`deactivate` vs delete:** Players are soft-deleted (`active=false`). They appear in history but can't log in
- **`pending` players:** submitted registration but not yet approved by admin
- **Phone normalisation:** `normalizePhone()` strips all non-digits before matching — handles spaces, dashes, country codes

---

## Versioning

**Version bump checklist** — update all of these on every push:
- `APP_VERSION = '4.XX'` in `docs/app.js` (no `v` prefix)
- `v4.XX` display strings in `docs/index.html` (×2: login + header)
- `v4.XX` display strings in `docs/dev.html` (×2: login + header)
- `style.css?v=4.XX`, `app.js?v=4.XX`, `ladder.js?v=4.XX` query strings in `docs/index.html`
- `style.css?v=4.XX`, `app.js?v=4.XX`, `ladder.js?v=4.XX` query strings in `docs/dev.html`
- `docs/version.json` — run: `echo "{\"version\":\"4.XX\",\"build\":\"$(date +%s)\"}" > docs/version.json`

**CRITICAL: `version.json` must be updated on EVERY commit that changes any JS or CSS**, even if the version number doesn't change. The PWA detects updates via the build timestamp — if `version.json` is not updated, PWA users will not receive the new code.

`sed 's/v4\.XX/v4.YY/g'` misses `APP_VERSION` and the `?v=` query strings. Use `sed` for `dev.html` bulk-replace but update `app.js` and `index.html` explicitly.

**iOS PWA cache — MUST do on every push:**
`version.json` has a `build` timestamp field. On startup, `app.js` fetches it with `cache:'no-store'` and compares against `localStorage._app_build`. If either the version or build differs, it does:
```js
location.replace(location.pathname + '?_cb=' + build);
```
Using the **build timestamp** (not version) as the cache-bust parameter means `index.html?_cb=BUILD_TS` is always a URL iOS has never cached → forces fresh HTML → fresh HTML has new `?v=` query strings → fresh assets.

Always update `version.json` before every push:
```bash
echo "{\"version\":\"4.XX\",\"build\":\"$(date +%s)\"}" > docs/version.json
```

| Version | Description |
|---|---|
| v1.0 | Initial build — SQLite backend, all core features |
| v1.1 | Schedule card redesign: Join/Cancel, horizontal attendee chips, inline Add Guest, user switcher |
| v1.2 | Join/Cancel moved RHS; admin events filter; `db/seed-history.js`; fixed `player_first` chip bug |
| v2.0 | Migrated to Supabase + GitHub Pages; Google OAuth; `docs/` replaces `public/`; normaliseSignup/normaliseEvent |
| v2.1 | BC rebrand (navy/gold, crest logo, PWA); Reports tab (Chart.js); chip short names; `db/reseed-supabase.js` |
| v3.0 | Phone number auth replaces Google OAuth; localStorage session + cookie fallback for iOS/PWA |
| v3.5 | Onboarding flow (confirm/register/pending); phone input with country picker |
| v3.8 | Admin players: search, active/inactive filter, condensed rows, phone field, sort |
| v3.9 | Ladder overhaul: HC chart (inverted y-axis, -35 to +6), movers, distribution, last-12m default year selector, green/orange HC history rows; removed sparklines |
| v4.0 | Hall of Fame: `hof_results` table, load script from hof.xlsx (53 records), HoF nav tab, public view (leaderboard + year table), admin CRUD |
| v4.1 | HoF: name/status filters, Most #2's leaderboard, condensed HC-in-brackets layout, edit form fixed (showFormModal), name matching warning, super-admin-only CRUD; chip × delete for admin; player modal signup count (12m); Reports: period filter + Most Frequent Players attendance table |
| v4.2 | HoF autocomplete + HC auto-fill in edit form; RLS fix for anon-key DML (`db/fix-rls-anon.sql`); home dashboard first pass |
| v4.3 | Home dashboard redesign: nav tabs + hamburger removed; logo navigates home; `← Home` back button; 5 cards (Me/navy/HC trend, Sign-Up/session list, Handicaps/section stats, HoF/trophy, Admin/pending); sign-out + user-switch in home footer |
| v4.4 | Me card: name-only header (no "ME" label), dynamic font scaling, "Handicap:"/"Attendance:" prefixes; Sign-Up card: "Click to Sign-up" label, 5 rows + "+ N more" indicator, no "View all" link; data consistency: full HC history fetch, is_reserve=false filter in modal signup count; reseed script generates current+next week events with light signups |
| v4.5 | Mobile streamlining: page title in header bar (between logo and ← Home button, centered via flex:1), filter/picker area tightened (fonts reduced to 11–12px, padding tightened on nav bar / filter rows / role buttons), movers column headers simplified to "Improved" / "Worsened" |
| v4.6 | HoF redesign: removed subtitle; leaderboard moved to top (all-time, status filter only, unaffected by name/year); filter bar below leaderboard with name input + year dropdown (default All) + status buttons; results filtered by name+year+status; compact table (12px font, table-layout:fixed, 5px padding, ellipsis on name cols) |
| v4.7 | HC edit form: date field defaults to today, allows backdating; `changed_at` passed explicitly to Supabase insert |
| v4.8 | HoF: status buttons moved inside leaders card (All / Active Players Only); filter bar simplified to single row (name + Year label + year dropdown); month column shows short month only; Movers: left-justified columns (flex:0 auto); Ladder: removed Inactive button (Active / All only) |
| v4.9 | Sign-Up redesign: compact 2-per-row cards; enrolled state = pale green tint + ✓ Enrolled badge; names hidden by default, expand inline via count button (6/12 ▾); day-grouped horizontal layout; `btn-join--sm` / `btn-leave--sm` compact button variants |
| v4.10 | Sequential minor versioning (not reset at 9); version bumped on every push; 5 files to update: app.js, index.html (×4), version.json |
| v4.11 | Sign-Up: full date dividers "Monday, 13 May 2026"; day prefix removed from card title |
| v4.12 | PWA stale-cache fix: remote version.json fetched with cache:'no-store' on startup; version guard checks `_cb=VERSION` exactly (not just `_cb=`) |
| v4.13 | Responsive scaling: tablet (768px+) and desktop (1100px+) breakpoints; larger fonts, wider max-width, more padding at larger sizes; home grid 3-col at tablet+ |
| v4.14 | Responsive: tablet max-width reduced to 760px |
| v4.15 | Login/onboard: bcss.png logo (200px), removed redundant "British Club / Squash Section" text |
| v4.16 | Login: dial-code-btn padding matches phone input (8px 10px) so heights align |
| v4.17 | Login: dial-code-btn and phone-local both explicit height:44px to force equal sizing |
| v4.18 | Me card: "Handicap:" → "HC:", "Attendance:" → "Attended", both lines font-size 13px |
| v4.19 | Rename HCCR → HCRR in HoF home card label |
| v4.20 | HoF home card: winner01-small.png replaces trophy emoji, sized 52×52px |
| v4.21 | Version bump to force PWA cache refresh after image assets were added |
| v4.22 | HoF home card: winner image enlarged to 70px |
| v4.23 | HoF home card: champ name 12px, month 11px |
| v4.24 | Switch user restricted to super_admin; switcher wrap re-hidden on every loginSuccess |
| v4.25 | Mobile font size pass: body 14→15px; ev-title 14→15px, ev-meta 11→12px, day-header 11→13px, count-btn 12→13px, hc-lb-name/delta 13→14px, hof-table 12→13px, player-name 13→14px, form labels 12→13px |
| v4.26 | Font size +1px across the board: body 16px, ev-title 16px, day-header 14px, hc-lb 15px, hof-table 14px |
| v4.27 | Sign-up screen redesign: 2-column card grid → single-column tap-to-join row list; `.ev-row` replaces `.event-card`; tap row to join/view; Leave is underlined text link; enrolled state = green left border + #f0fdf4 tint |
| v4.28 | Sign-up timeline redesign: navy day-circle (abbr + num) + vertical line; 3-col session row (time | title+progress | JOIN/ENROLLED button); 12h time display; progress bar; names panel on player-count tap |
| v4.29 | Sign-up: remove fill progress bar; fix timeline vline (align-items:stretch); ENROLLED button disenrolls on click; ▾ chevron on player count row rotates when names open |
| v4.30 | Sign-up: timeline line navy + connected (::after pseudo-element, bottom:-28px bridges margin gap); smaller buttons (12px); remove hover-red on ENROLLED; enrolled card no longer green tinted |
| v4.31 | HoF leaders: chip font 12→15px, count badge 11→12px, status buttons 11→13px |
| v4.32 | Admin players table: phone column always visible on mobile (col-role still hidden on mobile) |
| v4.33 | HoF results redesigned as timeline: year circles + connecting line + per-month cards (🏆 winner / 🥈 runner-up / score); replaces table layout |
| v4.34 | Admin players filter: also searches phone number (digits stripped for partial match) |
| v4.35 | Fix admin player filter: v4.34 had bug where empty qDigits made phone.includes("") always true, breaking name search; guard with qDigits.length check |
| v4.36 | Header banner: `banner01.png` dark squash court photo as header background with dark overlay; header padding increased (20px/16px mobile, 20px/24px tablet, 22px/32px desktop); logo 44px; taller visual presence |
| v4.37 | Me card: name font 18→22px; HC line "Handicap has improved/worsened X over 12m" full phrase (no triangle); sessions "Played N sessions (12m)"; both lines 15px |
| v4.38 | Me card: HC and sessions lines 14px bold |
| v4.39 | Header: more height — padding 36px/30px mobile+tablet, 40px/34px desktop |
| v4.40 | Me card: HC and sessions lines 13px bold |
| v4.41 | Fix .myhc-trend CSS class overriding inline font-size — set to 13px 700 |
| v4.42 | Sign-Up home card: empty state shows racket01.png + random quip; booked state shows small racket + "N sessions available!" + enrolled sessions only |
| v4.43 | Sign-Up card: remove racket01.png refs (not in repo yet); add "Click to sign-up →" footer on both states |
| v4.44 | Sign-Up card: centre "Click to sign-up →" footer |
| v4.45 | Sign-Up card: restore racket01.png (file confirmed in docs/) — big on empty, small on booked |
| v4.46 | HoF home card: switch winner01-small.png → winner02-small.png; add untracked winner02-small.png to git |
| v4.47 | Sign-Up home card booked state: show signup count (e.g. 6/12) on each enrolled session row |
| v4.48 | Sign-Up tile: "N sessions available" shows unenrolled count only; hidden if zero |
| v4.49 | Admin players: replace table with two-row cards (name+HC / phone+actions); works on mobile and desktop |
| v4.50 | Admin players: click card to edit; Deact/Restore/Delete moved into edit form with status badge and HC row; removed card buttons |
| v4.51 | Admin events: signup count + expandable list per event; delete warns if signups exist; tighter mobile row padding. Admin templates: tighter mobile. HoF admin: table replaced with two-line cards. CSS: ae-* and hof-admin-card classes added |
| v4.52 | Player modal: two tabs — Handicap (default, existing chart+table) and Attendance (3 stat boxes: all-time/12m/this year + per-year table); fetches all confirmed signups with event_date on open |
| v4.53 | Player info replaced modal with full in-app view (view-player section); header/banner stays visible; ← Back button returns to calling view (home or ladder); openPlayerView(id, name, returnView) replaces openPlayerHcModal |
| v4.54 | Player view: Me-card banner at top (full width, navy, name+HC+rank+trend+sessions); no player name in header title; buildPlayerBannerHtml() reuses home-card-me styles + player-banner-card modifier |
| v4.55 | Fix player banner trend: monthKey() format is YYYY.MM (dots) not YYYY-MM — cutoff12m was using dashes so string compare always failed, pastVal always null |
| v4.56 | Fix openPlayerView crash on names with apostrophes (e.g. Sa'ed) — remove playerName from onclick entirely; look up name from ladderPlayers/ST.player by ID inside openPlayerView |
| v4.57 | HC trend shows actual data period: "in N months" not hardcoded "over 12 months". New helpers: monthsDiff, computeHcTrendFromArr, hcTrendHtml. Used in home Me card, ladder My HC card, player banner. Removed redundant myHcRes DB query from loadHome. |
| v4.58 | Home grid: HoF card always half-width (not full-width for non-admin); Admin card gets grid-column:1/-1 since it's alone on row 3 |
| v4.59 | Terms of Use modal: link on login screen, home footer, and global app-footer on all sections |
| v4.60 | Fix duplicate Terms of Use on home: hide app-footer when view-home is active (showSection toggle) |
| v4.61 | Terms: add Opting Out clause — advise organising committee to withdraw data |
| v4.62 | Fix admin events signup count (ambiguous FK — use players!player_id); admin home card shows upcoming sessions with enrollment |
| v4.63 | Admin home tile: hide pending badge when zero (no "All clear"); show "N pending approval(s)" only when needed |
| v4.64 | Audit log: new audit_log table (db/schema-audit.sql); logs session_start, session_resume, login_not_found, login_pending, login_error, registration_submitted; super_admin-only Audit tile on home + detail modal (last 30 days) |
| v4.65 | Audit log: full in-app view (view-audit) replaces modal; type + period filters; delete-all with confirmation; admin tile "Upcoming Sessions" section label |
| v4.66 | Fix audit double-logging on session resume — pass source to loginSuccess instead of calling auditLog separately |
| v4.67 | Audit log: move delete-all button to top of page |
| v4.68 | Audit tile stats: unified session types (start+resume), renamed to Sessions(7d), added Unique users(7d), removed New regs |
| v4.69 | Sign-Up home tile: green ✓ tick on each enrolled session row |
| v4.70 | Home footer: "Install as App" link; fix style.css/app.js query string versioning; Sign-Up card header text tweaks |
| v4.71 | Audit log: name filter input, Unique users toggle, Today period button, default period changed to 7d |
| v4.72 | Audit log: "Delete my test logs" button removes only super admin entries; "Delete all logs" remains for full wipe |
| v4.80 | Division Ladder Phase 1: ladder_positions + ladder_config tables; docs/ladder.js patches showSection/navTo/loadHome/loadAdminTab; 2×2 grid public view with logged-in player highlight + green ▲ challenge zone (3 above); super-admin drag-and-drop reorder in Admin → Ladder tab; home tile "Ladders" shows top 3 per division; dev.html only |
| v4.81 | Promote ladder feature to production (index.html); force iOS cache refresh via version bump |
| v4.82 | Fix iOS PWA cache: bump version to escape stuck v4.81 cache; reload URL now uses build timestamp (?_cb=BUILD) so iOS always fetches fresh HTML+assets |
| v4.83 | Challenge system (Phase 2, dev.html only): ladder_challenges table; ⚔️ button on challengeable rows; issue form with 20 random messages; login popup for pending challenges; accept/decline (decline = lose 1 place); record match result; cascade position update on challenger win; single-drop on challenger loss or decline; auto-forfeit after 7 days; active challenges on home tile and ladder page |
| v4.84 | Challenge messages expanded to 100 cheeky/beer-themed entries |
| v4.85 | Challenge form: 🔀 Shuffle button cycles through messages; ladder rules moved below division tables as "Rules of Engagement"; "Throw down a challenge!" stays at top |
| v4.86 | Fix challenge popup: replace _challengesNotified boolean with _notifiedChallengeIds Set so popup fires on every loadHome() for any challenge not yet shown in this session; guards against stacking modals |
| v4.87 | Challenge: Decline (Injury) option — no penalty, status 'declined_injury'; popup locked until player responds (X hidden, overlay blocked); Me tile shows last 3 personal challenges with status; max-3 active challenges per player enforced on issue |
| v4.88 | Challenge row icons: ⏳ (pending) and 🎾 (game on!) replace ⚔️ when a challenge is active; clicking them opens unified resolution modal with record-result + Withdraw button (pending only); Withdraw sets status='withdrawn' |
| v4.89 | Fix: inbound challenges now show ⏳/🎾 on the challenger's row (below me) — previously only outgoing challenges (above me) showed the icon |
| v4.90 | Admin tabs: horizontally scrollable on iOS — overflow-x:auto + scrollbar hidden + white-space:nowrap + flex-shrink:0 so Ladder tab is never clipped |
| v4.91 | Admin tabs: replace scroll approach with pill-style wrapping tray (grey bg, white active chip, flex-wrap) — no scrolling needed, tabs wrap to second row on narrow screens |
| v4.92 | Ladder admin drag: add touch drag (iOS Safari) via touchstart/touchmove/touchend with non-passive listener; fix PC scroll-to-top on drop by saving/restoring window.scrollY + list scrollTop via requestAnimationFrame; visual dragging/hover states |
| v4.93 | Gate Phase 2 challenge system behind _CHALLENGES_ENABLED flag (true only on dev.html) — production shows Phase 1 ladder only; no challenge buttons, banners, popups, or auto-forfeit |
| v4.94 | Show handicap in brackets after each player name in ladder view (both prod+dev): e.g. "Jamie S (-13)"; .div-hc CSS class for grey text |
| v4.95 | Rules of Engagement rule 2 updated: "Other than injury, you can't refuse a challenge (else you slip a place!)" — prod+dev |
| v4.96 | HC Calculator: "HC Calc" button in Handicaps filter bar; modal with netting-off algorithm — both negative/positive net off, straddle zero no net, shift +1 per 6-point diff, cap +7; computeHcStarts() pure function |
| v4.97 | HC Calc moved to full-width amber banner in Handicaps section; always-visible score boxes (show "--" until both inputs valid, live update); PWA: `visibilitychange` listener fires version check on iOS foreground resume (DOMContentLoaded never re-fires on PWA suspend/resume); audit logs `app_version` on every session_start/resume; favicon 404 + deprecated apple-mobile-web-app-capable meta fixed in index.html + dev.html |
| v4.98 | Prod challenge zone: green ▲ highlight rows visible without challenge buttons; dev Ladders home tile: 🍺 LADDERS ⚔️ centred title, flat active+recent rows (⏳ pending, 🎾 accepted, 🍺 won, 🐔 declined, 👻 ghosted/forfeited); winner always LHS; unified "[icon] winner v loser" format; 6-row cap + "View all ladder info →" footer; `winner_pos_change` stored in `ladder_challenges` at match completion; `db/seed-test-challenges.sql` covers all 6 visible status combos |
| v4.99 | Ladder tile rows redesigned as 5-column grid: `[icon] [left-name] v [right-name] [icon]` — icons on far edges, names right/left-aligned toward centre; ⚔️⚔️ pending/accepted (replaced 🎾 tennis racket offensive to squash players), 🍺/😢 result, 🍺/🐔 declined, 🍺/👻 forfeited; no bold/colour on names; `.dlcr-ic/.dlcr-nl/.dlcr-v/.dlcr-nr` CSS classes; `_cr()` helper in ladder.js |
| v5.00 | Version bump to force iOS PWA cache refresh |
| v5.01 | Me tile: hcTrendHtml removes 'Handicap has' prefix, '12 months' → '(12m)'; trend + sessions lines right-justified; 'View full history →' → 'Click to view...' centred; all `.home-card-link` elements centred via CSS; ladders tile footer → 'Click to view all →' centred |
| v5.02 | Forfeit rule change: challenged drops to just below challenger (no big jump for challenger); new `_applyForfeitResult()` — removes challenged, reinserts after challenger, renumbers; `winner_pos_change=0` for forfeits; new `loser_pos_change` column records places dropped (1 for normal/decline, N for forfeit); `db/migration-loser-pos-change.sql` |
| v5.03 | Rules of Engagement rewritten — 8 rules with emoji (🍺😢🐔👻), late-arrival clause ("we're not tennis players"), ghost rule, injury rule; rendered in ladder.js |
| v5.04 | Rules of Engagement moved to modal — amber ⚔️ button below ladder grid calls `showLadderRules()` → `showFormModal`; 15px font in modal; injury rule updated with doctor's certificate joke |
| v5.05 | Rules button moved to top (above grid); admin note moved inside modal as amber info box |
| v5.06 | Me tile: show only pending/accepted/injury challenges; injury only within last 7 days |
| v5.07 | Ladder challenge access: only challenger/challenged can click rows (admin bypass removed); super_admin-only withdraw override; results query includes declined_injury with no row limit; 2-col panel layout (LHS history with icon filters ⚔️🍺🐔🤒👻, RHS active) |
| v5.08 | Audit log: remove limit(500) for all-time period — was cutting off older users from unique view; bounded periods use limit(1000) |
| v5.09 | Version bump to consolidate v5.06–v5.08 changes |
| v5.10 | Ladder challenges panel: History moved to RHS, Active LHS; dropdown filter inline with History header (⚔️ All / 🍺 Win / 😢 Lose / 🐔 Decline / 👻 Forfeit / 🩹 Injury) |
| v5.11 | Challenges history: filter dropdown font reduced 12→10px |
| v5.12 | Challenges history: Win/Lose personal filters removed — replaced with single section-wide ⚔️ Played filter |
| v5.13 | History rows: dual icons — 🍺 winner / 😢 loser for completed; 🍺 winner / 👻 loser ghosted for forfeit; 🩹 + both names for injury |
| v5.14 | Challenges history filter: ⚔️ replaces 🎾 racket for All option — iOS renders racket emoji as tennis ball |
| v5.15 | Challenges history: ♾️ replaces ⚔️ for All filter; accepted challenge icon 🎾 → 💥 in ladder rows |
| v5.16 | History rows: declined format — 🐔 dodger + 🍺 challenger who issued the challenge (challenger deserves beer) |
| v5.17 | HC Calculator: cap starting scores at +6 (was +7); explanatory text updated; CLAUDE.md PII removed |
| v5.18 | Admin players: WhatsApp button (super_admin only) beside each player — opens wa.me with pre-filled "Squash Section Business: " message |
| v5.19 | WhatsApp button: desktop routes to web.whatsapp.com/send (no prompt); mobile keeps wa.me (opens app) |
| v5.20 | WA button: window.open with named target 'whatsapp_web' — reuses same tab on subsequent clicks |
| v5.21 | Doom easter egg: 5s press-and-hold on HCRR home tile launches doom.html; red panel fills bottom-to-top during hold; normal tap still navigates to HoF; `_initDoomEgg()` called after every `loadHome()` |
| v5.22 | Doom: navigate same tab (`window.location.href`) instead of `window.open` — fixes popup blocker on PC and iOS |
| v5.23 | Doom egg: abort timer on touchmove >10px (prevents scroll triggering doom); `moved` flag guards `release()` from navigating to HoF after a scroll gesture |
| v5.24 | Suppress iOS long-press save/share callout on HoF trophy image (`-webkit-touch-callout: none`) |
| v5.25 | Doom egg: block synthetic `mousedown` fired by iOS after `touchend` (was setting a ghost 5s timer); clear stale timer at top of `start()` |
| v5.26 | Doom mobile controls: replace D-pad buttons with virtual joystick (120px circular base, 52px draggable knob, 34px travel, 12px dead zone); diagonal directions supported; keys fired only on state change; action buttons (SHOOT/USE/ESC) unchanged on right |
| v5.27 | Doom egg charge animation: full panel fills bottom-to-top (scaleY) instead of thin line left-to-right (scaleX) |
| v5.28 | Admin templates: secondary sort by start_time after day_of_week — fixes out-of-order display |
| v5.29 | Duplicate signup prevention: `_joiningEvent` / `_submittingSignup` in-flight boolean flags on `joinEvent` and `submitSignup`; TOCTOU race where double-tap could pass duplicate check before first insert completed; `finally` block always resets flags |
| v5.30 | HC tile shows all active players (not just those with HC set); HC inputs changed to `type=text inputmode=decimal` for Android minus key; shirtsadmin.html: new By Member card with per-member shirt count and amount due |
| v5.31 | HC Calculator: ± toggle button beside each input — negates value on tap; fixes missing minus key on iOS/Android (`inputmode=numeric`) |
| v5.38 | HC Calculator: replaced text inputs + ± button with custom numeric keypad (3×4 grid); − key toggles sign; ⌫ backspace; tapping player box switches focus; auto-advances to Player B after 2-digit entry |
| v5.38 | HC Calculator keypad: touch-action:manipulation prevents iOS zoom on button tap |
| v5.38 | Sign-Up: show player handicap in brackets on name chips when session title contains "HCRR" |
| v5.38 | Admin HC edit + add-player form: ± toggle button for negative values on iOS/Android |
| v5.38 | Admin HC modal: close on save (no re-entry bug); Edit and Delete buttons on each history row |
| v5.38 | Admin Ladder tab (dev): Challenges section — lists all challenges with status/players/date + Delete per row; super_admin only |
| v5.39 | Admin Ladder challenges: multi-select checkboxes + bulk delete; name filter searches challenger/challenged names |
| v5.40 | Ladders home tile (dev): personal view — "Can challenge" (players in range, not already matched) + "My challenges" (active pending/accepted); falls back to D1-D4 grid if not on ladder |
| v5.41 | Ladders home tile: challenge rows replaced with 2-column chip tiles to save vertical space |
| v5.42 | Ladders home tile tiles: remove icons, "vs" prefix, and position number — name only (+ status on active challenges) |
| v5.43 | Ladders home tile: remove status label from active challenge tiles — name only |
| v5.44 | Ladders home tile: random witty quip — 40 "active challenge" quips + 40 "idle" quips; shown at bottom of tile |
| v5.45 | Ladders home tile quip: random icon prefix from themed pool (20 active / 20 idle); font 13px, darker colour |
| v5.46 | Ladders home tile quip: icon on both sides, only text italicised (not icons) |
| v5.47 | Ladders home tile footer text changed to "Click to view ladders →" |
| v5.48 | Ladders home tile quip: icons vertically aligned — flexbox on container, icons wrapped in inline flex spans |
| v5.49 | Ladders home tile quip: text centred between icons (em flex:1); ghost/forfeit rule changed to one-place drop (same as decline) |
| v5.50 | Division Ladder: hint text below Rules of Engagement button — "Tap ⚔️ next to a player's name to issue a challenge" (dev/challenges only) |
| v5.51 | Division Ladder: prominent "Game On!" card above ladder grid for player's own accepted challenges — navy card with amber Record Result button; fix APP_VERSION semicolons corruption |
| v5.52 | Division Ladder: pending outgoing challenge card above grid — grey card, big Withdraw button, "No penalty — they haven't accepted yet" note; removed confirm() dialog from withdrawChallenge |
| v5.53 | Division Ladder: clicking anywhere on a challengeable row triggers challenge/result modal; hint text updated to "Click a player's name…" in bold |
| v5.54 | Division Ladder: position numbers replaced with most-recent-result icons (🍺 win / 😢 loss / 🐔 declined / 👻 ghosted); blank if no history; skip injury/pending |
| v5.55 | Rules of Engagement admin note updated: "Ladders updated automatically — any issues, ping David B" |
| v5.56 | Sign-Up home card: "Click to sign-up →" flashes red when player has no upcoming bookings |
| v5.57 | Challenge system promoted to production — _CHALLENGES_ENABLED = true on all pages |
| v5.58 | Fix: all ladder/challenge CSS moved from dev.html <style> block into style.css — was missing on production, causing unstyled ladder tile and challenge panels on iOS |
| v5.59 | Challenge form: bigger text/textarea (15px intro, 14px textarea, 3 rows); "Shuffle" → "🔀 New message" button with pill background; fix asset query strings always bumped from now |
| v5.60 | Modal enlarged (max-width 560px, 90vh, header 17px, body 18px padding+15px font); challenge form textarea font-size 16px + touch-action:manipulation — prevents iOS Safari zoom on focus |
| v5.61 | Modal mobile: reduced top padding (20px not 60px), 92vh, body font 16px; challenge button "🍀 Pick a message for me" |
