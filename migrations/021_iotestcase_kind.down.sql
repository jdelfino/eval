-- Migration: 021_iotestcase_kind.down.sql
--
-- Reverses migration 021: strips the 'kind' key from every element of the
-- test_cases JSONB arrays in problems and student_work.
--
-- problems.test_cases
UPDATE problems
SET test_cases = (
    SELECT jsonb_agg(elem - 'kind')
    FROM jsonb_array_elements(test_cases) AS elem
)
WHERE jsonb_array_length(test_cases) > 0;

-- student_work.test_cases
UPDATE student_work
SET test_cases = (
    SELECT jsonb_agg(elem - 'kind')
    FROM jsonb_array_elements(test_cases) AS elem
)
WHERE jsonb_array_length(test_cases) > 0;
