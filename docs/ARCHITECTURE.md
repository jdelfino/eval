# Target Architecture

## Overview

Greenfield build on GCP with Go backend, GKE Autopilot orchestration, and managed services. No data or user migration from existing systems - clean cutover when ready.

```
                           +----------------------------------------------------------+
                           |                     GCP (us-east1)                        |
                           |                 Project: eval-prod-485520                 |
                           |                                                           |
+----------------+         |  +------------------+                                     |
|    Internet    |---------+->| Cloud Load       |                                     |
+----------------+         |  | Balancing        |                                     |
                           |  +--------+---------+                                     |
                           |           |                                               |
                           |           v                                               |
                           |  +------------------------------------------------+      |
                           |  |              GKE Autopilot Cluster              |      |
                           |  |              (Private Subnet)                   |      |
                           |  |                                                 |      |
                           |  |  +------------+  +--------------+               |      |
                           |  |  | Go API     |  | Centrifugo   |               |      |
                           |  |  | (1-N pods) |  | (2 replicas) |               |      |
                           |  |  +-----+------+  +--------------+               |      |
                           |  |        |                                        |      |
                           |  |  +-----v-----------------------------+          |      |
                           |  |  | Executor Service (0-N pods)       |          |      |
                           |  |  | KEDA auto-scales to zero          |          |      |
                           |  |  | nsjail sandbox per execution      |          |      |
                           |  |  +-----------------------------------+          |      |
                           |  +------------------------------------------------+      |
                           |           |                    |                          |
                           |           |                    |                          |
                           |  +--------v--------+  +--------v----------+               |
                           |  | Identity        |  | Cloud SQL         |               |
                           |  | Platform        |  | PostgreSQL        |               |
                           |  | (Auth)          |  | (Private Service  |               |
                           |  +-----------------+  |  Access)          |               |
                           |                       +-------------------+               |
                           |                                                           |
                           |  +-----------------+  +-------------------+               |
                           |  | NAT VM          |  | GCS               |               |
                           |  | (Public Subnet) |  | (Terraform State) |               |
                           |  | e2-micro        |  +-------------------+               |
                           |  +-----------------+                                      |
                           +----------------------------------------------------------+
```

## Infrastructure Cost Estimate (~$77/month)

| Component | GCP Service | Monthly Cost |
|-----------|-------------|--------------|
| Kubernetes | GKE Autopilot | $0 control plane + ~$35 pods |
| Database | Cloud SQL (db-g1-small) | ~$15 |
| Authentication | Identity Platform | Free tier |
| NAT Gateway | NAT VM (e2-micro) | ~$6 |
| Load Balancer | Cloud Load Balancing | ~$20 |
| State Storage | Cloud Storage (GCS) | < $1 |
| **Total** | | **~$77** |

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend | Go | Separate from Next.js frontend, good k8s tooling |
| Orchestration | GKE Autopilot | Fully managed k8s, no node management, automatic scaling |
| Database | Cloud SQL PostgreSQL | With RLS via session variables, Private Service Access |
| Auth | Identity Platform | Enterprise IdP federation, SAML support |
| Real-time | Centrifugo | Managed WS server, Go API just publishes |
| Code Execution | Executor service + KEDA | Auto-scales 0-N, nsjail sandbox |
| Cache/Pub-Sub | Memorystore Redis | Stateless message routing |
| IaC | Terraform | Industry standard |

## GCP-Specific Patterns

### Private GKE with NAT VM

GKE Autopilot runs in a private subnet with no public IPs. Outbound internet access (for pulling container images, external APIs) routes through a NAT VM:

- **Cost optimization**: NAT VM (e2-micro) costs ~$6/mo vs Cloud NAT ~$30+/mo
- **Trade-off**: Single point of failure, but acceptable for non-critical outbound traffic
- **Implementation**: NAT VM in public subnet with IP forwarding enabled

### Cloud SQL Private Service Access

Cloud SQL PostgreSQL connects via Private Service Access (PSA):

- No public IP on database
- VPC peering for private connectivity
- Automatic DNS resolution within VPC

### Identity Platform Authentication

Identity Platform provides enterprise-grade auth:

- SAML federation for enterprise IdPs
- Built-in user management
- JWT tokens for stateless auth
- Free tier covers typical usage

### GKE Autopilot Benefits

- Zero node management
- Pay only for pod resources
- Automatic security hardening
- Built-in workload identity

## Core Library

