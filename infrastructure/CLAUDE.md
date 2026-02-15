# Infrastructure

## Rules

- **NEVER run `terraform apply`** — only the human operator applies infrastructure changes. `terraform plan` is fine for verifying changes.

## Structure

```
terraform/
├── modules/                          # Reusable, environment-agnostic modules
│   ├── vpc/                          # VPC with subnets for GKE and Cloud SQL
│   ├── gke/                          # GKE Standard cluster
│   ├── cloudsql/                     # Cloud SQL PostgreSQL
│   ├── identity-platform/            # Identity Platform (authentication)
│   ├── nat/                          # NAT VM for outbound internet access
│   ├── artifact-registry/            # Artifact Registry for container images
│   └── workload-identity-federation/ # WIF for GitHub Actions auth
└── environments/                     # Environment-specific instantiation
    └── prod/                         # Instantiates modules, creates K8s ConfigMaps/Secrets
```

## Module Design

- Modules are environment-agnostic — no hardcoded values
- Required variables have no defaults — forces explicit config per env
- Environment configs provide all values via tfvars
- Same module code, different tfvars per environment

## Common Variables

Every module accepts: `environment`, `project_name`, `project_id`, `region`.

## Infra → App Configuration Flow

Modules export outputs → environment TF creates K8s ConfigMap/Secret → pods read env vars via `envFrom`. See `environments/prod/main.tf` for the ConfigMap/Secret definitions.

## Executor Node Pool

The executor node pool uses the default COS image. nsjail runs with `--disable_clone_newuser` and `--experimental_mnt old` to avoid kernel restrictions on user namespaces and locked mounts inside containers. The executor pod requires `privileged: true` and runs on a dedicated node pool.

## State

| Environment | State Location |
|-------------|----------------|
| Prod | `gs://eval-prod-485520-terraform-state/terraform/prod` |
