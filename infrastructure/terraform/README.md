# Terraform Infrastructure

This directory contains the Terraform configuration for the eval platform infrastructure.

## Directory Structure

```
infrastructure/terraform/
├── bootstrap/                    # One-time state backend setup
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── README.md
├── modules/                      # Reusable modules (no env-specific values)
│   ├── vpc/
│   ├── eks/
│   ├── rds/
│   ├── cognito/
│   ├── ses/
│   └── redis/
└── environments/                 # Environment-specific instantiation
    ├── staging/
    │   ├── main.tf               # Instantiates modules
    │   ├── backend.tf            # S3 state with staging/ prefix
    │   ├── variables.tf          # Variable definitions
    │   ├── terraform.tfvars      # Staging-specific values
    │   ├── outputs.tf
    │   └── versions.tf
    └── prod/
        ├── main.tf
        ├── backend.tf            # S3 state with prod/ prefix
        ├── variables.tf
        ├── terraform.tfvars      # Prod-specific values
        ├── outputs.tf
        └── versions.tf
```

## Environment Strategy

| Environment | Purpose | AWS Resources |
|-------------|---------|---------------|
| Local | Fast dev, unit tests | None (Docker Compose) |
| Staging | CI/CD, E2E tests, integration | Full AWS stack |
| Prod | Real users | Full AWS stack (isolated) |

## Module Design Principles

1. **Modules are environment-agnostic** - no hardcoded values
2. **Required variables have no defaults** - forces explicit config per env
3. **Environment configs provide all values** - via tfvars
4. **State isolation** - separate S3 prefixes per environment
5. **Same module, different tfvars** - staging and prod use identical module code

## Common Variables

Every module accepts these standard variables:

| Variable | Description |
|----------|-------------|
| `environment` | Environment name ("staging" or "prod") |
| `project_name` | Project name for resource naming/tagging |
| `region` | AWS region |

## Getting Started

### 1. Bootstrap State Backend

First, create the S3 bucket and DynamoDB table for remote state:

```bash
cd infrastructure/terraform/bootstrap
terraform init
terraform apply -var="project_name=eval" -var="region=us-west-2"
```

### 2. Deploy an Environment

```bash
cd infrastructure/terraform/environments/staging
terraform init
terraform plan
terraform apply
```

## Configuration Flow: Modules to Applications

Infrastructure modules export outputs that applications need (connection strings, IDs, endpoints). The pattern for getting these values to running applications:

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Module outputs  │ ──▶ │ Environment TF      │ ──▶ │ K8s Pod     │
│ (cognito, rds)  │     │ creates ConfigMap/  │     │ gets env    │
│                 │     │ Secret              │     │ vars        │
└─────────────────┘     └─────────────────────┘     └─────────────┘
```

### ConfigMap/Secret Pattern

Environment Terraform creates Kubernetes resources that expose module outputs:

```hcl
# environments/staging/main.tf
resource "kubernetes_config_map" "app_config" {
  metadata { name = "app-config" }
  data = {
    COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    COGNITO_CLIENT_ID    = module.cognito.client_id
    COGNITO_DOMAIN       = module.cognito.domain_url
    AWS_REGION           = var.region
    DATABASE_HOST        = module.rds.endpoint
    REDIS_HOST           = module.redis.endpoint
  }
}

resource "kubernetes_secret" "app_secrets" {
  metadata { name = "app-secrets" }
  data = {
    COGNITO_CLIENT_SECRET = module.cognito.client_secret
    DATABASE_PASSWORD     = module.rds.password
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

### Module Output Example: Cognito

Modules export all values needed by applications:

```hcl
# modules/cognito/outputs.tf
output "user_pool_id" { value = aws_cognito_user_pool.main.id }
output "client_id" { value = aws_cognito_user_pool_client.main.id }
output "client_secret" { value = aws_cognito_user_pool_client.main.client_secret sensitive = true }
output "domain_url" { value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com" }
```

## Local Development

For local development, the same environment variables are provided via `.env` file instead of Kubernetes ConfigMaps. See `.env.example` at the repository root.

Application code reads environment variables the same way in all environments - only the source differs:
- **Local**: `.env` file (loaded by Docker Compose or dotenv)
- **Staging/Prod**: Kubernetes ConfigMap and Secret

This ensures consistent behavior across environments.

## State Management

| Environment | State Location |
|-------------|----------------|
| Bootstrap | Local (terraform.tfstate) |
| Staging | s3://eval-terraform-state/staging/terraform.tfstate |
| Prod | s3://eval-terraform-state/prod/terraform.tfstate |

State locking uses DynamoDB to prevent concurrent modifications.

## Adding New Modules

1. Create module directory under `modules/`
2. Define `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`
3. Include common variables (`environment`, `project_name`, `region`)
4. Export all values needed by applications
5. Instantiate in both `environments/staging/main.tf` and `environments/prod/main.tf`
6. Add module outputs to ConfigMap/Secret resources
7. Update `.env.example` with local development equivalents

## Security Notes

- Secrets are managed via Kubernetes Secrets (created by Terraform)
- RDS passwords are generated and stored in Terraform state (encrypted)
- Cognito client secrets are sensitive outputs
- Never commit `.tfvars` files with real secrets
- Use AWS Secrets Manager for additional secret management if needed
