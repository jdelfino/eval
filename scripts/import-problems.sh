#!/usr/bin/env bash
#
# Import problems from coding-tool's Supabase export into eval.
#
# Export from coding-tool first:
#   psql $SUPABASE_DB_URL -c "SELECT json_agg(row_to_json(p)) FROM (
#     SELECT title, description, starter_code, test_cases,
#            execution_settings, tags, solution
#     FROM problems ORDER BY created_at
#   ) p;" -t -o problems-export.json
#
# Then run this script:
#   DATABASE_URL=... ./scripts/import-problems.sh problems-export.json <namespace-id> <author-id> <class-id>
#
set -euo pipefail

if [ $# -ne 4 ]; then
  echo "Usage: $0 <json-file> <namespace-id> <author-id> <class-id>"
  echo "Requires DATABASE_URL environment variable."
  exit 1
fi

JSON_FILE="$1"
NAMESPACE_ID="$2"
AUTHOR_ID="$3"
CLASS_ID="$4"

: "${DATABASE_URL:?DATABASE_URL is required}"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: file not found: $JSON_FILE"
  exit 1
fi

if ! jq empty "$JSON_FILE" 2>/dev/null; then
  echo "Error: invalid JSON in $JSON_FILE"
  exit 1
fi

COUNT=$(jq 'length' "$JSON_FILE")
echo "Importing $COUNT problems into namespace '$NAMESPACE_ID'..."

psql "$DATABASE_URL" \
  -v ns="$NAMESPACE_ID" \
  -v author="$AUTHOR_ID" \
  -v cls="$CLASS_ID" \
  -v json_data="$(cat "$JSON_FILE")" \
  <<'SQL'
BEGIN;

INSERT INTO problems (namespace_id, title, description, starter_code,
                      test_cases, execution_settings,
                      author_id, class_id, tags, solution)
SELECT
  :'ns',
  elem->>'title',
  elem->>'description',
  elem->>'starter_code',
  NULLIF(elem->'test_cases', 'null'::jsonb),
  NULLIF(elem->'execution_settings', 'null'::jsonb),
  :'author'::uuid,
  :'cls'::uuid,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(elem->'tags')), '{}'),
  elem->>'solution'
FROM jsonb_array_elements(:'json_data'::jsonb) AS elem;

COMMIT;
SQL

echo "Done. Imported $COUNT problems."
