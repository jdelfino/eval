package handler

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// StubUserRepo implements store.UserRepository for testing.
// Each method has an optional function field; when set, the method delegates
// to it. When nil, lookup methods return store.ErrNotFound and collection
// methods return zero values.
type StubUserRepo struct {
	GetUserByIDFn         func(ctx context.Context, id uuid.UUID) (*store.User, error)
	GetUserByExternalIDFn func(ctx context.Context, externalID string) (*store.User, error)
	GetUserByEmailFn      func(ctx context.Context, email string) (*store.User, error)
	UpdateUserFn          func(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error)
	ListUsersFn           func(ctx context.Context, filters store.UserFilters) ([]store.User, error)
	UpdateUserAdminFn     func(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error)
	DeleteUserFn          func(ctx context.Context, id uuid.UUID) error
	CountUsersByRoleFn    func(ctx context.Context, namespaceID string) (map[string]int, error)
	CreateUserFn          func(ctx context.Context, params store.CreateUserParams) (*store.User, error)
}

// Compile-time check that StubUserRepo implements store.UserRepository.
var _ store.UserRepository = (*StubUserRepo)(nil)

func (s *StubUserRepo) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	if s.GetUserByIDFn != nil {
		return s.GetUserByIDFn(ctx, id)
	}
	return nil, store.ErrNotFound
}

func (s *StubUserRepo) GetUserByExternalID(ctx context.Context, externalID string) (*store.User, error) {
	if s.GetUserByExternalIDFn != nil {
		return s.GetUserByExternalIDFn(ctx, externalID)
	}
	return nil, store.ErrNotFound
}

func (s *StubUserRepo) GetUserByEmail(ctx context.Context, email string) (*store.User, error) {
	if s.GetUserByEmailFn != nil {
		return s.GetUserByEmailFn(ctx, email)
	}
	return nil, store.ErrNotFound
}

func (s *StubUserRepo) UpdateUser(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
	if s.UpdateUserFn != nil {
		return s.UpdateUserFn(ctx, id, params)
	}
	return nil, store.ErrNotFound
}

func (s *StubUserRepo) ListUsers(ctx context.Context, filters store.UserFilters) ([]store.User, error) {
	if s.ListUsersFn != nil {
		return s.ListUsersFn(ctx, filters)
	}
	return nil, nil
}

func (s *StubUserRepo) UpdateUserAdmin(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
	if s.UpdateUserAdminFn != nil {
		return s.UpdateUserAdminFn(ctx, id, params)
	}
	return nil, store.ErrNotFound
}

func (s *StubUserRepo) DeleteUser(ctx context.Context, id uuid.UUID) error {
	if s.DeleteUserFn != nil {
		return s.DeleteUserFn(ctx, id)
	}
	return store.ErrNotFound
}

func (s *StubUserRepo) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	if s.CountUsersByRoleFn != nil {
		return s.CountUsersByRoleFn(ctx, namespaceID)
	}
	return nil, nil
}

func (s *StubUserRepo) CreateUser(ctx context.Context, params store.CreateUserParams) (*store.User, error) {
	if s.CreateUserFn != nil {
		return s.CreateUserFn(ctx, params)
	}
	return nil, store.ErrNotFound
}

// --- Tests for StubUserRepo ---

// TestStubUserRepo_DefaultsReturnErrNotFound verifies that a zero-value
// StubUserRepo returns store.ErrNotFound for all lookup methods.
func TestStubUserRepo_DefaultsReturnErrNotFound(t *testing.T) {
	repo := &StubUserRepo{}
	ctx := context.Background()

	_, err := repo.GetUserByID(ctx, uuid.New())
	if err != store.ErrNotFound {
		t.Errorf("GetUserByID: got %v, want ErrNotFound", err)
	}

	_, err = repo.GetUserByExternalID(ctx, "ext-123")
	if err != store.ErrNotFound {
		t.Errorf("GetUserByExternalID: got %v, want ErrNotFound", err)
	}

	_, err = repo.GetUserByEmail(ctx, "test@example.com")
	if err != store.ErrNotFound {
		t.Errorf("GetUserByEmail: got %v, want ErrNotFound", err)
	}

	_, err = repo.UpdateUser(ctx, uuid.New(), store.UpdateUserParams{})
	if err != store.ErrNotFound {
		t.Errorf("UpdateUser: got %v, want ErrNotFound", err)
	}

	_, err = repo.UpdateUserAdmin(ctx, uuid.New(), store.UpdateUserAdminParams{})
	if err != store.ErrNotFound {
		t.Errorf("UpdateUserAdmin: got %v, want ErrNotFound", err)
	}

	err = repo.DeleteUser(ctx, uuid.New())
	if err != store.ErrNotFound {
		t.Errorf("DeleteUser: got %v, want ErrNotFound", err)
	}

	_, err = repo.CreateUser(ctx, store.CreateUserParams{})
	if err != store.ErrNotFound {
		t.Errorf("CreateUser: got %v, want ErrNotFound", err)
	}
}

