-- Remove reader SELECT policies from all RLS-enabled tables.

DROP POLICY IF EXISTS reader_select ON namespaces;
DROP POLICY IF EXISTS reader_select ON users;
DROP POLICY IF EXISTS reader_select ON classes;
DROP POLICY IF EXISTS reader_select ON sections;
DROP POLICY IF EXISTS reader_select ON section_memberships;
DROP POLICY IF EXISTS reader_select ON sessions;
DROP POLICY IF EXISTS reader_select ON session_students;
DROP POLICY IF EXISTS reader_select ON revisions;
DROP POLICY IF EXISTS reader_select ON session_backend_state;
DROP POLICY IF EXISTS reader_select ON invitations;
DROP POLICY IF EXISTS reader_select ON problems;
DROP POLICY IF EXISTS reader_select ON audit_logs;
