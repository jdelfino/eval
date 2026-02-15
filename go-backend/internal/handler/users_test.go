package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// fullMockUserRepo implements store.UserRepository for user handler tests.
type fullMockUserRepo struct {
	listUsersFn          func(ctx context.Context, filters store.UserFilters) ([]store.User, error)
	updateUserAdminFn    func(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error)
	deleteUserFn         func(ctx context.Context, id uuid.UUID) error
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


func (m *fullMockUserRepo) CreateUser(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
	return nil, nil
}

func (m *fullMockUserRepo) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	if m.countByRoleFn != nil {
		return m.countByRoleFn(ctx, namespaceID)
	}
	return nil, nil
}

// userTestRepos embeds stubRepos and overrides user methods.
type userTestRepos struct {
	stubRepos
	users *fullMockUserRepo
}

var _ store.Repos = (*userTestRepos)(nil)

func (r *userTestRepos) ListUsers(ctx context.Context, filters store.UserFilters) ([]store.User, error) {
	return r.users.ListUsers(ctx, filters)
}
func (r *userTestRepos) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	return r.users.GetUserByID(ctx, id)
}
func (r *userTestRepos) UpdateUserAdmin(ctx context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
	return r.users.UpdateUserAdmin(ctx, id, params)
}
func (r *userTestRepos) DeleteUser(ctx context.Context, id uuid.UUID) error {
	return r.users.DeleteUser(ctx, id)
}
func (r *userTestRepos) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	return r.users.CountUsersByRole(ctx, namespaceID)
}

func userReposMiddleware(repo *fullMockUserRepo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(store.WithRepos(req.Context(), &userTestRepos{users: repo})))
		})
	}
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

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
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

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
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

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
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

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
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

