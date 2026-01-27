package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// mockTx implements pgx.Tx for testing.
type mockTx struct {
	committed  bool
	rolledBack bool
	execErr    error
}

func (m *mockTx) Begin(_ context.Context) (pgx.Tx, error) {
	return nil, nil
}

func (m *mockTx) Commit(_ context.Context) error {
	m.committed = true
	return nil
}

func (m *mockTx) Rollback(_ context.Context) error {
	m.rolledBack = true
	return nil
}

func (m *mockTx) CopyFrom(_ context.Context, _ pgx.Identifier, _ []string, _ pgx.CopyFromSource) (int64, error) {
	return 0, nil
}

func (m *mockTx) SendBatch(_ context.Context, _ *pgx.Batch) pgx.BatchResults {
	return nil
}

func (m *mockTx) LargeObjects() pgx.LargeObjects {
	return pgx.LargeObjects{}
}

func (m *mockTx) Prepare(_ context.Context, _, _ string) (*pgconn.StatementDescription, error) {
	return nil, nil
}

func (m *mockTx) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, m.execErr
}

func (m *mockTx) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, nil
}

func (m *mockTx) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return nil
}

func (m *mockTx) Conn() *pgx.Conn {
	return nil
}

// mockPool provides a mock pool for testing transactions.
type mockPool struct {
	tx          *mockTx
	beginTxOpts pgx.TxOptions
	beginErr    error
}

func (m *mockPool) BeginTx(ctx context.Context, opts pgx.TxOptions) (pgx.Tx, error) {
	m.beginTxOpts = opts
	if m.beginErr != nil {
		return nil, m.beginErr
	}
	return m.tx, nil
}

func TestWithTx_CommitsOnSuccess(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}

	err := withTxImpl(context.Background(), pool, func(_ pgx.Tx) error {
		return nil
	})

	if err != nil {
		t.Errorf("WithTx() error = %v, want nil", err)
	}
	if !mock.committed {
		t.Error("WithTx() did not commit on success")
	}
	if mock.rolledBack {
		t.Error("WithTx() should not rollback on success")
	}
}

func TestWithTx_RollbacksOnError(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}
	fnErr := errors.New("operation failed")

	err := withTxImpl(context.Background(), pool, func(_ pgx.Tx) error {
		return fnErr
	})

	if !errors.Is(err, fnErr) {
		t.Errorf("WithTx() error = %v, want %v", err, fnErr)
	}
	if mock.committed {
		t.Error("WithTx() should not commit on error")
	}
	if !mock.rolledBack {
		t.Error("WithTx() did not rollback on error")
	}
}

func TestWithTx_RollbacksOnPanic(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}

	defer func() {
		if r := recover(); r == nil {
			t.Error("WithTx() should have panicked")
		}
		if mock.committed {
			t.Error("WithTx() should not commit on panic")
		}
		if !mock.rolledBack {
			t.Error("WithTx() did not rollback on panic")
		}
	}()

	_ = withTxImpl(context.Background(), pool, func(_ pgx.Tx) error {
		panic("test panic")
	})
}

func TestWithTx_ReturnsBeginError(t *testing.T) {
	beginErr := errors.New("begin failed")
	pool := &mockPool{beginErr: beginErr}

	err := withTxImpl(context.Background(), pool, func(_ pgx.Tx) error {
		t.Error("function should not be called when begin fails")
		return nil
	})

	if !errors.Is(err, beginErr) {
		t.Errorf("WithTx() error = %v, want %v", err, beginErr)
	}
}

func TestWithTxOptions_UsesIsolationLevel(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}
	opts := pgx.TxOptions{
		IsoLevel: pgx.Serializable,
	}

	err := withTxOptionsImpl(context.Background(), pool, opts, func(_ pgx.Tx) error {
		return nil
	})

	if err != nil {
		t.Errorf("WithTxOptions() error = %v, want nil", err)
	}
	if pool.beginTxOpts.IsoLevel != pgx.Serializable {
		t.Errorf("WithTxOptions() IsoLevel = %v, want %v", pool.beginTxOpts.IsoLevel, pgx.Serializable)
	}
}

func TestWithTxOptions_UsesAccessMode(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}
	opts := pgx.TxOptions{
		AccessMode: pgx.ReadOnly,
	}

	err := withTxOptionsImpl(context.Background(), pool, opts, func(_ pgx.Tx) error {
		return nil
	})

	if err != nil {
		t.Errorf("WithTxOptions() error = %v, want nil", err)
	}
	if pool.beginTxOpts.AccessMode != pgx.ReadOnly {
		t.Errorf("WithTxOptions() AccessMode = %v, want %v", pool.beginTxOpts.AccessMode, pgx.ReadOnly)
	}
}

func TestWithTxOptions_CommitsOnSuccess(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}

	err := withTxOptionsImpl(context.Background(), pool, pgx.TxOptions{}, func(_ pgx.Tx) error {
		return nil
	})

	if err != nil {
		t.Errorf("WithTxOptions() error = %v, want nil", err)
	}
	if !mock.committed {
		t.Error("WithTxOptions() did not commit on success")
	}
}

func TestWithTxOptions_RollbacksOnError(t *testing.T) {
	mock := &mockTx{}
	pool := &mockPool{tx: mock}
	fnErr := errors.New("operation failed")

	err := withTxOptionsImpl(context.Background(), pool, pgx.TxOptions{}, func(_ pgx.Tx) error {
		return fnErr
	})

	if !errors.Is(err, fnErr) {
		t.Errorf("WithTxOptions() error = %v, want %v", err, fnErr)
	}
	if !mock.rolledBack {
		t.Error("WithTxOptions() did not rollback on error")
	}
}
