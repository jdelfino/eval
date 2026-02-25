// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// Releaser is the interface for releasing connections.
type Releaser interface {
	Release()
}

// RLSConn combines the interfaces needed for RLS middleware.
// It embeds store.Querier (Exec, Query, QueryRow) so the connection
// can be used to construct a Store, plus Releaser for cleanup.
type RLSConn interface {
	store.Querier
	Releaser
}

// ConnAcquirer is the interface for acquiring connections.
type ConnAcquirer interface {
	AcquireConn(ctx context.Context) (RLSConn, error)
}

// poolAcquirer wraps a pgxpool.Pool to implement ConnAcquirer.
type poolAcquirer struct {
	pool *pgxpool.Pool
}

func (p *poolAcquirer) AcquireConn(ctx context.Context) (RLSConn, error) {
	return p.pool.Acquire(ctx)
}

// RLSContextMiddleware acquires a database connection, sets PostgreSQL RLS session
// variables for the authenticated user, and attaches the connection to the request context.
//
// This middleware must run AFTER auth middleware since it depends on auth.UserFromContext.
// For unauthenticated requests (no user in context), the middleware passes through
// without acquiring a connection, allowing health checks and public endpoints to work.
//
// The connection is held for the entire request duration (required for RLS) and is
// automatically released when the request completes.
//
// Session variables set:
//   - app.user_id: The authenticated user's UUID
//   - app.namespace_id: The user's namespace (empty for system-admin)
//   - app.role: The user's role (system-admin, namespace-admin, instructor, student)
func RLSContextMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	acquirer := &poolAcquirer{pool: pool}
	return rlsMiddlewareWithAcquirer(acquirer)
}

// rlsMiddlewareWithAcquirer is the internal implementation that allows testing with mock connections.
func rlsMiddlewareWithAcquirer(acquirer ConnAcquirer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			// Get user from context (set by auth middleware)
			user := auth.UserFromContext(ctx)
			if user == nil {
				// No authenticated user - pass through without RLS
				// This allows health checks and public endpoints to work
				next.ServeHTTP(w, r)
				return
			}

			// Acquire connection from pool
			conn, err := acquirer.AcquireConn(ctx)
			if err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}
			defer releaseClean(conn)

			// Set RLS session variables
			if err := setRLSVariables(ctx, conn, user); err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			// Create per-request Store and attach to context
			s := store.New(conn)
			ctx = store.WithRepos(ctx, s)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}
}

// RegistrationStoreMiddleware acquires a database connection, sets app.role to
// 'registration', and attaches a Store to the request context.
//
// Registration routes need database access before a user record exists (e.g.,
// accepting an invitation or joining via code). Instead of bypassing RLS, we
// use a limited 'registration' role that only permits the specific operations
// needed by registration handlers (see migration 004_registration_rls).
//
// This middleware does NOT depend on auth middleware; it should be used for
// route groups that handle unauthenticated registration flows.
func RegistrationStoreMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	acquirer := &poolAcquirer{pool: pool}
	return registrationMiddlewareWithAcquirer(acquirer)
}

// registrationMiddlewareWithAcquirer is the testable implementation.
func registrationMiddlewareWithAcquirer(acquirer ConnAcquirer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			conn, err := acquirer.AcquireConn(ctx)
			if err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}
			defer releaseClean(conn)

			// Drop to non-owner role so RLS policies are enforced.
			if _, err := conn.Exec(ctx, "SET ROLE eval_app"); err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			// Set only app.role = 'registration'; no user_id or namespace_id.
			// is_local=false so the setting persists across statements on this connection.
			if _, err := conn.Exec(ctx, "SELECT set_config('app.role', $1, false)", "registration"); err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			s := store.New(conn)
			ctx = store.WithRepos(ctx, s)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}
}

// PublicStoreMiddleware acquires a database connection, sets app.role to
// 'public', and attaches a Store to the request context.
//
// Public routes (e.g. /public/problems/:id) need database read access without
// an authenticated user. Instead of using the 'reader' role (which bypasses
// RLS entirely and grants unrestricted SELECT on all tables), we use eval_app
// with app.role='public' so that RLS policies in migration 016 restrict access
// to only the specific tables needed by public-facing handlers (problems, classes).
//
// This middleware does NOT depend on auth middleware; it should be used for
// route groups that handle unauthenticated public read flows.
func PublicStoreMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	acquirer := &poolAcquirer{pool: pool}
	return publicStoreMiddlewareWithAcquirer(acquirer)
}

// publicStoreMiddlewareWithAcquirer is the testable implementation.
// It drops to eval_app (so RLS policies are enforced) then sets
// app.role = 'public'. The scoped SELECT policies are defined in
// migration 016_public_rls.
func publicStoreMiddlewareWithAcquirer(acquirer ConnAcquirer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			conn, err := acquirer.AcquireConn(ctx)
			if err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}
			defer releaseClean(conn)

			// Drop to non-owner role so RLS policies are enforced.
			if _, err := conn.Exec(ctx, "SET ROLE eval_app"); err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			// Set only app.role = 'public'; no user_id or namespace_id.
			// is_local=false so the setting persists across statements on this connection.
			if _, err := conn.Exec(ctx, "SELECT set_config('app.role', $1, false)", "public"); err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			s := store.New(conn)
			ctx = store.WithRepos(ctx, s)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}
}

// resetVarsQuery clears all app.* session variables in a single round-trip.
const resetVarsQuery = "SELECT set_config('app.user_id', '', false), set_config('app.namespace_id', '', false), set_config('app.role', '', false)"

// releaseClean restores the connection's original role, clears RLS session
// variables, and returns the connection to the pool. RESET ROLE undoes the
// SET ROLE eval_app that was issued at the start of the request.
func releaseClean(conn RLSConn) {
	ctx := context.Background()
	// Restore the connection's login role (undo SET ROLE eval_app).
	_, _ = conn.Exec(ctx, "RESET ROLE")
	// Clear session variables so they don't leak to the next request.
	_, _ = conn.Exec(ctx, resetVarsQuery)
	conn.Release()
}

// setRLSVariables drops to the eval_app role and sets the PostgreSQL session
// variables for RLS policies. SET ROLE is required because the connection's
// login role typically owns the tables and would bypass RLS.
func setRLSVariables(ctx context.Context, conn store.Querier, user *auth.User) error {
	// Drop to non-owner role so RLS policies are enforced.
	_, err := conn.Exec(ctx, "SET ROLE eval_app")
	if err != nil {
		return err
	}

	// Set session variables with is_local=false so they persist across
	// statements on this connection. The releaseClean function resets them
	// before the connection returns to the pool.
	_, err = conn.Exec(ctx, "SELECT set_config('app.user_id', $1, false)", user.ID.String())
	if err != nil {
		return err
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.namespace_id', $1, false)", user.NamespaceID)
	if err != nil {
		return err
	}

	_, err = conn.Exec(ctx, "SELECT set_config('app.role', $1, false)", string(user.Role))
	if err != nil {
		return err
	}

	return nil
}
