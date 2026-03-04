package server

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockUserRepo is a store.UserReader stub that returns configured responses.
// NOTE: This mock lives in the server package and cannot share the handler
// package's StubUserRepo (test files are not importable across packages).
// It uses a simpler design (user/err fields) since only GetUserByExternalID
// is exercised by UserLookupAdapter.
// Now implements store.UserReader (the narrower interface) since
// UserLookupAdapter no longer requires the full UserRepository.
type mockUserRepo struct {
	user *store.User
	err  error
}

// Compile-time check that mockUserRepo implements store.UserReader.
var _ store.UserReader = (*mockUserRepo)(nil)

func (m *mockUserRepo) GetUserByID(_ context.Context, _ uuid.UUID) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) GetUserByEmail(_ context.Context, _ string) (*store.User, error) {
	return m.user, m.err
}

func TestUserLookupAdapter_GetUserByExternalID(t *testing.T) {
	nsID := "ns-1"
	userID := uuid.New()

	repo := &mockUserRepo{
		user: &store.User{
			ID:          userID,
			Email:       "test@example.com",
			Role:        "student",
			NamespaceID: &nsID,
		},
	}

	adapter := NewUserLookupAdapter(repo)

	record, err := adapter.GetUserByExternalID(context.Background(), "ext-123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if record.ID != userID {
		t.Errorf("ID = %v, want %v", record.ID, userID)
	}
	if record.Email != "test@example.com" {
		t.Errorf("Email = %q, want %q", record.Email, "test@example.com")
	}
	if record.Role != "student" {
		t.Errorf("Role = %q, want %q", record.Role, "student")
	}
	if record.NamespaceID == nil || *record.NamespaceID != "ns-1" {
		t.Errorf("NamespaceID = %v, want %q", record.NamespaceID, "ns-1")
	}
}

func TestUserLookupAdapter_GetUserByExternalID_NotFound(t *testing.T) {
	repo := &mockUserRepo{err: errors.New("not found")}
	adapter := NewUserLookupAdapter(repo)

	_, err := adapter.GetUserByExternalID(context.Background(), "missing")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestUserLookupAdapter_ImplementsInterface(t *testing.T) {
	var _ middleware.UserLookup = (*UserLookupAdapter)(nil)
}
