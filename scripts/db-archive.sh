#!/usr/bin/env bash
# db-archive.sh — Export prod Cloud SQL databases to a durable GCS archive,
# and prove the archive is restorable.
#
# One script, two modes (rather than a separate db-archive-verify.sh): export
# and verify share PROJECT_ID/INSTANCE/BUCKET/DATABASES resolution, and the
# whole point of verify mode is to prove *this script's own* export is
# trustworthy — keeping them in one file means they can't drift apart.
#
# Export mode (default):
#   Runs `gcloud sql export sql` for each database. This is a server-side
#   operation (Cloud SQL writes straight to GCS) so no VPC connectivity is
#   needed. Each export runs --async and the operation is polled to a
#   terminal state via `gcloud sql operations wait` + `describe`, so a
#   silently-failed operation (exit 0, but status/error set) is still caught.
#   Writes gzip-compressed dumps to:
#     gs://$BUCKET/$STAMP/$DB.sql.gz
#
# Verify mode (--verify STAMP):
#   Downloads the archived dump(s) for a prior export, audits each for
#   embedded credentials and unresolvable role references, restores each into
#   a throwaway local `postgres:15` docker container, and compares per-table
#   row counts against live prod (reached via scripts/db-proxy.sh, reused
#   as-is — no second access path) against the restored copy. Fails closed:
#   any error, any row-count diff, or any missing table is a non-zero exit.
#   This is the single most important check in the archive/restore epic — it
#   is the only thing standing between a bad dump and permanent loss of the
#   real class data the prod instance holds.
#
# Usage:
#   ./scripts/db-archive.sh                       # export eval + eval_staging
#   ./scripts/db-archive.sh --database eval        # export only one database
#   ./scripts/db-archive.sh --verify STAMP         # verify a prior export
#   ./scripts/db-archive.sh --verify STAMP --database eval
#   ./scripts/db-archive.sh -h | --help
#
# STAMP is the UTC timestamp prefix printed by a prior export run, e.g.
# 20260826T183000Z (i.e. the "<stamp>" in gs://$BUCKET/<stamp>/eval.sql.gz).
#
# Environment overrides (all optional; default to prod):
#   PROJECT_ID   — GCP project (default: eval-prod-485520)
#   INSTANCE     — Cloud SQL instance name (default: eval-prod-db)
#   BUCKET       — GCS bucket (default: ${PROJECT_ID}-db-archive)
#   DATABASES    — space-separated database list (default: "eval eval_staging")
#   ALLOWED_ROLES — space-separated role names a dump may reference
#                  (verify mode only; default covers the cloudsql module's
#                  users plus PostgreSQL/Cloud SQL built-ins)
#   STAMP        — override the generated UTC timestamp (export mode only;
#                  mainly useful for tests)
#
# Prerequisites:
#   - Export mode: gcloud, authenticated with access to $PROJECT_ID. The
#     archive bucket + IAM binding (infrastructure/terraform/environments/prod/main.tf:
#     google_storage_bucket.db_archive) must already be applied.
#   - Verify mode, additionally: docker, psql, gunzip, and PGPASSWORD set to
#     the 'reader' password:
#       export PGPASSWORD=$(cd infrastructure/terraform/environments/prod && terraform output -raw cloudsql_reader_password)
#     Verify mode shells out to scripts/db-proxy.sh for prod DB access, which
#     needs kubectl configured for the prod GKE cluster and live GKE nodes
#     (it schedules a socat pod).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${PROJECT_ID:-eval-prod-485520}"
INSTANCE="${INSTANCE:-eval-prod-db}"
BUCKET="${BUCKET:-${PROJECT_ID}-db-archive}"
DATABASES="${DATABASES:-eval eval_staging}"

# Role names a dump may legitimately reference: the two the cloudsql module
# creates (modules/cloudsql/main.tf — google_sql_user.main defaults to "app",
# google_sql_user.reader is "reader") plus the PostgreSQL and Cloud SQL
# built-ins that always appear in a managed-instance dump.
ALLOWED_ROLES="${ALLOWED_ROLES:-app reader postgres PUBLIC cloudsqlsuperuser cloudsqladmin cloudsqlagent}"

readonly ROW_COUNT_QUERY="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"

# ── Helpers ──────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage:
  $(basename "$0")                    Export eval + eval_staging to GCS
  $(basename "$0") --verify STAMP     Verify a prior export: restore + row-count match
  $(basename "$0") -h | --help        Show this help

Options:
  --database "DB [DB...]"   Restrict to specific database(s) (default: "eval eval_staging")
  --verify STAMP            Verify mode; STAMP is the timestamp prefix printed by a
                             prior export run (e.g. 20260826T183000Z)

Environment overrides (all default to prod — see script header for details):
  PROJECT_ID, INSTANCE, BUCKET, DATABASES, STAMP
