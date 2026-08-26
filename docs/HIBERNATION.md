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

## Wake-up runbook

Order matters throughout, in two places especially.

**Apply before you push, not after.** `deploy-pipeline.yaml` triggers `on: push: branches: [main]`, and the guard reads the pushed ref. So pushing `hibernate = false` *first* immediately starts a build-and-deploy run against a cluster that still has zero nodes — the exact failing run the guard exists to prevent, just approached from the other direction. Waking is the mirror image of hibernating: when going down you commit the flag *before* the destructive apply, because a skipped deploy while infra is still up is harmless; when coming back up you apply *before* the commit, for the same reason. The intermediate state (infra up, `main` still says `hibernate = true`) only causes skipped deploys.

**Restore the database before the application starts** (steps 3-4) — otherwise go-api's migrations create the schema the dump is trying to restore.

1. **Set `hibernate = false` and restore deletion protection** in `infrastructure/terraform/environments/prod/terraform.tfvars`, and **add your current egress IP to `gke_master_authorized_networks`** in the same file (see "Cluster access" above — add, don't swap; stale entries are free). Do not commit yet.
   ```hcl
   hibernate                     = false
   cloudsql_deletion_protection  = true
   ```
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
