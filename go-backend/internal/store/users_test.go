package store

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// mockRow implements pgx.Row for testing.
type mockRow struct {
	err    error
	values []any
}

func (m *mockRow) Scan(dest ...any) error {
	if m.err != nil {
		return m.err
	}
	// Copy values to destinations
	for i, v := range m.values {
		if i < len(dest) {
			switch d := dest[i].(type) {
			case *uuid.UUID:
				*d = v.(uuid.UUID)
			case **string:
				if v == nil {
					*d = nil
				} else {
					s := v.(string)
					*d = &s
				}
			case *string:
				*d = v.(string)
			case *time.Time:
				*d = v.(time.Time)
			}
		}
	}
	return nil
}

// mockQuerier implements Querier for testing.
type mockQuerier struct {
	queryRowFn func(ctx context.Context, sql string, args ...any) pgx.Row
}

func (m *mockQuerier) Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (m *mockQuerier) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return nil, nil
}

func (m *mockQuerier) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if m.queryRowFn != nil {
		return m.queryRowFn(ctx, sql, args...)
	}
	return &mockRow{err: pgx.ErrNoRows}
}

// getUserByIDWithConn is a test helper that uses a provided querier.
func getUserByIDWithConn(ctx context.Context, conn Querier, id uuid.UUID) (*User, error) {
	const query = `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE id = $1`

	var user User
	err := conn.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

func TestGetUserByID_NotFound(t *testing.T) {
	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			return &mockRow{err: pgx.ErrNoRows}
		},
	}

	ctx := context.Background()
	userID := uuid.New()

	_, err := getUserByIDWithConn(ctx, mock, userID)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("GetUserByID() error = %v, want ErrNotFound", err)
	}
}

func TestGetUserByID_Success(t *testing.T) {
	now := time.Now().Truncate(time.Microsecond) // PostgreSQL precision
	userID := uuid.New()
	externalID := "firebase-uid-123"
	namespaceID := "test-namespace"
	displayName := "Test User"

	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			// Verify the correct ID was passed
			if len(args) > 0 {
				if id, ok := args[0].(uuid.UUID); ok && id != userID {
					return &mockRow{err: pgx.ErrNoRows}
				}
			}
			return &mockRow{
				values: []any{
					userID,
					externalID,
					"test@example.com",
					"instructor",
					namespaceID,
					displayName,
					now,
					now,
				},
			}
		},
	}

	ctx := context.Background()

	user, err := getUserByIDWithConn(ctx, mock, userID)
	if err != nil {
		t.Fatalf("GetUserByID() error = %v", err)
	}

	if user.ID != userID {
		t.Errorf("user.ID = %v, want %v", user.ID, userID)
	}
	if user.ExternalID == nil || *user.ExternalID != externalID {
		t.Errorf("user.ExternalID = %v, want %v", user.ExternalID, externalID)
	}
	if user.Email != "test@example.com" {
		t.Errorf("user.Email = %q, want %q", user.Email, "test@example.com")
	}
	if user.Role != "instructor" {
		t.Errorf("user.Role = %q, want %q", user.Role, "instructor")
	}
	if user.NamespaceID == nil || *user.NamespaceID != namespaceID {
		t.Errorf("user.NamespaceID = %v, want %v", user.NamespaceID, namespaceID)
	}
	if user.DisplayName == nil || *user.DisplayName != displayName {
		t.Errorf("user.DisplayName = %v, want %v", user.DisplayName, displayName)
	}
}

func TestGetUserByID_NoConnection(t *testing.T) {
	store := New(nil)
	ctx := context.Background()
	userID := uuid.New()

	_, err := store.GetUserByID(ctx, userID)
	if !errors.Is(err, ErrNoConnection) {
		t.Errorf("GetUserByID() error = %v, want ErrNoConnection", err)
	}
}

