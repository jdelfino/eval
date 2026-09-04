# Hibernation

Production spend was measured at ~$155/month (see [ECONOMICS.md](ECONOMICS.md)). Between semesters, when nobody is using the platform, the infrastructure can be scaled down to ~$0.35/month while preserving the ability to restore it with a flag flip and one `terraform apply`.

## What hibernation is

One flag: `hibernate = true` in [`infrastructure/terraform/environments/prod/terraform.tfvars`](../infrastructure/terraform/environments/prod/terraform.tfvars), applied with `terraform apply`. It is threaded through the Terraform modules — there is no second toggle (a GitHub repo variable, a runtime kill switch, etc.) that could disagree with the applied state. The GitHub Actions deploy guard (see below) reads this same flag directly out of tfvars for the same reason.

## What survives hibernation

- The GKE cluster, scaled to 0 nodes (control plane stays free under the one-zonal-cluster credit)
- The VPC and Private Service Access peering
- The Cloud DNS managed zone and the GoDaddy NS delegation
- Secret Manager
- Identity Platform — user accounts and the staging tenant
- Workload Identity Federation
- Artifact Registry images
- The GCS database archive (`gs://eval-prod-485520-db-archive/`)

## What is destroyed

- The Cloud SQL instance (only after its archive is verified restorable — see "Before you hibernate" below)
- All GKE nodes (both pools scaled to 0)
- The GCLB Ingress and every in-cluster workload
- The uptime check and all 8 alert policies
- The entire NAT module (VM, boot disk, static IP, route, firewall rule)
- The global ingress static IP
- Both DNS A records — the domain goes dark; `eval.delquillan.com` and `staging.eval.delquillan.com` stop resolving entirely until wake-up

## Expected hibernated cost: ~$0.35/month

| Component | Monthly |
|---|---|
| Cloud DNS managed zone | $0.28 |
| Artifact Registry (pruned) | ~$0.05 |
| GCS database archive | ~$0.02 |
| GKE control plane | $0 (free-tier credit) |
| VPC, PSA, Secret Manager, Identity Platform, WIF | $0 |
| **Total** | **~$0.35** |

## Cluster access — two different problems

### `kubectl` — use Connect Gateway

```bash
gcloud container fleet memberships get-credentials eval-prod-gke --project eval-prod-485520
```

Connect Gateway bypasses `master_authorized_networks` entirely, so this works regardless of the operator's current IP.

### `terraform` — Connect Gateway does **not** help

`prod/main.tf:35` and `:48` point the `kubernetes` and `helm` providers at the cluster's **public** endpoint (`host = "https://${module.gke.endpoint}"`, with `enable_private_endpoint = false`), which is gated by `master_authorized_networks`. Any `terraform apply` that touches `helm_release.keda`, the `kubernetes_*` resources, or either centrifugo module fails at refresh unless the operator's current egress IP is listed in `gke_master_authorized_networks` in `infrastructure/terraform/environments/prod/terraform.tfvars`.

The devcontainer's egress IP is a dynamic residential address that has rotated before. Stale entries in the list are free, so **add** the current IP rather than swapping the old one out:

```bash
curl -s ifconfig.me
```

## `deploy-pr-staging.yaml`

[`.github/workflows/deploy-pr-staging.yaml`](../.github/workflows/deploy-pr-staging.yaml) is `workflow_dispatch`-only, so it will not fail unprompted while hibernating. Do not manually trigger it during hibernation — staging is torn down along with everything else.

## Before you hibernate

The Cloud SQL instance holds real class data that will never be reproduced. Do not run a destructive `terraform apply` until the GCS archive has been proven restorable:

```bash
./scripts/db-archive.sh                  # export -> prints gs://.../<STAMP>/*.sql.gz
./scripts/db-archive.sh --verify STAMP   # restores the dump locally, diffs row counts against prod
```

