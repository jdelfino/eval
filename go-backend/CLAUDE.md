# Go Backend

Go 1.24 HTTP API using Chi v5, PostgreSQL (pgx), and Row-Level Security.

## Structure

```
cmd/server/main.go          # Entry point
internal/
  server/server.go          # Server setup, middleware chain, route mounting
  handler/                  # HTTP handlers (one file per resource)
  store/                    # Data access layer (repository pattern)
  auth/                     # JWT validation, User struct, RBAC permissions
  middleware/               # authn, authz, RLS context, logging
  config/                   # Environment config (caarlos0/env struct tags)
  httpbind/                 # JSON binding + validation (go-playground/validator)
  db/                       # Connection pool setup, migrations
  realtime/                 # Centrifugo WebSocket integration
  executor/                 # Executor service client
  metrics/                  # Prometheus metrics
```

## Commands

```bash
make test-api               # Unit tests (race detector)
make lint-api               # golangci-lint
make test-integration-store # Integration tests (requires Docker Postgres)
```

## Handler Pattern

Handlers are stateless structs with a `Routes() chi.Router` method. Each route method follows:
1. Parse params/body (`httpbind.ParseUUIDParam`, `httpbind.BindJSON[T]`)
2. Get repos from context (`store.ReposFromContext(r.Context())`)
3. Call store method
4. Handle errors with sentinel checks, return JSON

```go
func (h *FooHandler) Get(w http.ResponseWriter, r *http.Request) {
    id, ok := httpbind.ParseUUIDParam(w, r, "id")  // writes 400 on failure
    if !ok {
        return
    }
    repos := store.ReposFromContext(r.Context())
    foo, err := repos.GetFoo(r.Context(), id)
    if err != nil {
        if errors.Is(err, store.ErrNotFound) {
            httputil.WriteError(w, http.StatusNotFound, "foo not found")
            return
        }
        httputil.WriteInternalError(w, r, err, "internal error")
        return
    }
    httputil.WriteJSON(w, http.StatusOK, foo)
}
```

Permission-gated routes use middleware groups:
```go
r.Group(func(r chi.Router) {
    r.Use(custommw.RequirePermission(auth.PermContentManage))
    r.Post("/", h.Create)
})
```

## Store Pattern

`Store` wraps a `Querier` interface (pgxpool.Conn or pgx.Tx). Common conventions:

- **Column constants** for reuse: `const fooColumns = "id, name, ..."`
- **Scan helpers**: `scanFoo(row pgx.Row)` and `scanFoos(rows pgx.Rows)`
- **Error mapping**: `HandleNotFound(err)` converts `pgx.ErrNoRows` to `store.ErrNotFound`; `HandleDuplicate(err)` maps PG 23505
- **Dynamic filters**: `argCounter` helper for building WHERE clauses with numbered params
- **Transactions**: `s.beginTx(ctx)` requires the underlying `Querier` to implement `TxQuerier`

Sentinel errors: `store.ErrNotFound`, `store.ErrDuplicate`, `store.ErrLastMember`.

## Database & RLS

PostgreSQL session variables enforce row-level security:
- `app.user_id`, `app.namespace_id`, `app.role`
- Set by `RLSContextMiddleware` after auth, using a dedicated connection per request
- Middleware acquires a pooled connection, sets `SET ROLE eval_app`, then `set_config()` for each variable
- Repos are created from this connection and stored in context

## Request Binding

`httpbind.BindJSON[T](w, r)` decodes JSON, validates struct tags, and writes error responses:
- 400 for malformed JSON
- 422 for validation failures (field-level errors)
- Uses `go-playground/validator/v10` tags: `required`, `min`, `max`, `email`, `uuid`, etc.

## Middleware Chain

Order in `server.go`: RequestID -> RealIP -> Logger -> Recoverer -> Heartbeat -> Metrics -> (per-route: JWT Validate -> UserLoad -> RLS Context)

## Auth

- `auth.User` struct: ID, Email, NamespaceID, Role
- Roles: `system-admin`, `namespace-admin`, `instructor`, `student`
- Context helpers: `auth.UserFromContext(ctx)`, `auth.WithUser(ctx, user)`
- Permission checks: `auth.HasPermission(role, perm)`

## Config

Environment variables via `caarlos0/env` with struct tags and defaults:
```go
Port int `env:"PORT" envDefault:"8080"`
```
See `.env.example` for required variables.

## Testing

**Handler tests** use mock repos with function fields:
```go
type fooTestRepos struct {
    stubRepos  // panics on unimplemented methods
    getFooFn func(ctx context.Context, id uuid.UUID) (*store.Foo, error)
}
```

Context injection: `store.WithRepos(ctx, mockRepos)` + `auth.WithUser(ctx, user)`.
Assertions use `httptest.NewRecorder` and standard `net/http/httptest`.

**Integration tests** (store layer):
- Require `DATABASE_URL`; skip gracefully if unset
- Each test run uses a random namespace for isolation
- `setRLSContext()` switches to `eval_app` role and sets session variables
- Run via `make test-integration-store`