EOF
}

log() {
  echo "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required tool '${cmd}' not found in PATH" >&2
    exit 1
  fi
}

# ── Export mode ──────────────────────────────────────────────────────────────

declare -a EXPORTED_URIS=()

# run_export <db> — exports one database, polls the operation to a terminal
# state, and fails loudly (non-zero return) on any error. On success, appends
# the resulting gs:// URI to EXPORTED_URIS.
run_export() {
  local db="$1"
  local uri="gs://${BUCKET}/${STAMP}/${db}.sql.gz"
  log "==> Exporting ${db} -> ${uri}"

  local op_name
  if ! op_name="$(gcloud sql export sql "$INSTANCE" "$uri" \
      --database="$db" --project="$PROJECT_ID" --async \
      --format='value(name)')"; then
    echo "ERROR: gcloud sql export sql failed to start for ${db}" >&2
    return 1
  fi

  if [[ -z "$op_name" ]]; then
    echo "ERROR: gcloud sql export sql did not return an operation name for ${db}" >&2
    return 1
  fi

  log "    Waiting on operation ${op_name} ..."
  if ! gcloud sql operations wait "$op_name" --project="$PROJECT_ID" --timeout=1800 >/dev/null; then
    echo "ERROR: operation ${op_name} for ${db} did not reach a terminal state" >&2
    return 1
  fi

  local status
  if ! status="$(gcloud sql operations describe "$op_name" --project="$PROJECT_ID" --format='value(status)')"; then
    echo "ERROR: could not describe operation ${op_name} for ${db}" >&2
    return 1
  fi
  if [[ "$status" != "DONE" ]]; then
    echo "ERROR: export operation ${op_name} for ${db} finished in unexpected state: ${status:-unknown}" >&2
    return 1
  fi

  # A Cloud SQL operation can report status=DONE while still carrying an
  # error (e.g. permission denied writing to the bucket) — status alone is
  # not sufficient to declare success.
  local err_msg
  err_msg="$(gcloud sql operations describe "$op_name" --project="$PROJECT_ID" --format='value(error.errors[0].message)' 2>/dev/null || true)"
  if [[ -n "$err_msg" ]]; then
    echo "ERROR: export operation ${op_name} for ${db} failed: ${err_msg}" >&2
    return 1
  fi

  log "    Export of ${db} complete."
  EXPORTED_URIS+=("$uri")
}

do_export() {
  require_cmd gcloud

  STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
  log "Exporting databases from ${INSTANCE} (project ${PROJECT_ID}) to gs://${BUCKET}/${STAMP}/ ..."

  local db
  for db in $DATABASES; do
    if ! run_export "$db"; then
      echo "ERROR: export failed for ${db} — aborting" >&2
      exit 1
    fi
  done

  log ""
  log "Export complete:"
  local uri size
  for uri in "${EXPORTED_URIS[@]}"; do
    size="$(gcloud storage ls -l "$uri" --project="$PROJECT_ID" 2>/dev/null | awk 'NR==1 {print $1}')"
    log "  ${uri}  (${size:-unknown} bytes)"
  done
}

# ── Verify mode ──────────────────────────────────────────────────────────────

PGVERIFY_CONTAINER=""
DB_TUNNEL_PID=""
DB_TUNNEL_PORT="5433"

cleanup_verify() {
  if [[ -n "$DB_TUNNEL_PID" ]]; then
    kill "$DB_TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$DB_TUNNEL_PID" 2>/dev/null || true
  fi
  if [[ -n "$PGVERIFY_CONTAINER" ]]; then
    docker rm -f "$PGVERIFY_CONTAINER" >/dev/null 2>&1 || true
  fi
}

# ensure_pgverify_container — starts a throwaway postgres:15 container and
# waits for it to accept connections.
ensure_pgverify_container() {
  PGVERIFY_CONTAINER="pgverify-$$"
  log "Starting throwaway postgres:15 container (${PGVERIFY_CONTAINER}) ..."
  docker rm -f "$PGVERIFY_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$PGVERIFY_CONTAINER" -e POSTGRES_PASSWORD=verify postgres:15 >/dev/null

  local i
  for i in $(seq 1 30); do
    if docker exec "$PGVERIFY_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "ERROR: ${PGVERIFY_CONTAINER} did not become ready" >&2
  return 1
}

# start_db_tunnel <workdir> — starts scripts/db-proxy.sh in the background
# and waits for it to accept connections. Reuses db-proxy.sh as-is; does not
# implement a second prod DB access path.
start_db_tunnel() {
  local workdir="$1"
  log "Starting prod DB tunnel via db-proxy.sh (port ${DB_TUNNEL_PORT}) ..."
  "$SCRIPT_DIR/db-proxy.sh" "$DB_TUNNEL_PORT" >"${workdir}/db-proxy.log" 2>&1 &
  DB_TUNNEL_PID=$!

  local i
  for i in $(seq 1 30); do
    if PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -p "$DB_TUNNEL_PORT" -U reader -d eval -At -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "ERROR: db-proxy.sh tunnel did not become ready within timeout; see ${workdir}/db-proxy.log" >&2
  return 1
}

