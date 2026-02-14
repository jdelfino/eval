-- Grant the read-only 'reader' role visibility through RLS policies.
-- Cloud SQL does not allow BYPASSRLS (requires SUPERUSER), so we add
-- permissive SELECT policies scoped to the reader role on every table
-- that has RLS enabled.

CREATE POLICY reader_select ON namespaces FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON users FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON classes FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON sections FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON section_memberships FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON sessions FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON session_students FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON revisions FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON session_backend_state FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON invitations FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON problems FOR SELECT TO reader USING (true);
CREATE POLICY reader_select ON audit_logs FOR SELECT TO reader USING (true);
