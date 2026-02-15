-- Migration: 010_sessions_participant_update.up.sql
--
-- Provides SECURITY DEFINER functions for student-initiated updates to the
-- sessions table. Students need to:
--   1. Append themselves to the participants array (JoinSession)
--   2. Touch last_activity timestamp (UpdateCode)
--
-- The sessions_update RLS policy only allows creators/instructors/admins.
-- Rather than granting students broad UPDATE access, these narrow functions
-- run as the table owner and do exactly one thing each.

-- Append a user to a session's participants array (idempotent).
CREATE FUNCTION add_session_participant(p_session_id uuid, p_user_id uuid)
RETURNS void AS $$
  UPDATE sessions
  SET participants = array_append(participants, p_user_id)
  WHERE id = p_session_id AND NOT (p_user_id = ANY(participants));
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION add_session_participant IS
  'Appends a user to session participants (bypasses RLS, called from JoinSession)';

-- Touch a session's last_activity timestamp.
CREATE FUNCTION touch_session_activity(p_session_id uuid)
RETURNS void AS $$
  UPDATE sessions SET last_activity = now() WHERE id = p_session_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON FUNCTION touch_session_activity IS
  'Updates session last_activity (bypasses RLS, called from UpdateCode)';
