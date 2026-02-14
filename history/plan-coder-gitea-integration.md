# Plan: Initial Coder + Gitea Integration

## Goal

Add Gitea (internal git server) and Coder (workspace orchestration) as new infrastructure services, with enough platform integration to prove the end-to-end flow: instructor creates an assignment, student starts it and gets a browser-based VS Code workspace with a cloned repo.

## Decisions Made

- **Git backend**: Gitea (lightweight, self-hosted, admin API for programmatic repo management)
- **Assignment scope**: Class-level definitions, with per-section release config (`section_assignments` join table)
- **Service config**: Environment variables (GITEA_URL, GITEA_TOKEN, CODER_URL, CODER_TOKEN)
- **Workspace template**: Single combined template (Python + Java + Node.js in one image, ~820 MB)
- **IDE access**: code-server inside workspace, proxied through Coder server (browser-based VS Code)
- **Local dev**: Gitea + Coder added to existing docker-compose.yml
- **Coder DB**: Separate database in shared Postgres instance (`CREATE DATABASE coder;`)

## Architecture

```
Platform (Go API)          Gitea                    Coder
─────────────────          ─────                    ─────
                           Hosts git repos          Orchestrates workspaces
                           ├─ source repos          ├─ VS Code Web (code-server)
                           ├─ student repos         ├─ Docker containers (local)
                           └─ HTTP clone access     └─ K8s pods (production)

Platform creates repo ──→ Gitea Admin API
Platform creates workspace ──→ Coder API (template refs Gitea repo URL)
Student opens workspace ──→ Coder proxies to code-server in container
```

Auth: Platform uses admin API tokens for both Gitea and Coder (service-to-service). No student-facing Gitea/Coder accounts in this initial epic.

## Subtasks

### 1. Add Gitea to docker-compose and local dev

**Summary**: Add Gitea as a docker-compose service so it's available for local development. Configure it with a default admin user and organization for the platform.

