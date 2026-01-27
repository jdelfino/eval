package store

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestNew(t *testing.T) {
	// Test that New returns a valid Store instance
	store := New(nil)
	if store == nil {
		t.Fatal("New() returned nil")
	}
}

func TestStore_conn_NoConnection(t *testing.T) {
	store := New(nil)
	ctx := context.Background()

	_, err := store.conn(ctx)
	if err != ErrNoConnection {
		t.Errorf("conn() error = %v, want ErrNoConnection", err)
	}
}

func TestStore_InterfaceCompliance(t *testing.T) {
	// Verify that Store implements UserRepository at compile time
	var _ UserRepository = (*Store)(nil)

	// This test exists to verify interface compliance
	// The actual implementation is tested in users_test.go
	t.Log("Store implements UserRepository interface")
}

// TestStore_PoolAccess tests that the store correctly holds the pool reference.
func TestStore_PoolAccess(t *testing.T) {
	// We can't easily test with a real pool without a database,
	// but we can verify the pool is stored correctly.
	var pool *pgxpool.Pool // nil pool for test
	store := New(pool)
	if store.pool != pool {
		t.Error("Store did not store the pool reference correctly")
	}
}
