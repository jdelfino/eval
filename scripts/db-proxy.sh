#!/usr/bin/env bash
# Tunnel to the production Cloud SQL database via kubectl port-forward.
#
# Runs a socat pod in GKE to bridge to the private-IP-only Cloud SQL
# instance, then port-forwards to localhost.
#
# Binds to localhost:5433 so you can connect any GUI or CLI tool:
#   psql "host=127.0.0.1 port=5433 dbname=eval user=app sslmode=require"
#
# For debugging, prefer the read-only 'reader' user:
#   psql "host=127.0.0.1 port=5433 dbname=eval user=reader sslmode=require"
#
# Prerequisites:
#   - kubectl configured for the prod GKE cluster
#   - Database password — set PGPASSWORD or retrieve from Terraform:
#       cd infrastructure/terraform/environments/prod
#       export PGPASSWORD=$(terraform output -raw cloudsql_database_password)
#       # Or for the reader user:
#       export PGPASSWORD=$(terraform output -raw cloudsql_reader_password)
#
# Usage:
#   ./scripts/db-proxy.sh          # default port 5433
#   ./scripts/db-proxy.sh 5434     # custom port

set -euo pipefail

PORT="${1:-5433}"
POD_NAME="db-tunnel"
CLOUDSQL_IP="10.100.0.3"
TTL_SECONDS=14400  # 4 hours — pod auto-terminates if cleanup trap doesn't fire

cleanup() {
  echo ""
  echo "Cleaning up tunnel pod..."
  kubectl delete pod "${POD_NAME}" --ignore-not-found --wait=false >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

# Clean up any leftover pod from a previous run
kubectl delete pod "${POD_NAME}" --ignore-not-found --wait=false >/dev/null 2>&1
sleep 2

echo "Creating tunnel pod in GKE (auto-expires in $((TTL_SECONDS / 3600))h)..."
kubectl run "${POD_NAME}" \
  --image=alpine/socat:latest \
  --restart=Never \
  --port=5432 \
  --labels="app=db-tunnel" \
  --overrides="{\"spec\":{\"activeDeadlineSeconds\":${TTL_SECONDS}}}" \
  -- \
  tcp-listen:5432,fork,reuseaddr tcp-connect:"${CLOUDSQL_IP}:5432"

echo "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready "pod/${POD_NAME}" --timeout=60s

echo ""
echo "Tunnel active:"
echo "  Cloud SQL: ${CLOUDSQL_IP}:5432  ->  localhost:${PORT}"
echo ""
echo "Connect with (read-only, preferred for debugging):"
echo "  psql \"host=127.0.0.1 port=${PORT} dbname=eval user=reader sslmode=require\""
echo ""
echo "Connect with (read-write):"
echo "  psql \"host=127.0.0.1 port=${PORT} dbname=eval user=app sslmode=require\""
echo ""
echo "Set password:"
echo "  export PGPASSWORD=\$(cd infrastructure/terraform/environments/prod && terraform output -raw cloudsql_reader_password)   # reader"
echo "  export PGPASSWORD=\$(cd infrastructure/terraform/environments/prod && terraform output -raw cloudsql_database_password)  # app"
echo ""
echo "Press Ctrl+C to stop."
echo ""

kubectl port-forward "pod/${POD_NAME}" "${PORT}:5432" --address=127.0.0.1
