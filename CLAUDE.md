# Squash Club — Claude Reference

## Project identity
- **Name:** BC Squash Section — Booking & Handicap Manager
- **Owner:** David Barkess — personal project, unrelated to SAP/DealSensAI work
- **Purpose:** Court session booking, player handicap tracking, weekly schedule management, Hall of Fame
- **Location:** `C:\Users\I061437\OneDrive\Projects\Squash`
- **Current version:** v4.43
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

- **URL:** `https://ikfzmqtglgeotyooosur.supabase.co`
- **Anon key:** `sb_publishable_zs7ClfRPKw5TEaVSn2_oTA_kqVLhZfe` (safe to be in client code)
- **Service role key:** stored in memory only — used for seed scripts, never committed

---

## File structure

```
docs/
  index.html          — SPA shell; nav: Sign-Up | Handicaps | HoF | Admin▾
  app.js              — all frontend logic (~2500 lines)
  style.css           — mobile-first styles, BC navy/gold palette
  bcss-transparent.png — BC crest logo
  manifest.json       — PWA manifest
db/
  schema-supabase.sql — Postgres DDL for core tables
  schema-hof.sql      — DDL for hof_results table + RLS
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
| Admin | `view-admin` | tabs | Players, Events, Templates, HoF, Reports |

---

## Key frontend state variables

```js
// Global
ST = { player, players, events, templates, currentEvent }

// Ladder
ladderPlayers, ladderSearch, ladderStatusFilter ('active'|'inactive'|'all')
playerHistoryArr, ladderMonths, ladderYearMode ('last12'|'YYYY')
ladderAllYears, ladderSectionView ('list'|'grid'|'movers'|'dist')
_playerHcChart, _distChart
_playerHcSeries, _playerHcPeriod, _playerSignupCount12m

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
- HC shown inline in brackets: "David Barkess (-6)"
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
```

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
