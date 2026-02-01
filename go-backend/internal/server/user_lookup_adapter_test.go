package server

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
)

// mockUserRepo is a store.UserRepository stub that returns configured responses.
type mockUserRepo struct {
	user *store.User
	err  error
}

func (m *mockUserRepo) GetUserByID(_ context.Context, _ uuid.UUID) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) UpdateUser(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) GetUserByEmail(_ context.Context, _ string) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) ListUsers(_ context.Context, _ store.UserFilters) ([]store.User, error) {
	return nil, nil
}

func (m *mockUserRepo) UpdateUserAdmin(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
	return m.user, m.err
}

func (m *mockUserRepo) DeleteUser(_ context.Context, _ uuid.UUID) error {
	return m.err
}


func (m *mockUserRepo) CountUsersByRole(_ context.Context, _ string) (map[string]int, error) {
	return nil, nil
}

func (m *mockUserRepo) CreateUser(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
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
