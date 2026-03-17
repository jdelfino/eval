-- Migration: 020_consolidate_execution_settings.up.sql
--
-- Converts execution_settings data into test_cases entries and removes execution_settings columns.
--
-- Changes:
-- 1. problems.test_cases backfill: convert execution_settings to single IOTestCase
-- 2. problems.test_cases NOT NULL with default
-- 3. DROP problems.execution_settings
-- 4. student_work.test_cases backfill: convert execution_settings to single IOTestCase
-- 5. student_work.test_cases NOT NULL with default
-- 6. DROP student_work.execution_settings
-- 7. RENAME sessions.featured_execution_settings -> featured_test_cases

-- ============================================================================
-- STEP 1 & 2: problems.test_cases backfill + NOT NULL
-- ============================================================================

-- For problems with meaningful execution_settings (non-null, non-empty, not 'null'),
-- convert to a single IOTestCase carrying stdin, random_seed, and attached_files.
-- This overwrites any existing test_cases since execution_settings takes precedence
-- (no real test cases have been authored yet; migration 019 PR not shipped).
UPDATE problems
SET test_cases = jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object(
        'name',           'Default',
        'input',          COALESCE(execution_settings->>'stdin', ''),
        'match_type',     'exact',
        'order',          0,
        'random_seed',    execution_settings->'random_seed',
        'attached_files', execution_settings->'attached_files'
    ))
)
WHERE execution_settings IS NOT NULL
  AND execution_settings::text NOT IN ('{}', 'null', '');

-- For problems with no test cases yet (NULL, empty object, or non-array), seed a
-- default "Case 1" so every problem has at least one test case.
UPDATE problems
SET test_cases = '[{"name":"Case 1","input":"","match_type":"exact","order":0}]'::jsonb
WHERE test_cases IS NULL
   OR jsonb_typeof(test_cases) != 'array'
   OR jsonb_array_length(test_cases) = 0;

-- Add NOT NULL constraint with default value so future inserts always have a case.
ALTER TABLE problems
    ALTER COLUMN test_cases SET NOT NULL,
    ALTER COLUMN test_cases SET DEFAULT '[{"name":"Case 1","input":"","match_type":"exact","order":0}]'::jsonb;

-- ============================================================================
-- STEP 3: DROP problems.execution_settings
-- ============================================================================

ALTER TABLE problems DROP COLUMN IF EXISTS execution_settings;

-- ============================================================================
-- STEP 4 & 5: student_work.test_cases backfill + NOT NULL
-- ============================================================================

-- For student_work rows with meaningful execution_settings, convert to IOTestCase.
UPDATE student_work
SET test_cases = jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object(
        'name',           'Default',
        'input',          COALESCE(execution_settings->>'stdin', ''),
        'match_type',     'exact',
        'order',          0,
        'random_seed',    execution_settings->'random_seed',
        'attached_files', execution_settings->'attached_files'
    ))
)
WHERE execution_settings IS NOT NULL
  AND execution_settings::text NOT IN ('{}', 'null', '');

-- Seed a default case for student_work rows with no test_cases yet (NULL,
-- empty object, or non-array).
UPDATE student_work
SET test_cases = '[{"name":"Case 1","input":"","match_type":"exact","order":0}]'::jsonb
WHERE test_cases IS NULL
   OR jsonb_typeof(test_cases) != 'array'
   OR jsonb_array_length(test_cases) = 0;

-- Add NOT NULL constraint with default value.
ALTER TABLE student_work
    ALTER COLUMN test_cases SET NOT NULL,
    ALTER COLUMN test_cases SET DEFAULT '[{"name":"Case 1","input":"","match_type":"exact","order":0}]'::jsonb;

-- ============================================================================
-- STEP 6: DROP student_work.execution_settings
-- ============================================================================

ALTER TABLE student_work DROP COLUMN IF EXISTS execution_settings;

-- ============================================================================
-- STEP 7: RENAME sessions.featured_execution_settings -> featured_test_cases
-- ============================================================================

ALTER TABLE sessions RENAME COLUMN featured_execution_settings TO featured_test_cases;
