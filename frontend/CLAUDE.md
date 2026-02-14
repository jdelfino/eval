# Frontend

Next.js 16 (App Router) with TypeScript strict mode, Tailwind CSS, and Firebase Auth.

## Structure

```
src/
  app/                       # Next.js App Router
    (app)/                   # Protected routes (auth required)
    (fullscreen)/            # Full-screen student workspace
    (projector)/             # Projector/public view
    (public)/                # Public routes (signin, register, invite)
  components/
    ui/                      # Reusable primitives (Button, Input, Card, etc.)
    layout/                  # Layout components
  contexts/                  # React Context providers (Auth, ActiveSession, Panel)
  hooks/                     # Data hooks (useClasses, useSections, useSessionHistory)
  lib/
    api-client.ts            # Base authenticated HTTP client (apiFetch, apiGet, apiPost, etc.)
    public-api-client.ts     # Unauthenticated API client
    api/                     # Typed domain clients (problems.ts, classes.ts, sessions.ts)
    auth-provider.ts         # Pluggable auth (Firebase or test mode)
    centrifugo.ts            # WebSocket client
    permissions.ts           # RBAC permission mappings
  types/
    api.ts                   # Wire format types (match Go JSON tags, snake_case)
    problem.ts               # Rich client types + mappers (Date objects, etc.)
    session.ts               # Session types + mappers
  config/                    # Constants and configuration
scripts/
  check-api-imports.ts       # API boundary enforcement (CI)
e2e/                         # Playwright E2E tests
```

## Commands

```bash
make test-frontend           # Jest unit tests
make lint-frontend           # ESLint
make typecheck-frontend      # tsc --noEmit
make check-api-imports       # API boundary check
make test-integration-contract  # Contract tests (requires backend)
```

## API Import Boundary

App code MUST import from `@/lib/api/` (typed domain clients), never directly from `@/lib/api-client` or `@/lib/public-api-client`. This is enforced by `scripts/check-api-imports.ts` in CI.

Allowed to import base clients: files in `lib/api/`, `lib/centrifugo.ts`, `contexts/AuthContext.tsx`, and test files.

## API Client Layers

1. **Base clients** (`lib/api-client.ts`) - `apiGet<T>()`, `apiPost<T>()`, etc. with auth token injection and retry logic
2. **Domain clients** (`lib/api/*.ts`) - Typed wrappers per resource (e.g., `listProblems()`, `createClass()`)
3. **Wire types** (`types/api.ts`) - Match Go backend JSON exactly (snake_case)
4. **Rich types** (`types/problem.ts`) - Client-side types with Date objects; mapper functions convert from wire format

## Component Conventions

- `'use client'` for interactive components
- Props interfaces extend semantic HTML attributes (e.g., `ButtonProps extends React.ButtonHTMLAttributes`)
- `React.forwardRef` for inputs and buttons
- Tailwind classes for styling; variant/size maps as `Record<Type, string>`
- Feature components colocated in route directories (e.g., `app/(app)/classes/components/`)

## State Management

React Context + custom hooks. No external state library.

- `AuthContext` - User auth state, signIn/signOut (dual-mode: Firebase or test provider)
- `ActiveSessionContext` - Current session being viewed
- Data hooks (`useClasses`, `useSessions`) manage fetch + CRUD + loading/error state
- `useCallback` for all callbacks returned from hooks

## Testing

**Jest config** has multiple projects: `client` (jsdom), `integration`, `contract` (node), `scripts`.

**Mocking pattern:**
```ts
const mockApiGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));
```

Global mocks in `src/__mocks__/` (api-client, firebase, react-markdown) are auto-loaded via `moduleNameMapper`.

**RTL conventions:** Use `screen` + semantic queries (`getByRole`, `getByText`). `getByTestId` only when no semantic role exists.

**Contract tests** (`src/__tests__/contract/`) verify API shape against a real backend. Run via `make test-integration-contract`.

## TypeScript

- Strict mode enabled
- Path alias: `@/*` -> `./src/*`
- Union types over enums: `type UserRole = 'system-admin' | 'instructor' | 'student'`
- Wire types (snake_case) in `types/api.ts`; rich types in domain files with mapper functions

## ESLint

- Warns on unused vars (ignores `_` prefix)
- Warns on `console.log` (allows `.warn`, `.error`)
- Standard Next.js rules
