-- Migration: 027_harden_secdef_search_path.up.sql
--
-- Hardens the pre-existing SECURITY DEFINER functions from migration 010 against
-- search-path hijack. A SECURITY DEFINER function executes with the privileges of
-- its owner; if it does not pin search_path, an attacker who can create objects in
-- a schema earlier on the caller's search_path (e.g. a function or operator that
-- shadows a built-in) can hijack name resolution and run code as the definer.
--
-- Fix: add `SET search_path = public, pg_temp` to each function. This is the same
-- hardening already applied to public_author_display_name in migration 023. We use
-- CREATE OR REPLACE FUNCTION with the EXACT original signature, body, language, and
-- volatility — only the search_path clause is added; behavior is unchanged. The
-- COMMENT ON FUNCTION statements from migration 010 are preserved on replace, so
-- they are not restated here.
--
-- RLS note: no policy changes. These functions intentionally run as the table owner
-- to bypass RLS for the two narrow student-initiated writes (JoinSession appends a
-- participant; UpdateCode touches last_activity), exactly as before.

CREATE OR REPLACE FUNCTION add_session_participant(p_session_id uuid, p_user_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE sessions
  SET participants = array_append(participants, p_user_id)
  WHERE id = p_session_id AND NOT (p_user_id = ANY(participants));
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION touch_session_activity(p_session_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE sessions SET last_activity = now() WHERE id = p_session_id;
$$ LANGUAGE sql;
