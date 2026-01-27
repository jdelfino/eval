package store

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jdelfino/eval/internal/middleware"
)

// Querier is the interface for executing database queries.
// Both pgxpool.Conn and pgx.Tx implement this interface.
type Querier interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store provides data access methods for the application.
// It implements all repository interfaces (UserRepository, etc.)
// using a single pool and shared helpers.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a new Store with the given connection pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// conn retrieves the RLS-configured connection from the context.
// The connection is set by the RLS middleware and has already been
// configured with the appropriate session variables for the authenticated user.
//
// Returns ErrNoConnection if no connection is present in the context.
func (s *Store) conn(ctx context.Context) (Querier, error) {
	conn := middleware.ConnFromContext(ctx)
	if conn == nil {
		return nil, ErrNoConnection
	}
	// Type assertion: middleware.RLSConn should implement Querier
	// We need to cast to the underlying *pgxpool.Conn which does implement Query/QueryRow
	querier, ok := conn.(Querier)
	if !ok {
		return nil, ErrNoConnection
	}
	return querier, nil
}
