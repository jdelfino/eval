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

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/test-ns", nil)

	// Set chi URL param
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/nonexistent", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "nonexistent")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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
	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleSystemAdmin})
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
	h := NewNamespaceHandler(&mockNamespaceRepo{})
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateNamespace_RBACForbidden(t *testing.T) {
	// Test that the Routes() method applies RequireRole middleware to POST.
	// A non-system-admin should get 403.
	repo := &mockNamespaceRepo{}
	h := NewNamespaceHandler(repo)
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
	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
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
	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/nonexistent", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "nonexistent")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestCreateNamespace_MissingRequiredFields(t *testing.T) {
	h := NewNamespaceHandler(&mockNamespaceRepo{})
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
	h := NewNamespaceHandler(&mockNamespaceRepo{})
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
	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
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

	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/test-ns", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateNamespace_InvalidBody(t *testing.T) {
	h := NewNamespaceHandler(&mockNamespaceRepo{})
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
	h := NewNamespaceHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "test-ns")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleSystemAdmin})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestUpdateNamespace_RBACForbidden(t *testing.T) {
	repo := &mockNamespaceRepo{}
	h := NewNamespaceHandler(repo)
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{"display_name": "New Name"})
	req := httptest.NewRequest(http.MethodPatch, "/test-ns", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleInstructor,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-system-admin PATCH, got %d: %s", rec.Code, rec.Body.String())
	}
}
