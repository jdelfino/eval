// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
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

			// Set only app.role = 'registration'; no user_id or namespace_id
			if _, err := conn.Exec(ctx, "SELECT set_config('app.role', $1, true)", "registration"); err != nil {
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

// resetQuery clears all app.* session variables in a single round-trip.
// This is called before returning connections to the pool to prevent
// session state from leaking between requests.
const resetQuery = "SELECT set_config('app.user_id', '', false), set_config('app.namespace_id', '', false), set_config('app.role', '', false)"

// releaseClean resets RLS session variables and returns the connection to the pool.
// This prevents stale session state from leaking to the next request that
// acquires the same connection.
func releaseClean(conn RLSConn) {
	// Use a background context — the request context may already be cancelled.
	_, _ = conn.Exec(context.Background(), resetQuery)
	conn.Release()
}

// setRLSVariables sets the PostgreSQL session variables for RLS policies.
func setRLSVariables(ctx context.Context, conn store.Querier, user *auth.User) error {
	// Set user ID
	_, err := conn.Exec(ctx, "SELECT set_config('app.user_id', $1, true)", user.ID.String())
	if err != nil {
		return err
	}

	// Set namespace ID (empty string for system-admin)
	_, err = conn.Exec(ctx, "SELECT set_config('app.namespace_id', $1, true)", user.NamespaceID)
	if err != nil {
		return err
	}

	// Set role
	_, err = conn.Exec(ctx, "SELECT set_config('app.role', $1, true)", string(user.Role))
	if err != nil {
		return err
	}

	return nil
}
