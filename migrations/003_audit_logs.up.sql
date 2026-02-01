-- Migration: 003_audit_logs.up.sql
-- Creates the audit_logs table for tracking user actions.

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  target_id TEXT,
  target_type TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Audit trail of user actions within namespaces';

CREATE INDEX idx_audit_logs_namespace ON audit_logs(namespace_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Namespace-scoped read
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    is_system_admin() OR namespace_id = app_namespace_id()
  );

-- Instructors+ can create audit log entries
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (
    is_instructor_or_higher()
    AND namespace_id = app_namespace_id()
  );

-- No update or delete - audit logs are immutable
