-- Rollback: 010_sessions_participant_update

DROP FUNCTION IF EXISTS add_session_participant(uuid, uuid);
DROP FUNCTION IF EXISTS touch_session_activity(uuid);
