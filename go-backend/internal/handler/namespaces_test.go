package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockNamespaceRepo implements store.NamespaceRepository for testing.
type mockNamespaceRepo struct {
	listNamespacesFn  func(ctx context.Context) ([]store.Namespace, error)
	getNamespaceFn    func(ctx context.Context, id string) (*store.Namespace, error)
	createNamespaceFn func(ctx context.Context, params store.CreateNamespaceParams) (*store.Namespace, error)
	updateNamespaceFn func(ctx context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error)
}

func (m *mockNamespaceRepo) ListNamespaces(ctx context.Context) ([]store.Namespace, error) {
	return m.listNamespacesFn(ctx)
}

func (m *mockNamespaceRepo) GetNamespace(ctx context.Context, id string) (*store.Namespace, error) {
	return m.getNamespaceFn(ctx, id)
}

func (m *mockNamespaceRepo) CreateNamespace(ctx context.Context, params store.CreateNamespaceParams) (*store.Namespace, error) {
	return m.createNamespaceFn(ctx, params)
}

func (m *mockNamespaceRepo) UpdateNamespace(ctx context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error) {
	return m.updateNamespaceFn(ctx, id, params)
}

// namespaceTestRepos embeds stubRepos and overrides namespace/user methods.
type namespaceTestRepos struct {
	stubRepos
	ns    *mockNamespaceRepo
	users *StubUserRepo
}

var _ store.Repos = (*namespaceTestRepos)(nil)

func (r *namespaceTestRepos) ListNamespaces(ctx context.Context) ([]store.Namespace, error) {
	return r.ns.ListNamespaces(ctx)
}
func (r *namespaceTestRepos) GetNamespace(ctx context.Context, id string) (*store.Namespace, error) {
	return r.ns.GetNamespace(ctx, id)
}
func (r *namespaceTestRepos) CreateNamespace(ctx context.Context, params store.CreateNamespaceParams) (*store.Namespace, error) {
	return r.ns.CreateNamespace(ctx, params)
}
func (r *namespaceTestRepos) UpdateNamespace(ctx context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error) {
	return r.ns.UpdateNamespace(ctx, id, params)
}
func (r *namespaceTestRepos) ListUsers(ctx context.Context, filters store.UserFilters) ([]store.User, error) {
	if r.users != nil {
		return r.users.ListUsers(ctx, filters)
	}
	panic("namespaceTestRepos: unexpected ListUsers call")
}
func (r *namespaceTestRepos) CountUsersByRole(ctx context.Context, namespaceID string) (map[string]int, error) {
	if r.users != nil {
		return r.users.CountUsersByRole(ctx, namespaceID)
	}
	panic("namespaceTestRepos: unexpected CountUsersByRole call")
}

func nsRepos(repo *mockNamespaceRepo, users *StubUserRepo) *namespaceTestRepos {
	return &namespaceTestRepos{ns: repo, users: users}
}

