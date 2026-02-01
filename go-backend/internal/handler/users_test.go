package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
)

// fullMockUserRepo implements store.UserRepository for user handler tests.
type fullMockUserRepo struct {
	listUsersFn          func(ctx context.Context, filters store.UserFilters) ([]store.User, error)
	updateUserAdminFn    func(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error)
	deleteUserFn         func(ctx context.Context, id uuid.UUID) error
	listByNamespaceFn    func(ctx context.Context, namespaceID string) ([]store.User, error)
	countByRoleFn        func(ctx context.Context, namespaceID string) (map[string]int, error)
	getUserByIDFn        func(ctx context.Context, id uuid.UUID) (*store.User, error)
	getUserByExternalIDFn func(ctx context.Context, externalID string) (*store.User, error)
	getUserByEmailFn     func(ctx context.Context, email string) (*store.User, error)
	updateUserFn         func(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error)
}

func (m *fullMockUserRepo) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	if m.getUserByIDFn != nil {
		return m.getUserByIDFn(ctx, id)
	}
	return nil, store.ErrNotFound
}

func (m *fullMockUserRepo) GetUserByExternalID(ctx context.Context, externalID string) (*store.User, error) {
	if m.getUserByExternalIDFn != nil {
		return m.getUserByExternalIDFn(ctx, externalID)
	}
	return nil, store.ErrNotFound
}

func (m *fullMockUserRepo) GetUserByEmail(ctx context.Context, email string) (*store.User, error) {
	if m.getUserByEmailFn != nil {
		return m.getUserByEmailFn(ctx, email)
	}
	return nil, store.ErrNotFound
}

func (m *fullMockUserRepo) UpdateUser(ctx context.Context, id uuid.UUID, params store.UpdateUserParams) (*store.User, error) {
	if m.updateUserFn != nil {
		return m.updateUserFn(ctx, id, params)
	}
	return nil, nil
}

func (m *fullMockUserRepo) ListUsers(ctx context.Context, filters store.UserFilters) ([]store.User, error) {
	return m.listUsersFn(ctx, filters)
}

func (m *fullMockUserRepo) UpdateUserAdmin(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
	return m.updateUserAdminFn(ctx, id, params)
}

func (m *fullMockUserRepo) DeleteUser(ctx context.Context, id uuid.UUID) error {
	return m.deleteUserFn(ctx, id)
}

func (m *fullMockUserRepo) ListUsersByNamespace(ctx context.Context, namespaceID string) ([]store.User, error) {
	if m.listByNamespaceFn != nil {
		return m.listByNamespaceFn(ctx, namespaceID)
	}
	return nil, nil
}

func (m *fullMockUserRepo) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	if m.countByRoleFn != nil {
		return m.countByRoleFn(ctx, namespaceID)
	}
	return nil, nil
}

func TestListSystemUsers_Success(t *testing.T) {
	nsID := "test-ns"
	users := []store.User{
		{ID: uuid.New(), Email: "a@example.com", Role: "instructor", NamespaceID: &nsID, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}
	repo := &fullMockUserRepo{
		listUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			return users, nil
		},
	}

	h := NewUserHandler(repo)
	r := chi.NewRouter()
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodGet, "/system/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result []store.User
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 user, got %d", len(result))
	}
}

func TestListNamespaceUsers_Success(t *testing.T) {
	nsID := "test-ns"
	users := []store.User{
		{ID: uuid.New(), Email: "b@example.com", Role: "student", NamespaceID: &nsID, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}
	repo := &fullMockUserRepo{
		listUsersFn: func(_ context.Context, filters store.UserFilters) ([]store.User, error) {
			if filters.NamespaceID == nil || *filters.NamespaceID != nsID {
				t.Fatalf("expected namespace filter %q", nsID)
			}
			return users, nil
		},
	}

	h := NewUserHandler(repo)
	r := chi.NewRouter()
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodGet, "/admin/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: nsID,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteUser_Success(t *testing.T) {
	userID := uuid.New()
	repo := &fullMockUserRepo{
		deleteUserFn: func(_ context.Context, id uuid.UUID) error {
			if id != userID {
				t.Fatalf("unexpected user id")
			}
			return nil
		},
	}

	h := NewUserHandler(repo)
	r := chi.NewRouter()
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/system/users/"+userID.String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteUser_NotFound(t *testing.T) {
	repo := &fullMockUserRepo{
		deleteUserFn: func(_ context.Context, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	h := NewUserHandler(repo)
	r := chi.NewRouter()
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/system/users/"+uuid.New().String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