Only proceed once `--verify` reports `VERIFY OK — all databases restored cleanly and row counts match prod exactly.` A row-count mismatch, a missing table, or any error means the archive is not proven — do not destroy the instance. See `scripts/db-archive.sh`'s header comment for the full export/verify contract.

### Clearing deletion protection

The Cloud SQL instance is deliberately left protected in the committed tfvars, so prod is never unprotected during normal operation. Hibernation has to clear that, and the cleared value must reach Terraform state in **its own apply** before anything is destroyed — a combined apply can order the destroy ahead of the protection flip and fail mid-run. Override it on that one apply rather than committing `false`:

```bash
cd infrastructure/terraform/environments/prod
terraform apply -target=module.cloudsql -var cloudsql_deletion_protection=false
```

Expect exactly one in-place update. The subsequent `hibernate = true` apply needs no override: `module.cloudsql` is at `count = 0` by then, so its configuration is never evaluated and the destroy reads the cleared value from state.

Because the baseline stays `true`, there is nothing to remember to restore on wake-up — the next apply that recreates the instance protects it again automatically.

## Hibernation runbook

Do not skip straight to `hibernate = true` + `terraform apply`. Several of these steps require live nodes, and two of them exist to prevent resources that keep billing after everything else is gone.

1. **Record the deployed image digests.** Only available while nodes are up, and needed if you later prune Artifact Registry:
   ```bash
   kubectl get deploy -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{"\t"}{.spec.template.spec.containers[*].image}{"\n"}{end}'
   ```
2. **Verify the database archive** — see "Before you hibernate" above. Nothing below is reversible with respect to the class data.
3. **Delete the Ingress first, and wait for it to finish.**
   ```bash
   kubectl delete ingress app-ingress -n default
   gcloud compute forwarding-rules list    # expect empty before continuing
   ```
   Deleting the Ingress while nodes still exist lets the GCE ingress controller reclaim its forwarding rules, target proxies, backend services, and NEGs. Tear the cluster down first and those are orphaned — they survive the hibernation and keep billing, which is the one failure mode that silently defeats the whole exercise.
4. **Delete the in-cluster workloads, before the Terraform apply.**
   ```bash
   kubectl delete namespace staging
   kubectl delete -k k8s/base
   ```
   Terraform's plan scales both node pools to 0 *and* destroys KEDA, the `kubernetes_*` resources, and both centrifugo modules in one graph, with no edge forcing the Kubernetes deletions to happen before the nodes go away — `depends_on = [module.gke]` orders creates, and scaling to zero is an in-place update, not a destroy. If the nodes vanish first, the KEDA uninstall and the `staging` namespace deletion can hang on webhooks and finalizers. (If a namespace does hang in `Terminating`, check `kubectl get namespace staging -o json | jq .spec.finalizers` before forcing anything.)

   This is also what makes the wake-up ordering safe: the app Deployments are created by `kubectl apply -k` in the deploy pipeline, not by Terraform, so they are not recreated until you push. Removing them here means nothing auto-schedules the moment nodes return, which is what lets the database restore happen before go-api ever starts.
5. **Clear Cloud SQL deletion protection** as its own apply — see "Clearing deletion protection" above.
6. **Commit and push `hibernate = true` _before_ the destructive apply.** Any push to `main` in the window between the apply and the commit would run a full deploy against a nodeless cluster. A skipped deploy while the infrastructure is still up is harmless, so erring in this direction is free.
7. **`terraform apply`.** Review the plan before confirming. It should destroy `module.cloudsql`, both centrifugo modules, `helm_release.keda`, the `kubernetes_*` resources, `google_sql_database.staging`, `google_storage_bucket_iam_member.db_archive_sql`, the uptime check and all 8 alert policies, all 4 NAT resources, the global ingress address, and both DNS A records — and set `node_count = 0` on both pools.

   It must **not** touch `module.vpc`, `google_dns_managed_zone.this`, `module.secrets`, `module.identity_platform`, `module.artifact_registry`, `module.workload_identity_federation`, `google_identity_platform_tenant.staging`, `random_password.smoke_test`, or `google_storage_bucket.db_archive`.
