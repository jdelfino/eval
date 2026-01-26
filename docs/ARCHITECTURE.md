# Target Architecture

## Overview

Greenfield build on AWS with Go backend, EKS orchestration, and managed services. No data or user migration from existing systems - clean cutover when ready.

```
                    +-----------------------------------------------------------+
                    |                          AWS                               |
                    |                                                            |
+------------+      |  +---------+    +------------------------------------+     |
| CloudFront |------+->|   ALB   |--->|           EKS/Fargate              |     |
+------------+      |  +---------+    |  +------------+  +--------------+  |     |
                    |        |        |  | Go API     |  | Centrifugo   |  |     |
                    |        |        |  | (1-N pods) |  | (2 replicas) |  |     |
                    |        |        |  +-----+------+  +--------------+  |     |
                    |        |        |        |                           |     |
                    |        |        |  +-----v-----------------------+   |     |
                    |        |        |  | Executor Service (0-N pods) |   |     |
                    |        |        |  | KEDA auto-scales to zero    |   |     |
                    |        |        |  | nsjail sandbox per execution|   |     |
                    |        |        |  +-----------------------------+   |     |
                    |        |        +------------------------------------+     |
                    |        |                    |                              |
                    |  +-----v-----+    +---------+---------+                    |
                    |  |  Cognito  |    |                   |                    |
                    |  |  + SAML   |    v                   v                    |
                    |  +-----------+ +----------+     +----------+               |
                    |                |ElastiCache|    |   RDS    |               |
                    |                |  (Redis)  |    |(Postgres)|               |
                    |                +----------+     +----------+               |
                    +-----------------------------------------------------------+
```

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend | Go | Separate from Next.js frontend, good k8s tooling |
| Orchestration | EKS + Fargate | Managed k8s, no node management |
| Database | RDS PostgreSQL | With RLS via session variables |
| Auth | Cognito + SAML | Enterprise IdP federation |
| Real-time | Centrifugo | Managed WS server, Go API just publishes |
| Code Execution | Executor service + KEDA | Auto-scales 0-N, nsjail sandbox |
| Cache/Pub-Sub | ElastiCache Redis | Stateless message routing |
| IaC | Terraform | Industry standard |

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
│   ├── auth/             # Cognito JWT validation, RBAC
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

RDS PostgreSQL with row-level security via session variables.

```sql
-- RLS using session variables (not Supabase auth.uid())
CREATE POLICY "users_own_sessions" ON sessions
  USING (current_setting('app.user_id', true)::uuid = created_by);
```

## Stateless Design Requirements

All state must be externalized:

| Data Type | Storage |
|-----------|---------|
| Persistent data | RDS PostgreSQL |
| User sessions | Stateless JWT (Cognito) |
| WebSocket routing | Centrifugo (Redis-backed) |
| Rate limits | Redis |
| Code execution | Stateless service (nsjail per-execution) |
| Caching | Redis |

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

## Open Decisions

| Decision | Options |
|----------|---------|
| Go HTTP framework | Chi, Echo, or Gin |
| Domain/DNS | Same domain or new |