# check_dump_roles <db> <plain_sql> — the dump must neither carry credentials
# nor depend on roles that will not exist when it is restored. On wake-up the
# cloudsql module's random_password resources are regenerated and the old
# instance is gone, so a dump that recreates roles would either fail the
# restore or reintroduce stale credentials into a fresh instance. Operates on
# the already-decompressed dump (see verify_one_database) so a large archive
# is inflated once rather than once per check. Fails closed.
check_dump_roles() {
  local db="$1" plain_sql="$2"

  local role_stmts
  role_stmts="$(grep -iE '^CREATE ROLE|^ALTER ROLE .* PASSWORD' "$plain_sql" || true)"
  if [[ -n "$role_stmts" ]]; then
    echo "ERROR: ${db} dump contains role/credential statements — refusing to archive it:" >&2
    printf '%s\n' "$role_stmts" | sed 's/^/    /' >&2
    return 1
  fi

  # Grantees from GRANT/REVOKE, plus OWNER TO targets — all are role
  # references that must resolve on restore.
  local referenced
  referenced="$(grep -oiE '^(GRANT|REVOKE|ALTER [A-Z ]+ OWNER)[[:space:]].*[[:space:]](TO|FROM)[[:space:]]+[^;]+' "$plain_sql" \
    | sed -E 's/.*[[:space:]](TO|FROM)[[:space:]]+//I; s/[[:space:]]+WITH[[:space:]]+GRANT[[:space:]]+OPTION.*//I' \
    | tr ',' '\n' \
    | sed -E 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//' \
    | grep -v '^$' | sort -u || true)"

  local unexpected=""
  local role
  while IFS= read -r role; do
    [[ -z "$role" ]] && continue
    if ! printf '%s\n' $ALLOWED_ROLES | grep -qxF "$role"; then
      unexpected+="    ${role}"$'\n'
    fi
  done <<< "$referenced"

  if [[ -n "$unexpected" ]]; then
    echo "ERROR: ${db} dump references role(s) the cloudsql module does not create." >&2
    echo "       A restore into a woken instance would fail on these:" >&2
    printf '%s' "$unexpected" >&2
    echo "       Expected only: ${ALLOWED_ROLES}" >&2
    return 1
  fi

  log "    Dump role references OK for ${db} (no embedded credentials)."
}

# restore_into_container <db> <plain_sql> — creates <db> in the verify
# container and restores the dump into it. Fails on non-zero psql exit AND
# on any ERROR line logged despite a zero exit (psql runs with
# ON_ERROR_STOP=1, but belt-and-suspenders here since a restore silently
# dropping rows is exactly the failure mode this script exists to catch).
restore_into_container() {
  local db="$1" plain_sql="$2"
  log "    Restoring ${db} into ${PGVERIFY_CONTAINER} ..."

  if ! docker exec "$PGVERIFY_CONTAINER" createdb -U postgres "$db" >/dev/null 2>&1; then
    echo "ERROR: createdb ${db} failed in ${PGVERIFY_CONTAINER}" >&2
    return 1
  fi

  local restore_log
  restore_log="$(docker exec -i "$PGVERIFY_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$db" < "$plain_sql" 2>&1)"
  local status=$?

  if [[ "$status" -ne 0 ]]; then
    echo "ERROR: restore of ${db} failed (psql exit ${status}):" >&2
    echo "$restore_log" >&2
    return 1
  fi

  if echo "$restore_log" | grep -qi '^ERROR'; then
    echo "ERROR: restore of ${db} logged ERROR lines despite a zero exit:" >&2
    echo "$restore_log" >&2
    return 1
  fi

  log "    Restore of ${db} OK."
}

# fetch_prod_row_counts <db> <port> — per-table row counts from live prod.
fetch_prod_row_counts() {
  local db="$1" port="$2"
  PGPASSWORD="$PGPASSWORD" psql -h 127.0.0.1 -p "$port" -U reader -d "$db" -At -F'|' -c "$ROW_COUNT_QUERY"
}

# fetch_restored_row_counts <db> — per-table row counts from the restored
# copy in the verify container.
fetch_restored_row_counts() {
  local db="$1"
  docker exec "$PGVERIFY_CONTAINER" psql -U postgres -d "$db" -At -F'|' -c "$ROW_COUNT_QUERY"
}

