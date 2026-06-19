-- Migration: 027_harden_secdef_search_path.down.sql
--
-- Reverts the search-path hardening from the up migration by restoring the
-- migration-010 definitions of add_session_participant and touch_session_activity
-- verbatim (without the SET search_path clause). This re-introduces the
-- search-path-hijack exposure and is intended only for rollback symmetry.

CREATE OR REPLACE FUNCTION add_session_participant(p_session_id uuid, p_user_id uuid)
RETURNS void AS $$
  UPDATE sessions
  SET participants = array_append(participants, p_user_id)
  WHERE id = p_session_id AND NOT (p_user_id = ANY(participants));
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION touch_session_activity(p_session_id uuid)
RETURNS void AS $$
  UPDATE sessions SET last_activity = now() WHERE id = p_session_id;
$$ LANGUAGE sql SECURITY DEFINER;