The central abstraction is a **library** (not a CLI) that encapsulates:

### Template Operations
- Initialize assignment structure
- Validate solution against tests
- Lint configuration
- Render instructions

### Grading Operations
- Run tests against student code
- Capture structured results
- Package submissions

### Repository Operations
- Create student repos from templates
- Sync platform-controlled files
- Diff for drift detection

The platform imports this library directly. A thin CLI can wrap it for standalone use.

## Component Details

### Go API

Core application serving HTTP endpoints.

```
go-backend/
├── cmd/server/           # main.go, startup
├── internal/
│   ├── config/           # Environment, feature flags
│   ├── auth/             # Identity Platform JWT validation, RBAC
│   ├── middleware/       # Logging, rate limit, RLS context
│   ├── db/               # Connection pool, transactions
│   ├── repository/       # Data access layer
│   ├── service/          # Business logic
│   ├── handler/          # HTTP handlers
│   └── realtime/         # Centrifugo client
└── pkg/
    └── assignment/       # Core library (template, grade, repo)
```

**RLS Middleware:**
```go
func RLSContextMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        user := auth.UserFromContext(r.Context())
        db.SetUserContext(user.ID, user.NamespaceID)
        next.ServeHTTP(w, r)
    })
}
```

### Centrifugo (Real-time)

Battle-tested WebSocket server handling all connection complexity.

**What Centrifugo handles:**
- Connection management and scaling
- Channel subscriptions (`session:{id}`)
- Redis-backed horizontal scaling
- JWT authentication
- Automatic reconnection
- Message history/recovery

**Go API integration:**
```go
func (c *CentrifugoClient) Publish(channel string, data any) error {
    payload, _ := json.Marshal(map[string]any{
        "method": "publish",
        "params": map[string]any{"channel": channel, "data": data},
    })
    req, _ := http.NewRequest("POST", c.apiURL, bytes.NewReader(payload))
    req.Header.Set("Authorization", "apikey "+c.apiKey)
    return http.DefaultClient.Do(req)
}
```

### Executor Service (Code Execution)

Stateless HTTP service that runs student code in nsjail sandboxes.

- KEDA scales 0-N based on request rate
- Each execution isolated via nsjail
- No per-session orchestration needed

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  minReplicaCount: 0
  maxReplicaCount: 10
  cooldownPeriod: 300  # 5 min before scaling down
```

### Database Schema

Cloud SQL PostgreSQL with row-level security via session variables.

```sql
-- RLS using session variables (not Supabase auth.uid())
CREATE POLICY "users_own_sessions" ON sessions
  USING (current_setting('app.user_id', true)::uuid = created_by);
```

## Stateless Design Requirements

All state must be externalized:

| Data Type | Storage |
|-----------|---------|
| Persistent data | Cloud SQL PostgreSQL |
| User sessions | Stateless JWT (Identity Platform) |
| WebSocket routing | Centrifugo (Redis-backed) |
| Rate limits | Memorystore Redis |
| Code execution | Stateless service (nsjail per-execution) |
| Caching | Memorystore Redis |
| Terraform state | Cloud Storage (GCS) |

**Forbidden:**
- In-memory caches
- File system writes
- Sticky sessions
- Global mutable state

## API Surface

| Area | Endpoints | Priority |
|------|-----------|----------|
| Auth | 7 | First |
| Namespaces | 6 | Second |
| Classes/Sections | 11 | Third |
| Problems | 2 | Third |
| Sessions | 15 | Fourth |
| Admin | 6 | Fifth |
| Invitations | 6 | Fifth |

~55 total endpoints.

## Network Architecture

### VPC Layout

| Subnet | CIDR | Purpose |
|--------|------|---------|
| GKE | 10.0.0.0/20 | GKE Autopilot pods and services |
| Cloud SQL | 10.0.16.0/24 | Private Service Access for Cloud SQL |
| Public | 10.0.32.0/24 | NAT VM, bastion (if needed) |

### Firewall Rules

- Ingress: Cloud Load Balancing to GKE (HTTPS)
- Egress: GKE to Cloud SQL (PostgreSQL 5432)
- Egress: GKE to NAT VM for internet access
- Internal: All VPC traffic allowed

## Open Decisions

| Decision | Options |
|----------|---------|
| Go HTTP framework | Chi, Echo, or Gin |
| Domain/DNS | Same domain or new |
| Redis deployment | Memorystore vs self-managed on GKE |
