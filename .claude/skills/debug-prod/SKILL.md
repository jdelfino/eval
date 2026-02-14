---
name: debug-prod
description: Investigate production issues using logs, database, and Identity Platform. Read-only by default.
user_invocable: true
---

# Production Debugging

Investigate production issues by querying logs, database state, and Identity Platform.

## Critical Directive

**NEVER take destructive or mutating actions in production without explicit user approval.** This includes:

- Creating, updating, or deleting Firebase/Identity Platform users
- Modifying database rows (INSERT, UPDATE, DELETE)
- Deleting or restarting pods
- Scaling deployments
- Modifying ConfigMaps or Secrets
- Any `kubectl apply`, `kubectl delete`, or `kubectl edit`
- Any write operation against a production API

**Read-only operations are always safe.** When you need to take a mutating action, describe what you want to do, why, and the expected impact — then wait for approval before executing.

If the user has described the issue, start investigating immediately. Do not ask clarifying questions unless the problem description is genuinely ambiguous.

## Environment Reference

| Resource | Value |
|----------|-------|
| GCP Project | `eval-prod-485520` |
| GKE Cluster | `eval-prod-gke` (zone: `us-east1-b`) |
| Cloud SQL | `eval-prod-db` (private IP: `10.100.0.3`) |
| K8s Namespace | `default` |
| Deployments | `go-api`, `frontend`, `executor`, `centrifugo`, `redis` |
| Domain | `eval.delquillan.com` |

## Step 1: Set Up Access

Ensure GCP project is set and GKE credentials are available:

```bash
gcloud config set project eval-prod-485520
gcloud container clusters get-credentials eval-prod-gke --zone us-east1-b
```

## Step 2: Investigate

Use the sections below based on the type of issue. Run multiple queries in parallel when possible.

---

### Application Logs (GKE)

**Recent logs from a specific service:**

```bash
# Live logs from go-api (most recent pod)
kubectl logs deployment/go-api --tail=100

# Logs from a specific time window (use Cloud Logging for historical)
gcloud logging read \
  'resource.type="k8s_container" AND resource.labels.container_name="go-api" AND timestamp>="2026-01-01T00:00:00Z" AND timestamp<="2026-01-01T01:00:00Z"' \
  --limit=100 --format=json
```

**Filter for errors or specific paths:**

```bash
# API errors (non-healthcheck)
gcloud logging read \
  'resource.type="k8s_container" AND resource.labels.container_name="go-api" AND jsonPayload.status>=400 AND NOT jsonPayload.path="/readyz" AND NOT jsonPayload.path="/healthz"' \
  --limit=50 --format=json --freshness=1h

# Specific API path
gcloud logging read \
  'resource.type="k8s_container" AND resource.labels.container_name="go-api" AND jsonPayload.path:"/auth/accept-invite"' \
  --limit=20 --format=json --freshness=1h

# Frontend logs
kubectl logs deployment/frontend --tail=100

# Executor logs
kubectl logs deployment/executor --tail=100
```

**Parse structured log output:**

The go-api emits JSON logs. Use python or jq to extract fields:

```bash
gcloud logging read '<FILTER>' --limit=50 --format=json > /tmp/logs.json
python3 -c "
import json
with open('/tmp/logs.json') as f:
    entries = json.load(f)
for e in entries:
    jp = e.get('jsonPayload', {})
    path = jp.get('path', '')
    if path in ('/readyz', '/healthz', '/metrics'):
        continue
    print(f'{e[\"timestamp\"]}: {jp.get(\"method\",\"\")} {path} status={jp.get(\"status\",\"\")} msg={jp.get(\"msg\",\"\")}')
"
```

### Pod Health

```bash
# Pod status and restarts
kubectl get pods -n default

# Recent events (scheduling failures, OOM kills, etc.)
kubectl get events -n default --sort-by='.metadata.creationTimestamp' | tail -20

# Resource usage
kubectl top pods -n default
```

---

### Database

**Starting the tunnel:**

Use the provided proxy script, which creates a socat pod in GKE and port-forwards to localhost:

```bash
./scripts/db-proxy.sh        # binds to localhost:5433
./scripts/db-proxy.sh 5434   # custom port
```

The script requires `PGPASSWORD`. Retrieve it via Terraform:

```bash
cd infrastructure/terraform/environments/prod
export PGPASSWORD=$(terraform output -raw cloudsql_database_password)
```

