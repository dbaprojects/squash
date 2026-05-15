-- Audit log table — run in Supabase SQL editor
-- Captures login events, session resumes, and errors for super_admin review

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,   -- session_start | session_resume | login_not_found | login_pending | login_error | registration_submitted
  player_id   UUID REFERENCES players(id) ON DELETE SET NULL,
  player_name TEXT,            -- denormalized (remains readable if player deleted)
  phone       TEXT,            -- for pre-auth events where player_id is unknown
  user_agent  TEXT,
  details     JSONB,           -- flexible: error messages, extra context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT open to anon — must log before Supabase Auth session exists (phone-based auth app)
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (TRUE);

-- SELECT open to anon — app-level super_admin check controls who sees the UI
CREATE POLICY "audit_select" ON audit_log
  FOR SELECT USING (TRUE);

-- DELETE open to anon — app-level super_admin guard in deleteAllAuditLogs()
CREATE POLICY "audit_delete" ON audit_log
  FOR DELETE USING (TRUE);

-- Index for fast recent-events queries
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type    ON audit_log(event_type);
