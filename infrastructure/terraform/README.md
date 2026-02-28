# Terraform Infrastructure

This directory contains the Terraform configuration for the eval platform infrastructure on Google Cloud Platform.

## Directory Structure

```
infrastructure/terraform/
├── modules/                      # Reusable modules (no env-specific values)
│   ├── vpc/                      # VPC with subnets for GKE and Cloud SQL
│   ├── gke/                      # GKE cluster
│   ├── cloudsql/                 # Cloud SQL PostgreSQL
│   ├── identity-platform/        # Identity Platform (authentication)
│   ├── nat/                      # NAT VM for outbound internet access
│   ├── artifact-registry/        # Artifact Registry for container images
│   └── workload-identity-federation/  # WIF for GitHub Actions auth
└── environments/                 # Environment-specific instantiation
    └── prod/
        ├── main.tf               # Instantiates modules
        ├── backend.tf            # GCS state backend
        ├── variables.tf          # Variable definitions
        ├── terraform.tfvars      # Prod-specific values
        ├── outputs.tf
        └── versions.tf
```

## Environment Strategy

| Environment | Purpose | GCP Resources |
|-------------|---------|---------------|
| Local | Fast dev, unit tests | None (Docker Compose) |
| Prod | Real users | Full GCP stack |

## Module Design Principles

1. **Modules are environment-agnostic** - no hardcoded values
2. **Required variables have no defaults** - forces explicit config per env
3. **Environment configs provide all values** - via tfvars
4. **State isolation** - GCS bucket with separate prefixes per environment
5. **Same module, different tfvars** - environments use identical module code

## Common Variables

Every module accepts these standard variables:

| Variable | Description |
|----------|-------------|
| `environment` | Environment name ("staging" or "prod") |
| `project_name` | Project name for resource naming/tagging |
| `project_id` | GCP project ID |
| `region` | GCP region |

## Getting Started

### 1. Set Up GCP Project

Ensure you have:
- A GCP project with billing enabled
- Required APIs enabled: compute, container, sqladmin, identitytoolkit, iam, storage
- Application Default Credentials configured: `gcloud auth application-default login`

### 2. Create State Bucket

Create a GCS bucket for Terraform state:

```bash
gsutil mb -l us-east1 gs://<project-id>-terraform-state
gsutil versioning set on gs://<project-id>-terraform-state
```

### 3. Deploy an Environment

```bash
cd infrastructure/terraform/environments/prod
terraform init
terraform plan
terraform apply
```

## Configuration Flow: Modules to Applications

Infrastructure modules export outputs that applications need (connection strings, IDs, endpoints). The pattern for getting these values to running applications:

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Module outputs  │ ──▶ │ Environment TF      │ ──▶ │ K8s Pod     │
│ (identity,      │     │ creates ConfigMap/  │     │ gets env    │
│  cloudsql)      │     │ Secret              │     │ vars        │
└─────────────────┘     └─────────────────────┘     └─────────────┘
```

### ConfigMap/Secret Pattern

Environment Terraform creates Kubernetes resources that expose module outputs:

```hcl
# environments/prod/main.tf
resource "kubernetes_config_map" "app_config" {
  metadata { name = "app-config" }
  data = {
    GCP_PROJECT_ID                = var.project_id
    GCP_REGION                    = var.region
    IDENTITY_PLATFORM_API_KEY     = module.identity_platform.api_key
    IDENTITY_PLATFORM_AUTH_DOMAIN = module.identity_platform.auth_domain
    DATABASE_HOST                 = module.cloudsql.database_host
    DATABASE_PORT                 = module.cloudsql.database_port
    DATABASE_NAME                 = module.cloudsql.database_name
  }
}

resource "kubernetes_secret" "app_secrets" {
  metadata { name = "app-secrets" }
  data = {
    OAUTH_CLIENT_SECRET = module.identity_platform.oauth_client_secret
    DATABASE_PASSWORD   = module.cloudsql.database_password
    DATABASE_URL        = module.cloudsql.connection_string_full
  }
}
```

### Kubernetes Deployment

Pods reference these resources via `envFrom`:

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          envFrom:
            - configMapRef:
                name: app-config
            - secretRef:
                name: app-secrets
```

### Module Output Example: Identity Platform

Modules export all values needed by applications:

```hcl
# modules/identity-platform/outputs.tf
output "api_key" { value = google_identity_platform_config.main.client[0].api_key sensitive = true }
output "auth_domain" { value = "${var.project_id}.firebaseapp.com" }
output "oauth_client_id" { value = var.oauth_client_id }
output "oauth_client_secret" { value = var.oauth_client_secret sensitive = true }
```

## Local Development

For local development, the same environment variables are provided via `.env` file instead of Kubernetes ConfigMaps. See `.env.example` at the repository root.

Application code reads environment variables the same way in all environments - only the source differs:
- **Local**: `.env` file (loaded by Docker Compose or dotenv)
- **Prod**: Kubernetes ConfigMap and Secret

This ensures consistent behavior across environments.

## State Management

| Environment | State Location |
|-------------|----------------|
| Prod | gs://eval-prod-485520-terraform-state/terraform/prod |

State locking is built into the GCS backend.

## Adding New Modules

1. Create module directory under `modules/`
2. Define `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`
3. Include common variables (`environment`, `project_name`, `project_id`, `region`)
4. Export all values needed by applications
5. Instantiate in `environments/prod/main.tf`
6. Add module outputs to ConfigMap/Secret resources
7. Update `.env.example` with local development equivalents

## Security Notes

- Secrets are managed via Kubernetes Secrets (created by Terraform)
- Cloud SQL passwords are generated and stored in Terraform state (encrypted)
- OAuth client secrets are sensitive outputs
- Never commit `.tfvars` files with real secrets
- Use GCP Secret Manager for additional secret management if needed