Or from the Kubernetes secret:

```bash
export PGPASSWORD=$(kubectl get secret app-secrets -o jsonpath='{.data.DATABASE_PASSWORD}' | base64 -d)
```

**Connecting:**

Always use the read-only `reader` user for debugging. Only use `app` if you need write access (which requires user approval).

```bash
# Read-only (preferred for debugging)
export PGPASSWORD=$(kubectl get secret app-secrets -o jsonpath='{.data.READER_DATABASE_PASSWORD}' | base64 -d)
psql "host=127.0.0.1 port=5433 dbname=eval user=reader sslmode=require"

# Read-write (only with user approval)
export PGPASSWORD=$(kubectl get secret app-secrets -o jsonpath='{.data.DATABASE_PASSWORD}' | base64 -d)
psql "host=127.0.0.1 port=5433 dbname=eval user=app sslmode=require"
```

**Quick one-off queries (no tunnel needed):**

For simple queries, use a temporary pod with the reader user:

```bash
# Get reader password
READER_PW=$(kubectl get secret app-secrets -o jsonpath='{.data.READER_DATABASE_PASSWORD}' | base64 -d)

kubectl run psql-tmp --image=postgres:15 --restart=Never --rm -i \
  --env="PGPASSWORD=${READER_PW}" \
  --command -- psql -h 10.100.0.3 -U reader -d eval --set=sslmode=require \
  -c "SELECT ..."
```

**Common diagnostic queries:**

```sql
-- List users by role
SELECT id, email, role, external_id, namespace_id, created_at FROM users ORDER BY created_at;

-- Check invitations
SELECT id, email, target_role, namespace_id, created_at, consumed_at, revoked_at FROM invitations ORDER BY created_at DESC;

-- Active sessions
SELECT id, class_id, status, created_at FROM sessions WHERE status = 'active';

-- Recent errors or anomalies — check for orphaned references
SELECT u.id, u.email, u.external_id FROM users u
  WHERE NOT EXISTS (SELECT 1 FROM namespaces n WHERE n.id = u.namespace_id)
  AND u.namespace_id IS NOT NULL;
```

---

### Identity Platform (Firebase Auth)

**Look up a user by email:**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: eval-prod-485520" \
  -H "Content-Type: application/json" \
  -d '{"email": ["user@example.com"]}' \
  "https://identitytoolkit.googleapis.com/v1/projects/eval-prod-485520/accounts:lookup"
```

**Look up a user by Firebase UID:**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: eval-prod-485520" \
  -H "Content-Type: application/json" \
  -d '{"localId": ["<firebase-uid>"]}' \
  "https://identitytoolkit.googleapis.com/v1/projects/eval-prod-485520/accounts:lookup"
```

An empty response (no `users` field) means the user does not exist in Identity Platform.

**Check Identity Platform configuration:**

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: eval-prod-485520" \
  "https://identitytoolkit.googleapis.com/v2/projects/eval-prod-485520/config"
```

**Cross-reference DB and Firebase:**

A common failure mode is DB/Firebase user mismatch — the user exists in one but not the other. Always check both sides:

1. Query the DB for the user's `external_id`
2. Look up that `external_id` (= Firebase UID) in Identity Platform
3. If missing from Firebase: user can't authenticate (400 on signInWithPassword)
4. If missing from DB: user gets 401 on `/auth/me` after Firebase sign-in

---

### Kubernetes Resources

```bash
# Deployment status
kubectl get deployments -n default

# ConfigMap values (non-secret)
kubectl get configmap app-config -o yaml

# Secret keys (list only, don't dump values unnecessarily)
kubectl get secret app-secrets -o jsonpath='{.data}' | python3 -c "import json,sys; [print(k) for k in json.loads(sys.stdin.read())]"

# Ingress / service endpoints
kubectl get ingress,svc -n default
```

## Step 3: Report Findings

After investigating, present:

1. **Root cause** — what is actually broken and why
2. **Evidence** — log entries, DB state, or API responses that confirm the diagnosis
3. **Proposed fix** — what needs to change, with specific commands or code changes
4. **Impact assessment** — who is affected, is it urgent

**Wait for user approval before executing any fix that mutates production state.**

## What This Skill Does NOT Do

- Modify production data, users, or configuration without approval
- Deploy code or restart services
- Make assumptions about fixes — always present evidence first
- Run `kubectl exec` into production containers for ad-hoc operations
