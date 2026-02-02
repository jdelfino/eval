package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Querier is the interface for executing database queries.
// Both pgxpool.Conn and pgx.Tx implement this interface.
type Querier interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// TxQuerier extends Querier with the ability to start transactions.
// *pgxpool.Conn implements this interface.
type TxQuerier interface {
	Querier
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Repos is the interface that embeds all repository interfaces.
// *Store implements this. Tests can mock it.
type Repos interface {
	UserRepository
	ClassRepository
	SectionRepository
	SessionRepository
	SessionStudentRepository
	RevisionRepository
	MembershipRepository
	NamespaceRepository
	ProblemRepository
	AdminRepository
	AuditLogRepository
	DashboardRepository
	InvitationRepository
}

// Store provides data access methods for the application.
// It implements all repository interfaces (UserRepository, etc.)
// using a Querier (connection or pool) and shared helpers.
type Store struct {
	q Querier
}

// New creates a new Store with the given Querier.
func New(q Querier) *Store {
	return &Store{q: q}
}

// beginTx starts a transaction on the underlying connection.
// The Querier must implement TxQuerier (e.g., *pgxpool.Conn).
func (s *Store) beginTx(ctx context.Context) (pgx.Tx, error) {
	beginner, ok := s.q.(TxQuerier)
	if !ok {
		return nil, fmt.Errorf("connection does not support transactions")
	}
	return beginner.Begin(ctx)
}

// reposContextKey is the context key for storing Repos.
type reposContextKey struct{}

// WithRepos stores the Repos in the context.
func WithRepos(ctx context.Context, r Repos) context.Context {
	return context.WithValue(ctx, reposContextKey{}, r)
}

// ReposFromContext retrieves the Repos from the context.
// Panics if no Repos is present (programming error — middleware must set it).
func ReposFromContext(ctx context.Context) Repos {
	r, ok := ctx.Value(reposContextKey{}).(Repos)
	if !ok || r == nil {
		panic("store: no repos in context (RLS middleware not configured)")
	}
	return r
}

// Compile-time check that *Store implements Repos.
var _ Repos = (*Store)(nil)
