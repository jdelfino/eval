# Frontend Migration Plan

## Goal
Migrate the Next.js frontend (`/workspaces/coding-tool`) from Supabase to the new Go backend + Identity Platform + Centrifugo stack. Big-bang cutover — no feature flags or incremental migration.

## Prerequisites
- **PLAT-vyf** (API Feature Parity) is complete — Go backend has all endpoints the frontend needs
- Go backend is deployed and accessible
- Identity Platform is configured with email/password auth
- Centrifugo is deployed with JWT auth

## Architecture Decisions
- **Direct browser → Go backend calls** (no BFF/proxy layer)
- **Delete all Next.js API routes** (`src/app/api/`) and server persistence layer (`src/server/persistence/`)
- **Delete Supabase dependencies** entirely
- **Firebase Auth SDK** on the client for auth state + ID tokens
- **centrifuge-js** for realtime

---

## Subtasks

### 1. Create Go backend API client module
**Summary:** Create a typed API client that all hooks will use instead of calling `/api/*` routes.

**Files to create:**
- `src/lib/api/client.ts` — base client with auth token injection, error handling, retry logic
- `src/lib/api/types.ts` — TypeScript types matching Go backend response shapes

**Files to modify:**
- `src/lib/api-utils.ts` — reuse existing retry logic, or consolidate into new client

**Implementation:**
1. Create `ApiClient` class/module with `get`, `post`, `put`, `patch`, `delete` methods
2. Base URL from `NEXT_PUBLIC_API_URL` env var
3. Auto-inject `Authorization: Bearer <token>` from Firebase Auth `currentUser.getIdToken()`
4. Standard error handling: parse JSON error responses, map to typed errors
5. Reuse existing `withRetry` / exponential backoff from `api-utils.ts`
6. Export typed endpoint methods (e.g., `api.sessions.list()`, `api.classes.get(id)`)

### 2. Replace auth with Firebase Auth SDK
**Summary:** Replace Supabase Auth with Firebase Auth SDK. This is the most critical change — everything depends on auth tokens.

**Files to modify:**
- `src/contexts/AuthContext.tsx` — rewrite to use Firebase Auth
- `src/app/(public)/auth/signin/page.tsx` — use `signInWithEmailAndPassword`
- `src/app/(public)/register/` — use `createUserWithEmailAndPassword` + call Go backend registration endpoint
- `src/app/(public)/invite/accept/page.tsx` — Firebase auth + Go backend accept-invite endpoint

**Files to delete:**
- `src/server/auth/supabase-provider.ts`
- `src/server/auth/mfa-cookie.ts`
- `src/lib/supabase/client.ts`

**Implementation:**
1. `npm install firebase` / `npm uninstall @supabase/supabase-js`
2. Create `src/lib/firebase.ts` — initialize Firebase app with config from env vars
3. Rewrite `AuthContext`:
   - `onAuthStateChanged` for auth state
   - `getIdToken()` for API calls (passed to API client from task 1)
   - `signInWithEmailAndPassword` / `createUserWithEmailAndPassword` / `signOut`
   - User profile fetched from `GET /api/v1/auth/me` after Firebase auth
4. Update sign-in page to call Firebase directly
5. Update registration flows (student + invite acceptance) to:
   - Create Firebase user
   - Call Go backend registration endpoint with Firebase ID token
6. MFA: Firebase supports TOTP MFA — wire up if needed, or defer

### 3. Replace realtime with centrifuge-js
**Summary:** Replace Supabase Broadcast with centrifuge-js for session realtime.

**Files to modify:**
- `src/hooks/useRealtimeSession.ts` — complete rewrite
- `src/components/ConnectionStatus.tsx` — update connection state types if needed

**Files to delete:**
- `src/lib/supabase/broadcast.ts`

**Implementation:**
1. `npm install centrifuge`
2. Create `src/lib/centrifugo.ts`:
   - Centrifuge client factory
   - Connection token: `GET /api/v1/realtime/token`
   - Subscription token: `GET /api/v1/realtime/token?channel=session:{id}`
   - Auto-reconnect with token refresh
3. Rewrite `useRealtimeSession`:
   - Connect to Centrifugo on mount
   - Subscribe to `session:{sessionId}` channel
   - Handle events: `student_joined`, `student_code_updated`, `session_ended`, `featured_student_changed`, `problem_updated`
   - Keep polling fallback for disconnected state
   - Maintain same public API (session, students, connectionStatus, updateCode, etc.)
4. Event payload shapes match — Go backend uses same event names and similar data structures

### 4. Migrate all data-fetching hooks to Go backend API
**Summary:** Update all custom hooks to use the new API client instead of internal `/api/*` routes.

