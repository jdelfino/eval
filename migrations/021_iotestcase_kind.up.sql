-- Migration: 021_iotestcase_kind.up.sql
--
-- Backfills kind='io' into every element of the test_cases JSONB arrays in
-- problems and student_work. All existing rows lack an explicit kind tag; this
-- migration makes the discriminator explicit so the Go layer can reject untagged
-- rows post-migration.
--
-- Strategy: jsonb_agg + conditional merge-object to add kind='io' only when
-- the element doesn't already have a 'kind' key.
--
-- problems.test_cases
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
WHERE jsonb_array_length(test_cases) > 0;

-- student_work.test_cases
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
WHERE jsonb_array_length(test_cases) > 0;