func testNamespace() *store.Namespace {
	createdBy := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	return &store.Namespace{
		ID:          "test-ns",
		DisplayName: "Test Namespace",
		Active:      true,
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		CreatedBy:   &createdBy,
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}


func TestListNamespaces_Success(t *testing.T) {
	ns := testNamespace()
	repo := &mockNamespaceRepo{
		listNamespacesFn: func(_ context.Context) ([]store.Namespace, error) {
			return []store.Namespace{*ns}, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Namespace
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 namespace, got %d", len(got))
	}
	if got[0].ID != ns.ID {
		t.Errorf("expected id %q, got %q", ns.ID, got[0].ID)
	}
}

func TestListNamespaces_Empty(t *testing.T) {
	repo := &mockNamespaceRepo{
		listNamespacesFn: func(_ context.Context) ([]store.Namespace, error) {
			return nil, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// Should return empty array, not null
	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListNamespaces_InternalError(t *testing.T) {
	repo := &mockNamespaceRepo{
		listNamespacesFn: func(_ context.Context) ([]store.Namespace, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetNamespace_Success(t *testing.T) {
	ns := testNamespace()
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, id string) (*store.Namespace, error) {
			if id != "test-ns" {
				t.Fatalf("unexpected id: %v", id)
			}
			return ns, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns", nil)

	// Set chi URL param
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.Namespace
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != ns.ID {
		t.Errorf("expected id %q, got %q", ns.ID, got.ID)
	}
}

func TestGetNamespace_NotFound(t *testing.T) {
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, _ string) (*store.Namespace, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/nonexistent", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "nonexistent")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestCreateNamespace_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	ns := testNamespace()

	repo := &mockNamespaceRepo{
		createNamespaceFn: func(_ context.Context, params store.CreateNamespaceParams) (*store.Namespace, error) {
			if params.ID != "test-ns" {
				t.Fatalf("unexpected id: %v", params.ID)
			}
			if params.DisplayName != "Test Namespace" {
				t.Fatalf("unexpected display_name: %v", params.DisplayName)
			}
			if params.CreatedBy == nil || *params.CreatedBy != userID {
				t.Fatalf("unexpected created_by: %v", params.CreatedBy)
			}
			return ns, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"id":           "test-ns",
		"display_name": "Test Namespace",
	})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Namespace
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != ns.ID {
		t.Errorf("expected id %q, got %q", ns.ID, got.ID)
	}
}

func TestCreateNamespace_Unauthorized(t *testing.T) {
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateNamespace_RBACForbidden(t *testing.T) {
	// Test that the Routes() method applies RequirePermission middleware to POST.
	// A non-system-admin should get 403.
	repo := &mockNamespaceRepo{}
	h := NewNamespaceHandler()
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{
		"id":           "test-ns",
		"display_name": "Test Namespace",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-system-admin POST, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateNamespace_Success(t *testing.T) {
	ns := testNamespace()
	newName := "Updated Namespace"
	ns.DisplayName = newName

	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error) {
			if id != "test-ns" {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.DisplayName == nil || *params.DisplayName != newName {
				t.Fatalf("unexpected display_name: %v", params.DisplayName)
			}
			return ns, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"display_name": newName,
	})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Namespace
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.DisplayName != newName {
		t.Errorf("expected display_name %q, got %q", newName, got.DisplayName)
	}
}

func TestUpdateNamespace_NotFound(t *testing.T) {
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			return nil, store.ErrNotFound
		},
	}

	body, _ := json.Marshal(map[string]any{"display_name": "New Name"})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPatch, "/nonexistent", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "nonexistent")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestCreateNamespace_MissingRequiredFields(t *testing.T) {
	h := NewNamespaceHandler()
	// Missing both id and display_name
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateNamespace_InvalidBody(t *testing.T) {
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateNamespace_InternalError(t *testing.T) {
	repo := &mockNamespaceRepo{
		createNamespaceFn: func(_ context.Context, _ store.CreateNamespaceParams) (*store.Namespace, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{
		"id":           "test-ns",
		"display_name": "Test Namespace",
	})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetNamespace_InternalError(t *testing.T) {
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, _ string) (*store.Namespace, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateNamespace_InvalidBody(t *testing.T) {
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateNamespace_InternalError(t *testing.T) {
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"display_name": "Updated"})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateNamespace_RBACForbidden(t *testing.T) {
	repo := &mockNamespaceRepo{}
	h := NewNamespaceHandler()
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{"display_name": "New Name"})
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleInstructor,
	})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-system-admin PATCH, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteNamespace_Success(t *testing.T) {
	ns := testNamespace()
	ns.Active = false

	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error) {
			if id != "test-ns" {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Active == nil || *params.Active != false {
				t.Fatalf("expected active=false, got %v", params.Active)
			}
			return ns, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodDelete, "/test-ns", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteNamespace_InternalError(t *testing.T) {
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodDelete, "/test-ns", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteNamespace_NotFound(t *testing.T) {
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodDelete, "/test-ns", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNSListUsers_Success(t *testing.T) {
	nsID := "test-ns"
	userID := uuid.New()
	users := &StubUserRepo{
		ListUsersFn: func(_ context.Context, filters store.UserFilters) ([]store.User, error) {
			if filters.NamespaceID == nil || *filters.NamespaceID != nsID {
				t.Fatalf("expected namespace filter %q, got %v", nsID, filters.NamespaceID)
			}
			return []store.User{
				{ID: userID, Email: "alice@example.com", Role: "student", NamespaceID: &nsID},
			}, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns/users", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nsID)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: nsID})
	ctx = store.WithRepos(ctx, nsRepos(&mockNamespaceRepo{}, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListUsers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.User
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 user, got %d", len(got))
	}
	if got[0].Email != "alice@example.com" {
		t.Errorf("expected email alice@example.com, got %q", got[0].Email)
	}
}

func TestNSListUsers_Empty(t *testing.T) {
	users := &StubUserRepo{
		ListUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			return nil, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns/users", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "test-ns"})
	ctx = store.WithRepos(ctx, nsRepos(&mockNamespaceRepo{}, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListUsers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestGetCapacity_Success(t *testing.T) {
	maxInst := 5
	maxStud := 50
	ns := testNamespace()
	ns.MaxInstructors = &maxInst
	ns.MaxStudents = &maxStud

	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, id string) (*store.Namespace, error) {
			if id != "test-ns" {
				t.Fatalf("unexpected id: %v", id)
			}
			return ns, nil
		},
	}
	users := &StubUserRepo{
		CountUsersByRoleFn: func(_ context.Context, namespaceID string) (map[string]int, error) {
			if namespaceID != "test-ns" {
				t.Fatalf("unexpected namespace id: %v", namespaceID)
			}
			return map[string]int{"instructor": 2, "student": 10}, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns/capacity", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "test-ns"})
	ctx = store.WithRepos(ctx, nsRepos(repo, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetCapacity(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got capacityResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.MaxInstructors == nil || *got.MaxInstructors != 5 {
		t.Errorf("expected max_instructors=5, got %v", got.MaxInstructors)
	}
	if got.MaxStudents == nil || *got.MaxStudents != 50 {
		t.Errorf("expected max_students=50, got %v", got.MaxStudents)
	}
	if got.CurrentCounts["instructor"] != 2 {
		t.Errorf("expected instructor count 2, got %d", got.CurrentCounts["instructor"])
	}
	if got.CurrentCounts["student"] != 10 {
		t.Errorf("expected student count 10, got %d", got.CurrentCounts["student"])
	}
}

func TestGetCapacity_NotFound(t *testing.T) {
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, _ string) (*store.Namespace, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns/capacity", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "test-ns"})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetCapacity(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetCapacity_CountError(t *testing.T) {
	ns := testNamespace()
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, _ string) (*store.Namespace, error) {
			return ns, nil
		},
	}
	users := &StubUserRepo{
		CountUsersByRoleFn: func(_ context.Context, _ string) (map[string]int, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/test-ns/capacity", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "test-ns"})
	ctx = store.WithRepos(ctx, nsRepos(repo, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetCapacity(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCapacity_Success(t *testing.T) {
	maxInst := 10
	maxStud := 100
	ns := testNamespace()
	ns.MaxInstructors = &maxInst
	ns.MaxStudents = &maxStud

	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, id string, params store.UpdateNamespaceParams) (*store.Namespace, error) {
			if id != "test-ns" {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.MaxInstructors == nil || *params.MaxInstructors != 10 {
				t.Fatalf("expected max_instructors=10, got %v", params.MaxInstructors)
			}
			if params.MaxStudents == nil || *params.MaxStudents != 100 {
				t.Fatalf("expected max_students=100, got %v", params.MaxStudents)
			}
			return ns, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"max_instructors": 10,
		"max_students":    100,
	})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPut, "/test-ns/capacity", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCapacity(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Namespace
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.MaxInstructors == nil || *got.MaxInstructors != 10 {
		t.Errorf("expected max_instructors=10, got %v", got.MaxInstructors)
	}
	if got.MaxStudents == nil || *got.MaxStudents != 100 {
		t.Errorf("expected max_students=100, got %v", got.MaxStudents)
	}
}

func TestListUsers_NamespaceAdminCrossNamespace_Forbidden(t *testing.T) {
	users := &StubUserRepo{
		ListUsersFn: func(_ context.Context, _ store.UserFilters) ([]store.User, error) {
			t.Fatal("should not reach repo")
			return nil, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/other-ns/users", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "other-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "my-ns"})
	ctx = store.WithRepos(ctx, nsRepos(&mockNamespaceRepo{}, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListUsers(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListUsers_SystemAdmin_AllowsCrossNamespace(t *testing.T) {
	users := &StubUserRepo{
		ListUsersFn: func(_ context.Context, filters store.UserFilters) ([]store.User, error) {
			return []store.User{}, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/any-ns/users", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "any-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin, NamespaceID: ""})
	ctx = store.WithRepos(ctx, nsRepos(&mockNamespaceRepo{}, users))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListUsers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetCapacity_NamespaceAdminCrossNamespace_Forbidden(t *testing.T) {
	repo := &mockNamespaceRepo{
		getNamespaceFn: func(_ context.Context, _ string) (*store.Namespace, error) {
			t.Fatal("should not reach repo")
			return nil, nil
		},
	}

	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodGet, "/other-ns/capacity", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "other-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "my-ns"})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.GetCapacity(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCapacity_NamespaceAdminCrossNamespace_Forbidden(t *testing.T) {
	// UpdateCapacity is system-admin only via middleware, but the handler itself
	// should also enforce namespace scoping for defense in depth.
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			t.Fatal("should not reach repo")
			return nil, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"max_instructors": 5})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPut, "/other-ns/capacity", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "other-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleNamespaceAdmin, NamespaceID: "my-ns"})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCapacity(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- RBAC Forbidden tests (middleware-level) ---

func TestDeleteNamespace_RBACForbidden(t *testing.T) {
	repo := &mockNamespaceRepo{}
	h := NewNamespaceHandler()
	router := h.Routes()

	req := httptest.NewRequest(http.MethodDelete, "/test-ns", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE namespace, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNSListUsers_RBACForbidden(t *testing.T) {
	h := NewNamespaceHandler()
	router := h.Routes()

	req := httptest.NewRequest(http.MethodGet, "/test-ns/users", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student GET namespace users, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetCapacity_RBACForbidden(t *testing.T) {
	h := NewNamespaceHandler()
	router := h.Routes()

	req := httptest.NewRequest(http.MethodGet, "/test-ns/capacity", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student GET capacity, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCapacity_RBACForbidden(t *testing.T) {
	h := NewNamespaceHandler()
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{"max_instructors": 5})
	req := httptest.NewRequest(http.MethodPut, "/test-ns/capacity", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleNamespaceAdmin,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for namespace-admin PUT capacity, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateCapacity_NotFound(t *testing.T) {
	repo := &mockNamespaceRepo{
		updateNamespaceFn: func(_ context.Context, _ string, _ store.UpdateNamespaceParams) (*store.Namespace, error) {
			return nil, store.ErrNotFound
		},
	}

	body, _ := json.Marshal(map[string]any{"max_instructors": 5})
	h := NewNamespaceHandler()
	req := httptest.NewRequest(http.MethodPut, "/test-ns/capacity", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	ctx = store.WithRepos(ctx, nsRepos(repo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.UpdateCapacity(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}
