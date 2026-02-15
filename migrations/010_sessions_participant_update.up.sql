-- Migration: 010_sessions_participant_update.up.sql
--
-- Allows section members (students) to update sessions they participate in.
--
-- JoinSession appends to the participants array and UpdateCode touches
-- last_activity. Both run under the student's RLS context but the existing
-- sessions_update policy only allows creators/instructors/admins.
-- Without this, these updates silently affect 0 rows when RLS is enforced.

CREATE POLICY "sessions_participant_update" ON sessions
  FOR UPDATE USING (is_section_member(section_id));
