-- Migration: 022_normalize_and_enforce_test_cases_array.up.sql
--
-- Recovers from migration 021's partial failure on prod (see beads eval-aga).
-- Migration 021 attempted to backfill kind='io' but errored when its WHERE
-- clause `jsonb_array_length(test_cases) > 0` evaluated against non-array
-- rows that prior migrations had left behind. The transaction rolled back,
-- leaving `schema_migrations` at version=21, dirty=true.
--
-- Important PostgreSQL note: AND short-circuit order is NOT guaranteed, so
-- `WHERE jsonb_typeof = 'array' AND jsonb_array_length > 0` is unsafe —
-- the planner may evaluate jsonb_array_length on non-array rows and crash.
-- This migration uses `test_cases != '[]'::jsonb` instead, which is type-safe.
--
-- Steps:
-- 1. Listify object-shaped student_work.test_cases that carry legacy
--    ExecutionSettings stdin → single-element IOTestCase array preserving the stdin.
-- 2. Normalize all remaining non-array shapes → `[]`.
-- 3. Backfill kind='io' on every array element lacking it (021's intended work).
-- 4. ADD CHECK constraint making "test_cases is a JSON array" a schema invariant.

-- ============================================================================
-- STEP 1: Listify legacy ExecutionSettings stdin into IOTestCase[]
-- ============================================================================

-- 4 student_work rows on prod have test_cases of shape {"stdin": "..."} — relics of
-- the old ExecutionSettings model. Convert each to a single-element IOTestCase
-- array carrying that stdin, so the student's intent is preserved.
UPDATE student_work
SET test_cases = jsonb_build_array(
    jsonb_build_object(
        'kind',       'io',
        'name',       'Default',
        'input',      COALESCE(test_cases->>'stdin', ''),
        'match_type', 'exact',
        'order',      0
    )
)
WHERE jsonb_typeof(test_cases) = 'object'
  AND test_cases ? 'stdin';

-- ============================================================================
-- STEP 2: Normalize remaining non-array shapes to empty arrays
-- ============================================================================

-- 117 student_work rows on prod have test_cases = `{}`. These represent
-- student work with no test cases authored — convert to `[]` so the column
-- holds the canonical empty-array shape.
UPDATE student_work
SET test_cases = '[]'::jsonb
WHERE jsonb_typeof(test_cases) != 'array';

-- 0 rows on prod, but defensive — covers any local/dev/staging DB that may
-- have leaked non-array values into problems.test_cases.
UPDATE problems
SET test_cases = '[]'::jsonb
WHERE jsonb_typeof(test_cases) != 'array';

-- ============================================================================
-- STEP 3: Backfill kind='io' on array elements that lack it
-- ============================================================================

-- This is what migration 021 was supposed to do but never reached because of
-- the SQL error above. The newly-listified rows (Step 1) already have kind='io',
-- so this step leaves them unchanged; rows with elements missing kind get tagged.

UPDATE problems
SET test_cases = (
    SELECT jsonb_agg(
        CASE
            WHEN elem ? 'kind' THEN elem
            ELSE elem || '{"kind":"io"}'::jsonb
        END
    )
    FROM jsonb_array_elements(test_cases) AS elem
)
WHERE jsonb_typeof(test_cases) = 'array' AND test_cases != '[]'::jsonb;

UPDATE student_work
SET test_cases = (
    SELECT jsonb_agg(
        CASE
            WHEN elem ? 'kind' THEN elem
            ELSE elem || '{"kind":"io"}'::jsonb
        END
    )
    FROM jsonb_array_elements(test_cases) AS elem
)
WHERE jsonb_typeof(test_cases) = 'array' AND test_cases != '[]'::jsonb;

-- ============================================================================
-- STEP 4: Enforce "test_cases is a JSON array" as a schema invariant
-- ============================================================================

ALTER TABLE problems
    ADD CONSTRAINT problems_test_cases_is_array
    CHECK (jsonb_typeof(test_cases) = 'array');

ALTER TABLE student_work
    ADD CONSTRAINT student_work_test_cases_is_array
    CHECK (jsonb_typeof(test_cases) = 'array');
