# Epic: Wire Up Resend Email for Invitations

## Goal
Get invitation emails actually sending in production by wiring up the Resend API key via GCP Secret Manager, adding missing config, fixing silent email failures, and migrating existing 1Password secrets to GCP Secret Manager.

## Design Decisions (Agreed)
- **Secret Manager module**: New reusable `infrastructure/terraform/modules/secrets/` module
- **Email failure policy**: Best-effort — log at WARN, return `email_sent: bool` in response so frontend can offer resend
- **Scope**: Migrate ALL 1Password-sourced secrets (oauth_client_id, oauth_client_secret) to GCP Secret Manager alongside RESEND_API_KEY

## Subtasks

### 1. Create GCP Secret Manager Terraform module
Create `infrastructure/terraform/modules/secrets/` following the standard module pattern.

**What it does:**
- Accepts a map of secret IDs to manage
- Creates `google_secret_manager_secret` resources
- Exposes `data.google_secret_manager_secret_version` for reading values
- Outputs secret values for consumption by other resources (k8s secrets)

**Files:**
- `infrastructure/terraform/modules/secrets/variables.tf` — input: map of secret names
- `infrastructure/terraform/modules/secrets/main.tf` — Secret Manager resources
- `infrastructure/terraform/modules/secrets/outputs.tf` — secret values (sensitive)
- `infrastructure/terraform/modules/secrets/versions.tf` — google provider ~> 5.0

**Note:** Secret *values* are set manually in GCP Console or via `gcloud` — Terraform manages the secret resource and reads the latest version. This avoids storing secret values in tfvars/state.

### 2. Wire secrets module into prod environment
Integrate the new module into `infrastructure/terraform/environments/prod/main.tf`.

**Changes:**
- Add `module "secrets"` block referencing the new module
- Manage 3 secrets: `resend-api-key`, `oauth-client-id`, `oauth-client-secret`
- Update `kubernetes_secret.app_secrets` to read from Secret Manager outputs instead of tfvars
- Add `RESEND_API_KEY` to `kubernetes_secret.app_secrets`
- Add `INVITE_BASE_URL` to `kubernetes_config_map.app_config`
- Remove `oauth_client_id` and `oauth_client_secret` variables from `variables.tf` (no longer needed as tfvars inputs)
- Delete `secrets.tfvars.1password` and `secrets.tfvars` (no longer needed)
- Enable `secretmanager.googleapis.com` API if not already enabled

### 3. Fix silent email failure in invitation handlers (PLAT-px6)
Add a logger to `InvitationHandler`, log email failures, and return `email_sent` in the response.

**Files:**
- `go-backend/internal/handler/invitations.go`
  - Add `logger *slog.Logger` field to `InvitationHandler` struct (line 20)
  - Update `NewInvitationHandler` to accept `*slog.Logger` (line 26)
  - In `Create` (line 127): replace `_ =` with error check, log at WARN, set `email_sent` field
  - In `SystemCreate` (line 313): same fix
  - Add `email_sent` to invitation response (all create/system-create responses)
- `go-backend/internal/server/server.go`
  - Pass logger to `NewInvitationHandler` (line 226)
- `go-backend/internal/email/resend.go`
  - No changes needed (already returns errors properly)

### 4. Update .env.example and local dev config
Document the new env vars for local development.

**Files:**
- `.env.example` — add `RESEND_API_KEY` and `INVITE_BASE_URL` with comments
- `.env.1password` — add `RESEND_API_KEY` reference (for devs using 1Password locally)

### 5. Add tests for email failure logging
Cover the new behavior with unit tests.

**Files:**
- `go-backend/internal/handler/invitations_test.go`
  - Test that Create returns `email_sent: true` when email succeeds
  - Test that Create returns `email_sent: false` when email client returns error
  - Test that email error is logged (inject test logger, verify log output)

## Dependencies
- Task 1 (TF module) blocks Task 2 (wire into prod)
- Task 3 (handler fix) blocks Task 5 (tests)
- Tasks 1 and 3 are independent and can be worked in parallel
- Task 4 is independent

## Migration Steps (Manual, Not Automated)
After Terraform changes are applied, an operator must:
1. Create secrets in GCP Secret Manager: `gcloud secrets create resend-api-key --replication-policy=automatic`
2. Set secret values: `echo -n "re_xxx" | gcloud secrets versions add resend-api-key --data-file=-`
3. Same for oauth-client-id and oauth-client-secret (copy values from 1Password)
4. Run `terraform apply` — it will read from Secret Manager and update k8s secrets
5. Verify pods pick up new env vars (rolling restart if needed)
