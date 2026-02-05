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
			// Ensure connection is released when request completes
			defer conn.Release()

			// Set RLS session variables
			// Using set_config(..., true) makes the setting transaction-local
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

// NoRLSStoreMiddleware provides database access without RLS context.
// Use this for registration routes where users don't exist yet.
// Security is enforced via invitation tokens / join codes, not RLS.
func NoRLSStoreMiddleware(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			conn, err := pool.Acquire(ctx)
			if err != nil {
				http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
				return
			}
			defer conn.Release()

			s := store.New(conn)
			ctx = store.WithRepos(ctx, s)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}
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