**Files to modify**:
- `docker-compose.yml` — add gitea service
- `Makefile` — ensure `make dev` / `make deps-up` brings up Gitea; add seed step to create default org/token
- `docs/LOCAL_DEV.md` — document Gitea access (http://localhost:3000, admin creds)

**Implementation steps**:
1. Add `gitea` service to docker-compose.yml:
   - Image: `gitea/gitea:1.22` (or latest stable)
   - Ports: 3000 (HTTP), 2222 (SSH)
   - Volume: `eval-gitea-data:/data`
   - Environment: `GITEA__security__INSTALL_LOCK=true` (skip install wizard), `GITEA__server__ROOT_URL=http://localhost:3000`
2. Add initialization script or seed step:
   - Create admin user (`gitea-admin` / known password)
   - Create admin API token for platform use
   - Create default organization (e.g., `eval`)
3. Add `GITEA_URL` and `GITEA_TOKEN` to `.env.example`
4. Update LOCAL_DEV.md

### 2. Add Coder to docker-compose and local dev

**Summary**: Add Coder server as a docker-compose service. Locally it manages workspaces as Docker containers. Uses a separate database in the shared Postgres instance.

**Files to modify**:
- `docker-compose.yml` — add coder service
- `Makefile` — ensure Coder starts with deps
- `docs/LOCAL_DEV.md` — document Coder access (http://localhost:7080)

**Implementation steps**:
1. Add `coder` service to docker-compose.yml:
   - Image: `ghcr.io/coder/coder:latest`
   - Ports: 7080 (HTTP)
   - Volume: mount Docker socket so Coder can create workspace containers
   - Environment: `CODER_ACCESS_URL=http://localhost:7080`, `CODER_TELEMETRY_ENABLE=false`, `CODER_PG_CONNECTION_URL=postgres://...`
   - Depends on: postgres
2. Create `coder` database in Postgres (via init script or seed step)
3. Create admin user and generate API token during init
4. Add `CODER_URL` and `CODER_TOKEN` to `.env.example`
5. Note: For local dev, Coder creates Docker containers (not k8s pods). The template differs from prod but the API interaction is identical.

### 3. Create combined Coder workspace template

**Summary**: Create a single combined workspace template with Python, Java, and Node.js runtimes. Template provisions a container, clones a repo from Gitea, and starts code-server for browser-based VS Code.

**Files to create**:
- `infrastructure/coder-templates/workspace/main.tf` — Terraform template
- `infrastructure/coder-templates/workspace/build/Dockerfile` — Combined runtime image

**Implementation steps**:
1. Create Dockerfile with:
   - Debian slim base
   - Python 3.12 + pip + pytest
   - JDK 21 (Temurin) + Maven + Gradle (available but not required)
   - Node.js 22 + npm
   - code-server (VS Code in browser)
   - Git, curl, basic dev tools
   - Coder agent startup script
   - Target image size: ~820 MB
2. Create Terraform template:
   - Parameters: `repo_url` (Gitea clone URL), `repo_branch` (default: main)
   - Docker provider for local dev (k8s provider for prod — separate template or conditional)
   - `coder_agent` resource with startup script that clones repo
   - `coder_app` resource for code-server web access
3. Register template with Coder during seed/init step
4. Template is parameterized so the platform passes repo URL at workspace creation time

### 4. Database migration: assignments, section_assignments, student_assignments

**Summary**: Add three-tier assignment schema: class-level assignment definitions, per-section release config, and per-student work tracking. Follows existing RLS patterns.

**Files to create**:
- `migrations/006_assignments.up.sql`
- `migrations/006_assignments.down.sql`

**Schema**:
```sql
-- ============================================================
-- assignments: class-level assignment definitions
-- ============================================================
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,                       -- markdown
    workspace_template TEXT NOT NULL,       -- Coder template name
    source_repo_gitea_id BIGINT,           -- Gitea repo ID for source/problem repo
    source_repo_url TEXT,                   -- Gitea clone URL
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_assignments_namespace ON assignments(namespace_id);
CREATE INDEX idx_assignments_class ON assignments(class_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_created_by ON assignments(created_by);

-- ============================================================
-- section_assignments: per-section release configuration
-- ============================================================
CREATE TABLE section_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    released_at TIMESTAMPTZ,               -- when visible to students (NULL = not released)
    due_at TIMESTAMPTZ,                    -- deadline (NULL = no deadline)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(assignment_id, section_id)
);

-- Indexes
CREATE INDEX idx_section_assignments_namespace ON section_assignments(namespace_id);
CREATE INDEX idx_section_assignments_assignment ON section_assignments(assignment_id);
CREATE INDEX idx_section_assignments_section ON section_assignments(section_id);

-- ============================================================
-- student_assignments: per-student work tracking
-- ============================================================
CREATE TABLE student_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    section_assignment_id UUID NOT NULL REFERENCES section_assignments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_gitea_id BIGINT,                  -- Student's Gitea repo ID
    repo_url TEXT,                          -- Student's Gitea clone URL
    workspace_id TEXT,                      -- Coder workspace ID
    workspace_name TEXT,                    -- Coder workspace name
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'submitted', 'grading', 'graded')),
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submitted_sha TEXT,                    -- Git SHA at submission time
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(assignment_id, user_id)
);

-- Indexes
CREATE INDEX idx_student_assignments_namespace ON student_assignments(namespace_id);
CREATE INDEX idx_student_assignments_assignment ON student_assignments(assignment_id);
CREATE INDEX idx_student_assignments_section_assignment ON student_assignments(section_assignment_id);
CREATE INDEX idx_student_assignments_user ON student_assignments(user_id);
CREATE INDEX idx_student_assignments_status ON student_assignments(status);
```

Plus: RLS policies following existing patterns:
- `assignments`: namespace-scoped read, instructor+ create/update/delete
- `section_assignments`: instructors see all in namespace; students see released assignments for their sections
- `student_assignments`: instructors see all in namespace; students see only their own
- Enable RLS, updated_at triggers

### 5. Go backend: Gitea API client

**Summary**: Create a Go client for the Gitea Admin API to manage repositories programmatically. The platform uses this to create repos when assignments are created and when students start assignments.

**Files to create**:
- `go-backend/internal/gitea/client.go` — Gitea API client
- `go-backend/internal/gitea/client_test.go` — Unit tests with HTTP mocking

**Implementation steps**:
1. Define `Client` struct with base URL and token from config
2. Implement methods:
   - `CreateRepo(ctx, orgName, repoName string, opts CreateRepoOpts) (*Repo, error)` — creates a repo in a Gitea org
   - `GetRepo(ctx, owner, name string) (*Repo, error)` — gets repo details
   - `DeleteRepo(ctx, owner, name string) error` — deletes a repo
   - `CreateFile(ctx, owner, repo, path string, content []byte, message string) error` — adds/updates a file
   - `ForkRepo(ctx, owner, repo, newOwner, newName string) (*Repo, error)` — fork a source repo for a student
3. Use standard `net/http` client (no Gitea SDK — keep deps minimal)
4. Response types: `Repo{ID int64, CloneURL, Name, FullName string}`
5. Add `GiteaURL` and `GiteaToken` to config struct

### 6. Go backend: Coder API client

**Summary**: Create a Go client for the Coder API to manage workspaces programmatically. The platform uses this to create student workspaces and retrieve workspace access URLs.

**Files to create**:
- `go-backend/internal/coder/client.go` — Coder API client
- `go-backend/internal/coder/client_test.go` — Unit tests with HTTP mocking

**Implementation steps**:
1. Define `Client` struct with base URL and token from config
2. Implement methods:
   - `CreateWorkspace(ctx, templateName, workspaceName string, params map[string]string) (*Workspace, error)` — creates workspace from template
   - `GetWorkspace(ctx, workspaceID string) (*Workspace, error)` — gets workspace status + access URL
   - `DeleteWorkspace(ctx, workspaceID string) error` — deletes workspace
   - `StartWorkspace(ctx, workspaceID string) error` — starts a stopped workspace
   - `StopWorkspace(ctx, workspaceID string) error` — stops a running workspace
3. Response types: `Workspace{ID, Name, Status, AccessURL string}`
4. Add `CoderURL` and `CoderToken` to config struct

### 7. Go backend: Assignment store and handler

**Summary**: Add store layer and HTTP handlers for assignment CRUD, section assignment management, and the "start assignment" flow that creates a Gitea repo + Coder workspace for a student.

**Files to create**:
- `go-backend/internal/store/assignments.go` — Assignment store (CRUD)
- `go-backend/internal/store/assignments_test.go`
- `go-backend/internal/store/section_assignments.go` — SectionAssignment store
- `go-backend/internal/store/section_assignments_test.go`
- `go-backend/internal/store/student_assignments.go` — StudentAssignment store
- `go-backend/internal/store/student_assignments_test.go`
- `go-backend/internal/handler/assignments.go` — HTTP handlers
- `go-backend/internal/handler/assignments_test.go`

**Files to modify**:
- `go-backend/internal/store/interfaces.go` — add AssignmentStore, SectionAssignmentStore, StudentAssignmentStore interfaces
- `go-backend/internal/handler/routes.go` (or equivalent) — register assignment routes
- `go-backend/internal/config/config.go` — add Gitea/Coder config fields

**API endpoints**:
```
# Assignment management (instructor)
POST   /api/assignments                            — Create assignment
GET    /api/assignments                            — List assignments (filter by class_id)
GET    /api/assignments/{id}                       — Get assignment
PATCH  /api/assignments/{id}                       — Update assignment
DELETE /api/assignments/{id}                       — Delete assignment

# Section assignment management (instructor)
POST   /api/assignments/{id}/sections              — Release to section (create section_assignment)
GET    /api/assignments/{id}/sections              — List section assignments
PATCH  /api/assignments/{id}/sections/{sectionId}  — Update section config (due_at, etc.)
DELETE /api/assignments/{id}/sections/{sectionId}  — Remove from section

# Student actions
POST   /api/assignments/{id}/start                 — Start assignment (creates repo + workspace)
GET    /api/assignments/{id}/workspace              — Get workspace URL for current student
```

**"Start Assignment" flow**:
1. Validate student is enrolled in a section that has this assignment released
2. Check no existing student_assignment for this user+assignment
3. Resolve the section_assignment for the student's section
4. Create Gitea repo for the student (fork/copy of source repo)
5. Create Coder workspace from template, passing repo URL as parameter
6. Insert student_assignment record with repo and workspace IDs
7. Return workspace access URL

## Dependency Order

```
Task 1 (Gitea compose) ──┐
                          ├──→ Task 3 (Template) ──┐
Task 2 (Coder compose) ──┘                         │
                                                    │
Task 4 (DB migration) ─────────────────────────────┤
Task 5 (Gitea client) ──┐                          │
Task 6 (Coder client) ──┴──────────────────────────┤
                                                    │
                                             Task 7 (Handlers)
```

Tasks 1 & 2 in parallel. Tasks 4, 5 & 6 in parallel (after 1 & 2). Task 7 last.

## Out of Scope (Future Epics)

- Auto-commit agent (10-second interval in workspace)
- Submission tracking / "Submit" button
- Grading workflow (grading branches, AI grader, TA review)
- Problem repo model (problem.yaml, hidden tests, file filtering)
- Frontend UI for assignments
- VS Code grading extension
- Production Terraform modules for Gitea/Coder on GKE
- OIDC/SSO between platform and Coder
- Workspace idle timeout and auto-shutdown config
- Student accommodations / per-student deadline overrides
- Late submission policies

## Risks

1. **Coder in docker-compose**: Coder creates containers via Docker socket — need to ensure it works alongside the existing docker-compose setup without conflicts
2. **Template divergence**: Local dev uses Docker provider, prod uses k8s provider. Same Coder API but different template Terraform code
3. **Gitea initialization**: Auto-creating admin user/token/org on first start requires scripting. Gitea's API requires the instance to be fully started first
4. **Workspace access auth**: Initially just a URL returned by the API. Real auth story (Coder sessions for students, OIDC federation) is deferred
5. **Image build time**: Combined ~820 MB image takes time to build. Should be cached in CI / artifact registry

## Schema Evolution Path

The three-tier schema is designed to grow:

| Future Feature | Where It Goes |
|---------------|---------------|
| Per-section deadlines | `section_assignments.due_at` (already present, nullable) |
| Student accommodations | `student_assignments.due_at_override` column, or separate `accommodations` table |
| Multiple submissions | Extract `submissions` table from `student_assignments.submitted_*` fields |
| Reusable problem templates | Extract `problem_templates` table, `assignments.problem_template_id` FK |
| Grading config | `assignments.grading_config JSONB` or separate `grading_configs` table |
| Late policies | `section_assignments.late_policy JSONB` |
