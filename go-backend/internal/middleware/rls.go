// Package middleware provides HTTP middleware for the API.
package middleware

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/auth"
)

// connContextKey is the key for storing the RLS-configured connection in context.
type connContextKey struct{}

// Execer is the interface for executing SQL commands.
type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Releaser is the interface for releasing connections.
type Releaser interface {
	Release()
}

// RLSConn combines the interfaces needed for RLS middleware.
type RLSConn interface {
	Execer
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

			// Attach connection to context for handlers
			ctx = withConn(ctx, conn)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}
}

// setRLSVariables sets the PostgreSQL session variables for RLS policies.
func setRLSVariables(ctx context.Context, conn Execer, user *auth.User) error {
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

// withConn stores the RLS-configured connection in the context.
func withConn(ctx context.Context, conn RLSConn) context.Context {
	return context.WithValue(ctx, connContextKey{}, conn)
}

// ConnFromContext retrieves the RLS-configured connection from the context.
// Returns nil if no connection is present (e.g., for unauthenticated requests).
//
// Handlers should use this to get the connection for database operations:
//
//	conn := middleware.ConnFromContext(r.Context())
//	if conn == nil {
//	    // Handle unauthenticated case or error
//	}
func ConnFromContext(ctx context.Context) RLSConn {
	conn, ok := ctx.Value(connContextKey{}).(RLSConn)
	if !ok {
		return nil
	}
	return conn
}