// TestStubUserRepo_DefaultsReturnZeroValues verifies that list/count methods
// return zero values (not errors) when no function field is set.
func TestStubUserRepo_DefaultsReturnZeroValues(t *testing.T) {
	repo := &StubUserRepo{}
	ctx := context.Background()

	users, err := repo.ListUsers(ctx, store.UserFilters{})
	if err != nil {
		t.Errorf("ListUsers: unexpected error %v", err)
	}
	if users != nil {
		t.Errorf("ListUsers: got %v, want nil", users)
	}

	counts, err := repo.CountUsersByRole(ctx, "ns-1")
	if err != nil {
		t.Errorf("CountUsersByRole: unexpected error %v", err)
	}
	if counts != nil {
		t.Errorf("CountUsersByRole: got %v, want nil", counts)
	}
}

// TestStubUserRepo_FunctionFieldOverrides verifies that setting a function field
// causes that method to delegate to the provided function.
func TestStubUserRepo_FunctionFieldOverrides(t *testing.T) {
	expectedUser := &store.User{
		ID:    uuid.New(),
		Email: "override@example.com",
		Role:  "instructor",
	}

	repo := &StubUserRepo{
		GetUserByIDFn: func(_ context.Context, _ uuid.UUID) (*store.User, error) {
			return expectedUser, nil
		},
		GetUserByExternalIDFn: func(_ context.Context, _ string) (*store.User, error) {
			return expectedUser, nil
		},
		GetUserByEmailFn: func(_ context.Context, _ string) (*store.User, error) {
			return expectedUser, nil
		},
		UpdateUserFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
			return expectedUser, nil
		},
		ListUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			return []store.User{*expectedUser}, nil
		},
		UpdateUserAdminFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
			return expectedUser, nil
		},
		DeleteUserFn: func(_ context.Context, _ uuid.UUID) error {
			return nil
		},
		CountUsersByRoleFn: func(_ context.Context, _ string) (map[string]int, error) {
			return map[string]int{"instructor": 1}, nil
		},
		CreateUserFn: func(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
			return expectedUser, nil
		},
	}

	ctx := context.Background()

	user, err := repo.GetUserByID(ctx, uuid.New())
	if err != nil || user != expectedUser {
		t.Errorf("GetUserByID override failed")
	}

	user, err = repo.GetUserByExternalID(ctx, "ext")
	if err != nil || user != expectedUser {
		t.Errorf("GetUserByExternalID override failed")
	}

	user, err = repo.GetUserByEmail(ctx, "test@example.com")
	if err != nil || user != expectedUser {
		t.Errorf("GetUserByEmail override failed")
	}

	user, err = repo.UpdateUser(ctx, uuid.New(), store.UpdateUserParams{})
	if err != nil || user != expectedUser {
		t.Errorf("UpdateUser override failed")
	}

	users, err := repo.ListUsers(ctx, store.UserFilters{})
	if err != nil || len(users) != 1 {
		t.Errorf("ListUsers override failed")
	}

	user, err = repo.UpdateUserAdmin(ctx, uuid.New(), store.UpdateUserAdminParams{})
	if err != nil || user != expectedUser {
		t.Errorf("UpdateUserAdmin override failed")
	}

	err = repo.DeleteUser(ctx, uuid.New())
	if err != nil {
		t.Errorf("DeleteUser override failed")
	}

	counts, err := repo.CountUsersByRole(ctx, "ns")
	if err != nil || counts["instructor"] != 1 {
		t.Errorf("CountUsersByRole override failed")
	}

	user, err = repo.CreateUser(ctx, store.CreateUserParams{})
	if err != nil || user != expectedUser {
		t.Errorf("CreateUser override failed")
	}
}

// TestStubUserRepo_ImplementsInterface ensures StubUserRepo satisfies
// store.UserRepository at compile time.
func TestStubUserRepo_ImplementsInterface(t *testing.T) {
	var _ store.UserRepository = (*StubUserRepo)(nil)
}