8. **Verify.**
   ```bash
   gcloud compute instances list          # empty
   gcloud sql instances list              # empty
   gcloud compute forwarding-rules list   # empty
   gcloud compute addresses list          # empty except the PSA internal range
   gcloud compute disks list              # empty
   kubectl get nodes                      # "No resources found"
   ```

## Restoring the archive later

The dumps in `gs://eval-prod-485520-db-archive/<STAMP>/` are single-database
`pg_dump` output. Postgres roles are cluster-level, so they are **not** in the
dump — but the dumps contain ~100 `GRANT ... TO <role>` statements. Create the
grantee roles before restoring or `psql` aborts on the first grant:

```sql
CREATE ROLE app; CREATE ROLE reader; CREATE ROLE eval_app; CREATE ROLE cloudsqlsuperuser;
```

For a throwaway local copy (testing against real data), `NOLOGIN` roles are fine:

```bash
gcloud storage cp gs://eval-prod-485520-db-archive/<STAMP>/eval.sql.gz .
gunzip -k eval.sql.gz
docker run -d --name pg -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:15
docker exec pg psql -U postgres -c "CREATE ROLE app; CREATE ROLE reader; CREATE ROLE eval_app; CREATE ROLE cloudsqlsuperuser;"
docker exec pg createdb -U postgres eval
docker exec -i pg psql -v ON_ERROR_STOP=1 -U postgres -d eval < eval.sql
```

Restoring into a **woken prod** instance additionally needs `eval_app` to be a
real role with `GRANT eval_app TO app`, because `rls.go` issues
`SET ROLE eval_app` on every request. Terraform creates only `app` and `reader`;
`eval_app` comes from `migrations/008_eval_app_role.up.sql`, which golang-migrate
will **skip** because the restored `schema_migrations` marks it applied. Run it
by hand against the fresh instance before importing:

```bash
psql "host=127.0.0.1 port=5433 dbname=eval user=app sslmode=require" \
  -f migrations/008_eval_app_role.up.sql
```

`scripts/db-archive.sh --verify` does not do any of this and fails against a
real dump — see eval-aln. The archive taken at stamp `20260904T151406Z` was
verified by hand instead: restored clean with zero errors, and all 16 tables'
row counts matched live prod exactly.

## Wake-up runbook

Order matters throughout, in two places especially.

**Apply before you push, not after.** `deploy-pipeline.yaml` triggers `on: push: branches: [main]`, and the guard reads the pushed ref. So pushing `hibernate = false` *first* immediately starts a build-and-deploy run against a cluster that still has zero nodes — the exact failing run the guard exists to prevent, just approached from the other direction. Waking is the mirror image of hibernating: when going down you commit the flag *before* the destructive apply, because a skipped deploy while infra is still up is harmless; when coming back up you apply *before* the commit, for the same reason. The intermediate state (infra up, `main` still says `hibernate = true`) only causes skipped deploys.

**Restore the database before the application starts** (steps 3-4) — otherwise go-api's migrations create the schema the dump is trying to restore. This is enforced by construction rather than by how fast you type: the app Deployments were deleted in the hibernation runbook (step 4) and are recreated only by `kubectl apply -k` in the deploy pipeline, so restoring the node pools in step 2 brings back nodes with nothing scheduled on them. If you ever wake a cluster whose Deployments were *not* torn down, scale go-api to 0 replicas before applying.