func TestGetUserByID_SystemAdmin(t *testing.T) {
	// System admin has nil namespace_id
	now := time.Now().Truncate(time.Microsecond)
	userID := uuid.New()
	externalID := "firebase-uid-admin"
	displayName := "Admin User"

	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			return &mockRow{
				values: []any{
					userID,
					externalID,
					"admin@example.com",
					"system-admin",
					nil, // namespace_id is NULL for system-admin
					displayName,
					now,
					now,
				},
			}
		},
	}

	ctx := context.Background()

	user, err := getUserByIDWithConn(ctx, mock, userID)
	if err != nil {
		t.Fatalf("GetUserByID() error = %v", err)
	}

	if user.Role != "system-admin" {
		t.Errorf("user.Role = %q, want %q", user.Role, "system-admin")
	}
	if user.NamespaceID != nil {
		t.Errorf("user.NamespaceID = %v, want nil", user.NamespaceID)
	}
}

// getUserByExternalIDWithConn is a test helper that uses a provided querier.
func getUserByExternalIDWithConn(ctx context.Context, conn Querier, externalID string) (*User, error) {
	const query = `
		SELECT id, external_id, email, role, namespace_id, display_name, created_at, updated_at
		FROM users
		WHERE external_id = $1`

	var user User
	err := conn.QueryRow(ctx, query, externalID).Scan(
		&user.ID,
		&user.ExternalID,
		&user.Email,
		&user.Role,
		&user.NamespaceID,
		&user.DisplayName,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return nil, HandleNotFound(err)
	}

	return &user, nil
}

func TestGetUserByExternalID_Success(t *testing.T) {
	now := time.Now().Truncate(time.Microsecond)
	userID := uuid.New()
	externalID := "firebase-uid-123"
	namespaceID := "test-namespace"
	displayName := "Test User"

	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			if len(args) > 0 {
				if eid, ok := args[0].(string); ok && eid != externalID {
					return &mockRow{err: pgx.ErrNoRows}
				}
			}
			return &mockRow{
				values: []any{
					userID,
					externalID,
					"test@example.com",
					"instructor",
					namespaceID,
					displayName,
					now,
					now,
				},
			}
		},
	}

	ctx := context.Background()

	user, err := getUserByExternalIDWithConn(ctx, mock, externalID)
	if err != nil {
		t.Fatalf("GetUserByExternalID() error = %v", err)
	}

	if user.ID != userID {
		t.Errorf("user.ID = %v, want %v", user.ID, userID)
	}
	if user.ExternalID == nil || *user.ExternalID != externalID {
		t.Errorf("user.ExternalID = %v, want %v", user.ExternalID, externalID)
	}
	if user.Email != "test@example.com" {
		t.Errorf("user.Email = %q, want %q", user.Email, "test@example.com")
	}
	if user.Role != "instructor" {
		t.Errorf("user.Role = %q, want %q", user.Role, "instructor")
	}
}

func TestGetUserByExternalID_NotFound(t *testing.T) {
	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			return &mockRow{err: pgx.ErrNoRows}
		},
	}

	ctx := context.Background()

	_, err := getUserByExternalIDWithConn(ctx, mock, "nonexistent-uid")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("GetUserByExternalID() error = %v, want ErrNotFound", err)
	}
}

func TestGetUserByExternalID_NoConnection(t *testing.T) {
	store := New(nil)
	ctx := context.Background()

	_, err := store.GetUserByExternalID(ctx, "some-uid")
	if !errors.Is(err, ErrNoConnection) {
		t.Errorf("GetUserByExternalID() error = %v, want ErrNoConnection", err)
	}
}

func TestGetUserByID_DatabaseError(t *testing.T) {
	dbErr := errors.New("connection refused")
	mock := &mockQuerier{
		queryRowFn: func(ctx context.Context, sql string, args ...any) pgx.Row {
			return &mockRow{err: dbErr}
		},
	}

	ctx := context.Background()
	userID := uuid.New()

	_, err := getUserByIDWithConn(ctx, mock, userID)
	if err != dbErr {
		t.Errorf("GetUserByID() error = %v, want %v", err, dbErr)
	}
}