# compare_row_counts <db> <port> — the single most important check in the
# archive/restore epic. Fails closed: any query error, any empty result, or
# any diff between prod and the restored copy is a non-zero return. Never
# treat a partial or failed comparison as a pass.
compare_row_counts() {
  local db="$1" port="$2"
  local prod_out restored_out

  if ! prod_out="$(fetch_prod_row_counts "$db" "$port")"; then
    echo "ERROR: failed to query prod row counts for ${db} — failing closed" >&2
    return 1
  fi

  if ! restored_out="$(fetch_restored_row_counts "$db")"; then
    echo "ERROR: failed to query restored row counts for ${db} — failing closed" >&2
    return 1
  fi

  if [[ -z "$prod_out" || -z "$restored_out" ]]; then
    echo "ERROR: empty row-count result for ${db} (prod or restored query returned no rows) — failing closed" >&2
    return 1
  fi

  local diff_out
  if diff_out="$(diff <(printf '%s\n' "$prod_out") <(printf '%s\n' "$restored_out"))"; then
    local n_tables
    n_tables="$(printf '%s\n' "$prod_out" | wc -l)"
    log "    Row counts match for ${db} (${n_tables} tables)."
    return 0
  fi

  echo "ERROR: row-count mismatch for ${db} — refusing to treat this archive as verified:" >&2
  echo "$diff_out" >&2
  return 1
}

# verify_one_database <db> <stamp> <workdir> — download, integrity-check,
# restore, and row-count-compare a single database's dump.
verify_one_database() {
  local db="$1" stamp="$2" workdir="$3"
  local uri="gs://${BUCKET}/${stamp}/${db}.sql.gz"
  local local_gz="${workdir}/${db}.sql.gz"

  log "    Downloading ${uri} ..."
  if ! gcloud storage cp "$uri" "$local_gz" --project="$PROJECT_ID" >/dev/null; then
    echo "ERROR: failed to download ${uri}" >&2
    return 1
  fi

  local size
  size="$(wc -c < "$local_gz" 2>/dev/null || echo 0)"
  if [[ "$size" -lt 1024 ]]; then
    echo "ERROR: ${uri} is suspiciously small (${size} bytes) — refusing to verify" >&2
    return 1
  fi

  # Inflate once and reuse. A failed decompression here doubles as the gzip
  # integrity check, and both the role audit and the restore below then read
  # plain SQL — a large archive is otherwise inflated four separate times.
  local plain_sql="${workdir}/${db}.sql"
  if ! gunzip -c "$local_gz" > "$plain_sql" 2>/dev/null; then
    echo "ERROR: ${local_gz} failed gzip integrity check" >&2
    return 1
  fi

  if ! check_dump_roles "$db" "$plain_sql"; then
    return 1
  fi

  if ! restore_into_container "$db" "$plain_sql"; then
    return 1
  fi

  if ! compare_row_counts "$db" "$DB_TUNNEL_PORT"; then
    return 1
  fi
}

do_verify() {
  local stamp="$1"

  require_cmd gcloud
  require_cmd docker
  require_cmd psql
  require_cmd gunzip

  if [[ -z "${PGPASSWORD:-}" ]]; then
    echo "ERROR: PGPASSWORD must be set to the 'reader' password to verify row counts against prod." >&2
    echo "       export PGPASSWORD=\$(cd infrastructure/terraform/environments/prod && terraform output -raw cloudsql_reader_password)" >&2
    exit 1
  fi

  local workdir
  workdir="$(mktemp -d)"
  trap 'cleanup_verify; rm -rf "$workdir"' EXIT

  ensure_pgverify_container
  start_db_tunnel "$workdir"

  local overall_status=0
  local db
  for db in $DATABASES; do
    log ""
    log "==> Verifying ${db} (stamp ${stamp})"
    if ! verify_one_database "$db" "$stamp" "$workdir"; then
      overall_status=1
    fi
  done

  log ""
  if [[ "$overall_status" -ne 0 ]]; then
    echo "VERIFY FAILED — do not treat this archive as a proven restore." >&2
  else
    log "VERIFY OK — all databases restored cleanly and row counts match prod exactly."
  fi

  return "$overall_status"
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  local mode="export"
  local verify_stamp=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --verify)
        mode="verify"
        shift
        if [[ $# -gt 0 && "$1" != -* ]]; then
          verify_stamp="$1"
          shift
        fi
        ;;
      --database)
        shift
        if [[ $# -eq 0 ]]; then
          echo "ERROR: --database requires a value" >&2
          usage >&2
          exit 2
        fi
        DATABASES="$1"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "ERROR: unknown argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  if [[ "$mode" == "verify" ]]; then
    if [[ -z "$verify_stamp" ]]; then
      echo "ERROR: --verify requires a STAMP argument (the timestamp prefix printed by a prior export run)" >&2
      usage >&2
      exit 2
    fi
    do_verify "$verify_stamp"
    return $?
  fi

  do_export
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