1. **Set `hibernate = false`** in `infrastructure/terraform/environments/prod/terraform.tfvars`, and **add your current egress IP to `gke_master_authorized_networks`** in the same file (see "Cluster access" above — add, don't swap; stale entries are free). Do not commit yet.
   ```hcl
   hibernate = false
   ```
   `cloudsql_deletion_protection` needs no attention here — it stays `true` in the committed baseline, so the recreated instance comes back protected.
2. **`terraform apply`.** Recreates the Cloud SQL instance (empty — no data yet), restores both node pools to their normal autoscaling range, recreates ConfigMaps/Secrets/KEDA/Centrifugo and the rest of the in-cluster resources Terraform manages, recreates the NAT module, re-issues the global ingress IP, recreates both DNS A records, and re-enables the uptime check and alert policies.
3. **Restore the class data from the GCS archive. Treat this as required, not optional — and do it _before_ starting the application:**
   ```bash
   gcloud sql import sql eval-prod-db "gs://eval-prod-485520-db-archive/<STAMP>/eval.sql.gz" \
     --database=eval --project=eval-prod-485520
   ```
   Use the `<STAMP>` that `scripts/db-archive.sh --verify STAMP` last confirmed restorable before hibernation (see "Before you hibernate" above).

   **Identity Platform user accounts survive hibernation, but the `users` table does not** — Cloud SQL was destroyed during hibernation and step 2 recreated it empty. Skipping this step brings prod back with authenticated accounts that have no matching row in `users`, breaking every authenticated request.

   **Order matters here.** The dump is a full `pg_dump` — schema *and* data, including the `schema_migrations` bookkeeping table that `golang-migrate` uses. Import it into the empty database first. If you start go-api first, its migrations create the schema, and this import's `CREATE TABLE` statements then collide with the tables that already exist.
4. **Commit and push the tfvars changes from step 1.** This re-enables the deploy pipeline — the `hibernation-check` guard job in [`.github/workflows/deploy-pipeline.yaml`](../.github/workflows/deploy-pipeline.yaml) greps `terraform.tfvars` on the pushed ref, so while `main` still says `hibernate = true` every build and deploy job reports `skipped`. The push itself triggers a full build-and-deploy run against the now-live cluster, which completes the wake-up.

   If you would rather redeploy the existing images without a rebuild, push and then dispatch:
   ```bash
   gh workflow run deploy-pipeline.yaml -f redeploy=true
   ```
5. **Confirm go-api reconciled migrations on startup.** Migrations run automatically inside go-api via `db.RunMigrations` (`go-backend/cmd/server/main.go:62-66`) — there is no separate migration job. Because step 3 restored `schema_migrations` along with the data, go-api applies only migrations added to `migrations/` *since* the archive was taken; if there are none it logs `database schema is up to date`. Check the go-api pod logs and confirm one of those two outcomes — an error here means the archive predates a schema change that was never re-applied.
6. **The Ingress picks up the new IP automatically.** The deploy in step 4 recreates the Ingress, which is assigned the global IP Terraform issued in step 2. Terraform has already pointed both DNS A records at that IP (300s TTL) — no manual DNS step is needed.
7. **Wait 15-60 minutes for the GKE ManagedCertificate to re-provision.** HTTPS will not work until it does — this is expected, not a failure:
   ```bash
   kubectl describe managedcertificate -n default
   ```

## Database credentials are regenerated on wake

`module.cloudsql`'s `random_password` resources (for the `app` and `reader` users) are destroyed along with the instance and regenerated on the next `terraform apply`. Any connection string, `.env` file, or note recorded before hibernation is stale after wake-up — always re-fetch:

```bash
cd infrastructure/terraform/environments/prod
export PGPASSWORD=$(terraform output -raw cloudsql_database_password)   # app
export PGPASSWORD=$(terraform output -raw cloudsql_reader_password)     # reader
```

These two `terraform output` commands return `null` — and `-raw` errors on a null value — while hibernating, since `cloudsql_database_password`/`cloudsql_reader_password` wrap the (absent) instance's outputs in `one(...)`. See `scripts/db-proxy.sh` and `.claude/skills/debug-prod/SKILL.md` for the same note where these commands are used for day-to-day debugging.
