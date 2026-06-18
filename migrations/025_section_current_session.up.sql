-- Migration: 025_section_current_session.up.sql
--
-- Adds sections.current_session_id: a nullable pointer to the section's current
-- (live) session under the G4 section-pointer model. Sessions are persistent
-- documents; this pointer — not sessions.status — is the live signal for which
-- session a section is currently running. POST /sessions optionally sets it
-- (set_current, default true) and DELETE /sections/{id}/current clears it.
--
-- G4-R3 (staleness rule): the pointer is NEVER auto-cleared. Once set, it keeps
-- pointing at the most recent class problem indefinitely; a "stale" value is the
-- correct late-join target at any time (the last thing the section was working
-- on). The ONLY way to clear it is the explicit, optional end-of-class action
-- DELETE /sections/{id}/current. Nothing in the create/end/delete session paths
-- ever nulls it automatically.
--
-- ON DELETE behavior: default NO ACTION. Acceptable because sessions are
-- persistent documents and are not deleted in the live path; a dangling pointer
-- cannot arise from normal operation.
--
-- RLS note: no new policies needed.
-- Verification: migration 015 redefines the sections UPDATE policy as
--   CREATE POLICY "sections_update" ON sections FOR UPDATE USING (can_manage_section(id));
-- This is column-agnostic (no WITH CHECK column list), so it already covers
-- writes to the new current_session_id column. Pointer writes are additionally
-- gated at the route layer by PermContentManage (instructor+), matching the
-- other section-management endpoints.

ALTER TABLE sections
  ADD COLUMN current_session_id UUID REFERENCES sessions(id);

COMMENT ON COLUMN sections.current_session_id IS
  'G4 section pointer: the section''s current (live) session. Nullable. Never auto-cleared (G4-R3); a stale value is the correct late-join target. Cleared only via DELETE /sections/{id}/current.';
