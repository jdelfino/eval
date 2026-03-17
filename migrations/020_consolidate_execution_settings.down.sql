-- Migration: 020_consolidate_execution_settings.down.sql
--
-- Reverses migration 020: restores execution_settings columns, converts test_cases[0]
-- back to execution_settings, and renames featured_test_cases back to
-- featured_execution_settings.

-- ============================================================================
-- STEP 1: Rename sessions.featured_test_cases -> featured_execution_settings
-- ============================================================================

ALTER TABLE sessions RENAME COLUMN featured_test_cases TO featured_execution_settings;

-- ============================================================================
-- STEP 2: Restore student_work.execution_settings
-- ============================================================================

ALTER TABLE student_work ADD COLUMN IF NOT EXISTS execution_settings JSONB;

-- For student_work rows whose first test case was named 'Default',
-- reconstruct execution_settings from the test case fields.
UPDATE student_work
SET execution_settings = jsonb_strip_nulls(jsonb_build_object(
    'stdin',          test_cases->0->>'input',
    'random_seed',    test_cases->0->'random_seed',
    'attached_files', test_cases->0->'attached_files'
))
WHERE test_cases IS NOT NULL
  AND jsonb_typeof(test_cases) = 'array'
  AND jsonb_array_length(test_cases) > 0
  AND test_cases->0->>'name' = 'Default';

-- Remove NOT NULL and default from student_work.test_cases to restore pre-020 state.
ALTER TABLE student_work
    ALTER COLUMN test_cases DROP NOT NULL,
    ALTER COLUMN test_cases DROP DEFAULT;

-- ============================================================================
-- STEP 3: Restore problems.execution_settings
-- ============================================================================

ALTER TABLE problems ADD COLUMN IF NOT EXISTS execution_settings JSONB;

-- For problems whose first test case was named 'Default', reconstruct execution_settings.
UPDATE problems
SET execution_settings = jsonb_strip_nulls(jsonb_build_object(
    'stdin',          test_cases->0->>'input',
    'random_seed',    test_cases->0->'random_seed',
    'attached_files', test_cases->0->'attached_files'
))
WHERE test_cases IS NOT NULL
  AND jsonb_typeof(test_cases) = 'array'
  AND jsonb_array_length(test_cases) > 0
  AND test_cases->0->>'name' = 'Default';

-- Remove NOT NULL and default from problems.test_cases to restore pre-020 state.
ALTER TABLE problems
    ALTER COLUMN test_cases DROP NOT NULL,
    ALTER COLUMN test_cases DROP DEFAULT;