**Files to modify:**
- `src/hooks/useSessionOperations.ts` — `/api/sessions/*` → `api.sessions.*`
- `src/hooks/useRevisionHistory.ts` — `/api/sessions/*/revisions` → `api.revisions.*`
- `src/hooks/useSections.ts` — `/api/sections/*` → `api.sections.*`
- `src/hooks/useClasses.ts` — `/api/classes/*` → `api.classes.*`
- `src/hooks/useNamespaces.ts` — `/api/system/namespaces/*` → `api.namespaces.*`
- `src/hooks/usePermissions.ts` — if it fetches from API
- `src/hooks/useInvitations.ts` — `/api/namespace/invitations/*` → `api.invitations.*`
- All page components that call `fetch('/api/...')` directly

**Implementation:**
1. For each hook, replace `fetch('/api/...')` with typed API client calls
2. Map response shapes if Go backend differs from current (likely minimal since PLAT-vyf targets parity)
3. Remove any header/cookie manipulation (auth is now via API client's token injection)
4. Update error handling to use API client's typed errors

### 5. Migrate page components with direct API calls
**Summary:** Some page components make direct `fetch()` calls to `/api/*` routes instead of going through hooks. Update these.

**Files to modify (likely):**
- `src/app/(app)/instructor/session/[id]/` — session management pages
- `src/app/(app)/admin/` — admin pages
- `src/app/(app)/sections/` — section management
- `src/app/(app)/namespace/` — namespace/invitation management
- `src/app/(fullscreen)/student/` — student coding interface
- `src/app/(projector)/public-view/` — projector display

**Implementation:**
1. Search all `.tsx` files for `fetch('/api/` and `fetch(\`/api/`
2. Replace with API client calls or delegate to hooks
3. Ensure auth context is available in all component trees

### 6. Delete Supabase server layer and API routes
**Summary:** Remove all server-side code that's no longer needed.

**Files to delete:**
- `src/app/api/` — entire directory (all Next.js API routes)
- `src/server/persistence/supabase/` — all Supabase repositories
- `src/server/persistence/service-role-revision-repository.ts`
- `src/server/auth/` — Supabase auth provider and helpers
- `src/server/supabase/` — Supabase client initialization and types
- `src/server/code-execution/` — executor backends (now in Go backend)
- `src/server/services/` — Gemini analysis (now in Go backend)
- `src/server/rate-limit.ts` — rate limiting (now in Go backend)
- `src/server/sandbox.ts`
- `src/server/types.ts` and `src/server/types/` — if only used by deleted code
- `src/lib/supabase/` — entire directory

**Implementation:**
1. Delete all files listed above
2. Remove `@supabase/supabase-js` and related deps from `package.json`
3. Remove Supabase env vars from `.env.example`
4. Add new env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FIREBASE_*` config
5. Verify build passes with no dead imports
6. Update `next.config.js` if it references Supabase domains

### 7. Update environment configuration and deployment
**Summary:** Update env vars, Next.js config, and deployment for the new stack.

**Files to modify:**
- `.env.example` — remove Supabase vars, add Firebase + API URL vars
- `next.config.js` — update allowed domains, remove Supabase references
- `package.json` — clean up dependencies

**New env vars:**
```
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
```

### 8. Update and fix tests
**Summary:** Update existing tests to work with new auth/API/realtime stack.

**Files to modify:**
- All test files referencing Supabase mocks
- `src/__mocks__/` — replace Supabase mocks with Firebase + API client mocks
- Hook tests — update to mock API client instead of fetch

**Implementation:**
1. Create Firebase auth mock for tests
2. Create API client mock
3. Create centrifuge-js mock
4. Update all affected test files
5. Delete tests for deleted server-side code
6. Run full test suite, fix failures

---

## Dependency Order

```
1 (API client) ──→ 2 (Auth) ──→ 4 (Hooks) ──→ 5 (Pages) ──→ 6 (Delete) ──→ 7 (Config)
                   3 (Realtime) ─↗                                            ↗
                                                              8 (Tests) ─────╯
```

- Task 1 (API client) is the foundation — everything uses it
- Tasks 2 (auth) and 3 (realtime) can proceed in parallel after task 1
- Task 4 (hooks) depends on tasks 1 + 2 (needs API client + auth token flow)
- Task 5 (pages) depends on task 4
- Task 6 (delete) happens after all migration is done
- Task 7 (config) happens alongside or after task 6
- Task 8 (tests) can start alongside task 4 but finishes last

## Blocked By
- **PLAT-vyf** — Go backend must have full API parity before starting