func TestUpdateAdmin_Success(t *testing.T) {
	userID := uuid.New()
	newEmail := "updated@example.com"
	newRole := "instructor"
	nsID := "ns1"
	returned := &store.User{
		ID:          userID,
		Email:       newEmail,
		Role:        newRole,
		NamespaceID: &nsID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	repo := &fullMockUserRepo{
		updateUserAdminFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
			if id != userID {
				t.Fatalf("unexpected id")
			}
			return returned, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"email":"updated@example.com","role":"instructor"}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/"+userID.String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result store.User
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.ID != userID {
		t.Fatalf("expected user ID %s, got %s", userID, result.ID)
	}
	if result.Email != newEmail {
		t.Fatalf("expected email %s, got %s", newEmail, result.Email)
	}
}

func TestUpdateAdmin_ClearNullableFields(t *testing.T) {
	userID := uuid.New()
	emptyStr := ""
	returned := &store.User{
		ID:          userID,
		Email:       "user@example.com",
		Role:        "instructor",
		NamespaceID: nil,
		DisplayName: nil,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	repo := &fullMockUserRepo{
		updateUserAdminFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
			if id != userID {
				t.Fatalf("unexpected id")
			}
			if params.NamespaceID == nil {
				t.Fatal("expected namespace_id param to be non-nil (empty string to clear)")
			}
			if *params.NamespaceID != emptyStr {
				t.Fatalf("expected empty namespace_id, got %q", *params.NamespaceID)
			}
			return returned, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"namespace_id":""}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/"+userID.String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var result store.User
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.NamespaceID != nil {
		t.Fatalf("expected nil namespace_id, got %v", result.NamespaceID)
	}
}

func TestUpdateAdmin_NotFound(t *testing.T) {
	repo := &fullMockUserRepo{
		updateUserAdminFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"email":"x@example.com"}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/"+uuid.New().String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateAdmin_InternalError(t *testing.T) {
	repo := &fullMockUserRepo{
		updateUserAdminFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
			return nil, errors.New("db connection lost")
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"email":"x@example.com"}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/"+uuid.New().String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteNamespaceScoped_Success(t *testing.T) {
	nsID := "ns1"
	targetID := uuid.New()

	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			return &store.User{ID: id, NamespaceID: &nsID, Email: "target@example.com", Role: "student", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
		},
		deleteUserFn: func(_ context.Context, id uuid.UUID) error {
			if id != targetID {
				t.Fatalf("unexpected id")
			}
			return nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/admin/users/"+targetID.String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: nsID,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteNamespaceScoped_CrossNamespaceForbidden(t *testing.T) {
	otherNS := "other-ns"
	targetID := uuid.New()

	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			return &store.User{ID: id, NamespaceID: &otherNS, Email: "target@example.com", Role: "student", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/admin/users/"+targetID.String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "my-ns",
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if msg := resp["error"]; msg != "user is not in your namespace" {
		t.Fatalf("expected 'user is not in your namespace', got %q", msg)
	}
}

func TestDeleteNamespaceScoped_UserNotFound(t *testing.T) {
	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, _ uuid.UUID) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/admin/users/"+uuid.New().String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "ns1",
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateRole_Success(t *testing.T) {
	nsID := "ns1"
	targetID := uuid.New()
	newRole := "instructor"
	returned := &store.User{
		ID:          targetID,
		Email:       "target@example.com",
		Role:        newRole,
		NamespaceID: &nsID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			return &store.User{ID: id, NamespaceID: &nsID, Email: "target@example.com", Role: "student", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
		},
		updateUserAdminFn: func(_ context.Context, id uuid.UUID, params store.UpdateUserAdminParams) (*store.User, error) {
			if id != targetID {
				t.Fatalf("unexpected id")
			}
			if params.Role == nil || *params.Role != newRole {
				t.Fatalf("expected role %s", newRole)
			}
			return returned, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	body := `{"role":"instructor"}`
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+targetID.String()+"/role", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
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

	var result store.User
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Role != newRole {
		t.Fatalf("expected role %s, got %s", newRole, result.Role)
	}
}

func TestUpdateRole_CrossNamespaceForbidden(t *testing.T) {
	otherNS := "other-ns"
	targetID := uuid.New()

	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			return &store.User{ID: id, NamespaceID: &otherNS, Email: "target@example.com", Role: "student", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	body := `{"role":"instructor"}`
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+targetID.String()+"/role", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "my-ns",
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateRole_UserNotFound(t *testing.T) {
	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, _ uuid.UUID) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	body := `{"role":"instructor"}`
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+uuid.New().String()+"/role", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "ns1",
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListSystemUsers_WithFilters(t *testing.T) {
	var capturedFilters store.UserFilters
	repo := &fullMockUserRepo{
		listUsersFn: func(_ context.Context, filters store.UserFilters) ([]store.User, error) {
			capturedFilters = filters
			return []store.User{}, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodGet, "/system/users?role=instructor&namespace_id=ns1", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	if capturedFilters.Role == nil || *capturedFilters.Role != "instructor" {
		t.Fatalf("expected role filter 'instructor', got %v", capturedFilters.Role)
	}
	if capturedFilters.NamespaceID == nil || *capturedFilters.NamespaceID != "ns1" {
		t.Fatalf("expected namespace_id filter 'ns1', got %v", capturedFilters.NamespaceID)
	}
}

func TestListSystemUsers_InternalError(t *testing.T) {
	repo := &fullMockUserRepo{
		listUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			return nil, errors.New("db connection lost")
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodGet, "/system/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListNamespaceUsers_InternalError(t *testing.T) {
	repo := &fullMockUserRepo{
		listUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			return nil, errors.New("db connection lost")
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodGet, "/admin/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: "ns1",
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateAdmin_InvalidUUID(t *testing.T) {
	repo := &fullMockUserRepo{}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"email":"x@example.com"}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/not-a-uuid", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteUser_InvalidUUID(t *testing.T) {
	repo := &fullMockUserRepo{}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/system/users/not-a-uuid", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleSystemAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateRole_InvalidBody(t *testing.T) {
	nsID := "ns1"
	targetID := uuid.New()

	repo := &fullMockUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			return &store.User{ID: id, NamespaceID: &nsID, Email: "target@example.com", Role: "student", CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil
		},
	}

	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	body := `{}`
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+targetID.String()+"/role", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleNamespaceAdmin,
		NamespaceID: nsID,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", w.Code, w.Body.String())
	}
}

// --- RBAC Forbidden tests (middleware-level) ---

func TestListSystemUsers_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodGet, "/system/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleNamespaceAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for namespace-admin GET system users, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateAdmin_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	body := `{"email":"x@example.com"}`
	req := httptest.NewRequest(http.MethodPut, "/system/users/"+uuid.New().String(), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleNamespaceAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for namespace-admin PUT system user, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteUser_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/system/users", h.SystemRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/system/users/"+uuid.New().String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleNamespaceAdmin,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for namespace-admin DELETE system user, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListNamespaceUsers_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodGet, "/admin/users", nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student GET admin users, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteNamespaceScoped_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	req := httptest.NewRequest(http.MethodDelete, "/admin/users/"+uuid.New().String(), nil)
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE admin user, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateRole_RBACForbidden(t *testing.T) {
	repo := &fullMockUserRepo{}
	h := NewUserHandler()
	r := chi.NewRouter()
	r.Use(userReposMiddleware(repo))
	r.Mount("/admin/users", h.NamespaceRoutes())

	body := `{"role":"instructor"}`
	req := httptest.NewRequest(http.MethodPut, "/admin/users/"+uuid.New().String()+"/role", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	}))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student PUT admin user role, got %d: %s", w.Code, w.Body.String())
	}
}
