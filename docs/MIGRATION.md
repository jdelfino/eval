# Migration Plan

## Approach: Greenfield Build

Build the new architecture from scratch alongside any existing app. No data migration, no user migration - clean cutover when ready.

| Aspect | Implication |
|--------|-------------|
| No data migration | Skip schema/data sync complexity |
| No user migration | Fresh Identity Platform config, no password reset flow |
| Parallel development | Old app untouched until cutover |
| Incremental build | Build in any order that makes sense |

## Phase Overview

### Phase 1: Infrastructure Foundation

Build GCP infrastructure first - everything else depends on it.

**Terraform modules:**
- vpc/ - VPC, subnets, firewall rules
- gke/ - GKE Autopilot cluster
- cloudsql/ - Cloud SQL PostgreSQL
- identity-platform/ - Authentication
- nat/ - NAT VM for outbound internet

**Deliverable:** Working GKE cluster with all supporting services.

### Phase 2: Auth + Database Schema

Can work in parallel once infrastructure exists.

**Identity Platform Setup:**
- Email/password authentication
- SAML identity provider configuration (via Console)
- OAuth client for web app
- JWT validation configuration

**Database Schema:**
- Apply migrations to fresh Cloud SQL
- RLS policies using `current_setting('app.user_id')`
- No Supabase-specific references

**Deliverable:** Auth working end-to-end, empty database ready.

### Phase 3: Go API Foundation

Core application scaffolding.

- Project structure with config, auth, middleware, db layers
- Identity Platform JWT validation
- RLS context middleware
- Health checks and basic observability

**Deliverable:** Skeleton app deployed to GKE, health checks passing.

### Phase 4: Core API Routes

Build API routes by functional area, ordered by dependency:

1. Auth routes (login, register, me) - needed for everything
2. Namespace/Admin routes - tenant setup
3. Classes/Sections routes - course structure
4. Problems routes - content management
5. Sessions routes - core functionality

### Phase 5: Real-time (Centrifugo)

Deploy Centrifugo to GKE with in-cluster Redis.

- Configure JWT authentication
- Set up channel patterns
- Integrate publish calls from Go API
- Update frontend to use centrifuge-js

**Message types:**
- student_joined
- student_code_updated
- session_ended
- featured_student_changed
- problem_updated

### Phase 6: Code Execution

Deploy executor service with KEDA autoscaling.

- Python executor with nsjail sandbox
- HTTP endpoint for code execution
- Prometheus metrics for KEDA scaling
- Integration with Go API

### Phase 7: Frontend Updates

Minimal changes to Next.js client:

- Switch auth provider to Firebase Auth SDK (for Identity Platform)
- Update API client base URL
- Replace Supabase real-time with centrifuge-js
- Update WebSocket hooks

### Phase 8: Testing + Cutover

- E2E tests against new stack
- Load testing (verify stateless scaling)
- DNS cutover
- Decommission old infrastructure

## Effort Breakdown

| Phase | Relative Effort |
|-------|-----------------|
| 1. Infrastructure (Terraform) | 15% |
| 2. Auth + Schema | 8% |
| 3. Go Foundation | 10% |
| 4. API Routes | 30% |
| 5. Centrifugo + client | 8% |
| 6. Executor Service | 10% |
| 7. Frontend Updates | 8% |
| 8. Testing + Cutover | 7% |

## Simplified by Greenfield Approach

| Removed Complexity | Why |
|--------------------|-----|
| Data migration | No existing data to move |
| User migration | Fresh Identity Platform |
| Password reset flow | New users register fresh |
| Dual system operation | Old app untouched |
| Schema compatibility | Fresh schema design |
| RLS policy migration | Write RLS fresh for Cloud SQL |
