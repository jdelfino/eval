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

Order matters. Steps 1-3 must happen **in that order** — the deploy guard below reads tfvars off the pushed `main` branch, not local state, so pushing before waking the infrastructure (or waking it without pushing) leaves the deploy pipeline permanently skipping.

1. **Set `hibernate = false` and restore deletion protection** in `infrastructure/terraform/environments/prod/terraform.tfvars`:
   ```hcl
   hibernate                     = false
   cloudsql_deletion_protection  = true
   ```
2. **Add your current egress IP to `gke_master_authorized_networks`** in the same file (see "Cluster access" above). Add, don't swap — stale entries are free.
3. **Commit and push both changes to `main` before running `terraform apply`.** The `hibernation-check` guard job in [`.github/workflows/deploy-pipeline.yaml`](../.github/workflows/deploy-pipeline.yaml) greps `terraform.tfvars` *on the pushed ref*. If `hibernate = true` is still what's on `main`, `deploy-prod` (and every build/staging job) keeps reporting `skipped` even after Terraform has recreated the infrastructure underneath it — the wake-up silently does nothing on the deploy side.
4. **`terraform apply`.** Recreates the Cloud SQL instance (empty — no data yet), restores both node pools to their normal autoscaling range, recreates ConfigMaps/Secrets/KEDA/Centrifugo and the rest of the in-cluster resources Terraform manages, recreates the NAT module, re-issues the global ingress IP, recreates both DNS A records, and re-enables the uptime check and alert policies.
5. **Trigger a redeploy:**
   ```bash
   gh workflow run deploy-pipeline.yaml -f redeploy=true
   ```
   This deploys the current live image tags (no rebuild) onto the freshly recreated cluster.
6. **Confirm go-api applied migrations on startup.** Migrations run automatically inside go-api via `db.RunMigrations` (`go-backend/cmd/server/main.go:62-66`) — there is no separate migration job. Check the go-api pod logs for the migration-applied message before proceeding to the next step; the `users` table (and everything else) does not exist until this runs against the fresh, empty database from step 4.
7. **Restore the class data from the GCS archive. Treat this as required, not optional:**
   ```bash
   gcloud sql import sql eval-prod-db "gs://eval-prod-485520-db-archive/<STAMP>/eval.sql.gz" \
     --database=eval --project=eval-prod-485520
   ```
   Use the `<STAMP>` that `scripts/db-archive.sh --verify STAMP` last confirmed restorable before hibernation (see "Before you hibernate" above). **Identity Platform user accounts survive hibernation, but the `users` table does not** — Cloud SQL was destroyed in step 4's predecessor and recreated empty. Skipping this step brings prod back with authenticated accounts that have no matching row in `users`, breaking every authenticated request.
8. **The Ingress picks up the new IP automatically.** The redeploy in step 5 recreates the Ingress, which is assigned the global IP Terraform issued in step 4. Terraform has already pointed both DNS A records at that IP (300s TTL) — no manual DNS step is needed.
9. **Wait 15-60 minutes for the GKE ManagedCertificate to re-provision.** HTTPS will not work until it does — this is expected, not a failure:
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
