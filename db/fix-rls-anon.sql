-- Fix RLS policies for anon-key app (phone auth — no Supabase Auth JWT)
-- All write operations come from the anon role; TO authenticated policies
-- never apply, so DML was silently blocked.
-- App-level auth (is_admin / is_super_admin in JS) guards the UI.
-- Run this in the Supabase SQL editor.

-- ── hof_results ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "hof_admin_all" ON hof_results;
CREATE POLICY "hof_write" ON hof_results
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ── events ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_admin_all" ON events;
CREATE POLICY "events_write" ON events
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ── session_templates ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "templates_admin_all" ON session_templates;
CREATE POLICY "templates_write" ON session_templates
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ── signups ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "signups_insert" ON signups;
DROP POLICY IF EXISTS "signups_delete" ON signups;
CREATE POLICY "signups_write" ON signups
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ── players ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "players_admin_all" ON players;
DROP POLICY IF EXISTS "players_select"    ON players;
CREATE POLICY "players_read"  ON players FOR SELECT USING (TRUE);
CREATE POLICY "players_write" ON players FOR ALL    USING (TRUE) WITH CHECK (TRUE);

-- ── handicap_history ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "handicaps_admin_all" ON handicap_history;
DROP POLICY IF EXISTS "handicaps_select"    ON handicap_history;
CREATE POLICY "handicaps_read"  ON handicap_history FOR SELECT USING (TRUE);
CREATE POLICY "handicaps_write" ON handicap_history FOR ALL    USING (TRUE) WITH CHECK (TRUE);

-- ── session_templates select ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "templates_select" ON session_templates;
CREATE POLICY "templates_read" ON session_templates FOR SELECT USING (TRUE);

-- ── events select ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_select" ON events;
CREATE POLICY "events_read" ON events FOR SELECT USING (TRUE);

-- ── signups select ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "signups_select" ON signups;
CREATE POLICY "signups_read" ON signups FOR SELECT USING (TRUE);
