-- Migration: 022_normalize_and_enforce_test_cases_array.down.sql
--
-- Drops the CHECK constraints added in the up migration.
--
-- The data normalization (object→array conversions) is NOT reversible — the
-- original {"stdin": "..."} shapes cannot be reconstructed from the
-- IOTestCase[] form because the structural information is lost. If a true
-- rollback is needed, recover from `student_work_pre_022_backup.jsonl`
-- (captured before migration 022 was applied on prod — see beads eval-aga).

ALTER TABLE problems       DROP CONSTRAINT IF EXISTS problems_test_cases_is_array;
ALTER TABLE student_work   DROP CONSTRAINT IF EXISTS student_work_test_cases_is_array;
