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

// mockProblemRepo implements store.ProblemRepository for testing.
type mockProblemRepo struct {
	listProblemsFn  func(ctx context.Context, classID *uuid.UUID) ([]store.Problem, error)
	getProblemFn    func(ctx context.Context, id uuid.UUID) (*store.Problem, error)
	createProblemFn func(ctx context.Context, params store.CreateProblemParams) (*store.Problem, error)
	updateProblemFn func(ctx context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error)
	deleteProblemFn func(ctx context.Context, id uuid.UUID) error
}

func (m *mockProblemRepo) ListProblems(ctx context.Context, classID *uuid.UUID) ([]store.Problem, error) {
	return m.listProblemsFn(ctx, classID)
}

func (m *mockProblemRepo) GetProblem(ctx context.Context, id uuid.UUID) (*store.Problem, error) {
	return m.getProblemFn(ctx, id)
}

func (m *mockProblemRepo) CreateProblem(ctx context.Context, params store.CreateProblemParams) (*store.Problem, error) {
	return m.createProblemFn(ctx, params)
}

func (m *mockProblemRepo) UpdateProblem(ctx context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error) {
	return m.updateProblemFn(ctx, id, params)
}

func (m *mockProblemRepo) DeleteProblem(ctx context.Context, id uuid.UUID) error {
	return m.deleteProblemFn(ctx, id)
}

func testProblem() *store.Problem {
	desc := "Write a function that adds two numbers"
	starter := "func add(a, b int) int {\n\treturn 0\n}"
	return &store.Problem{
		ID:                uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID:       "test-ns",
		Title:             "Two Sum",
		Description:       &desc,
		StarterCode:       &starter,
		TestCases:         json.RawMessage(`[{"input":"1 2","expected":"3"}]`),
		ExecutionSettings: json.RawMessage(`{"timeout":5}`),
		AuthorID:          uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		ClassID:           nil,
		CreatedAt:         time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:         time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func TestListProblems_Success(t *testing.T) {
	p := testProblem()
	repo := &mockProblemRepo{
		listProblemsFn: func(_ context.Context, classID *uuid.UUID) ([]store.Problem, error) {
			if classID != nil {
				t.Fatalf("expected nil classID, got %v", classID)
			}
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Problem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 problem, got %d", len(got))
	}
	if got[0].ID != p.ID {
		t.Errorf("expected id %q, got %q", p.ID, got[0].ID)
	}
}

func TestListProblems_WithClassIDFilter(t *testing.T) {
	classID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	p := testProblem()
	p.ClassID = &classID

	repo := &mockProblemRepo{
		listProblemsFn: func(_ context.Context, cid *uuid.UUID) ([]store.Problem, error) {
			if cid == nil {
				t.Fatalf("expected classID, got nil")
			}
			if *cid != classID {
				t.Fatalf("expected classID %v, got %v", classID, *cid)
			}
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/?class_id="+classID.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestListProblems_InvalidClassID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/?class_id=not-a-uuid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListProblems_Empty(t *testing.T) {
	repo := &mockProblemRepo{
		listProblemsFn: func(_ context.Context, _ *uuid.UUID) ([]store.Problem, error) {
			return nil, nil
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListProblems_InternalError(t *testing.T) {
	repo := &mockProblemRepo{
		listProblemsFn: func(_ context.Context, _ *uuid.UUID) ([]store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetProblem_Success(t *testing.T) {
	p := testProblem()
	repo := &mockProblemRepo{
		getProblemFn: func(_ context.Context, id uuid.UUID) (*store.Problem, error) {
			if id != p.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return p, nil
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.Problem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != p.ID {
		t.Errorf("expected id %q, got %q", p.ID, got.ID)
	}
}

func TestGetProblem_NotFound(t *testing.T) {
	repo := &mockProblemRepo{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetProblem_InvalidID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateProblem_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	p := testProblem()

	repo := &mockProblemRepo{
		createProblemFn: func(_ context.Context, params store.CreateProblemParams) (*store.Problem, error) {
			if params.Title != "Two Sum" {
				t.Fatalf("unexpected title: %v", params.Title)
			}
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			if params.AuthorID != userID {
				t.Fatalf("unexpected author_id: %v", params.AuthorID)
			}
			return p, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"title":       "Two Sum",
		"description": "Write a function that adds two numbers",
		"test_cases":  json.RawMessage(`[{"input":"1 2","expected":"3"}]`),
	})
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          userID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Problem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != p.ID {
		t.Errorf("expected id %q, got %q", p.ID, got.ID)
	}
}

func TestCreateProblem_Unauthorized(t *testing.T) {
	h := NewProblemHandler(&mockProblemRepo{})
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateProblem_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(repo)
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{
		"title": "Two Sum",
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
		t.Fatalf("expected 403 for student POST, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateProblem_Success(t *testing.T) {
	p := testProblem()
	newTitle := "Three Sum"
	p.Title = newTitle

	repo := &mockProblemRepo{
		updateProblemFn: func(_ context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error) {
			if id != p.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Title == nil || *params.Title != newTitle {
				t.Fatalf("unexpected title: %v", params.Title)
			}
			return p, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"title": newTitle,
	})
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/"+p.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Problem
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Title != newTitle {
		t.Errorf("expected title %q, got %q", newTitle, got.Title)
	}
}

func TestUpdateProblem_NotFound(t *testing.T) {
	repo := &mockProblemRepo{
		updateProblemFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateProblemParams) (*store.Problem, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"title": "New Title"})
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProblem_Success(t *testing.T) {
	problemID := uuid.New()
	repo := &mockProblemRepo{
		deleteProblemFn: func(_ context.Context, id uuid.UUID) error {
			if id != problemID {
				t.Fatalf("unexpected id: %v", id)
			}
			return nil
		},
	}

	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/"+problemID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestDeleteProblem_NotFound(t *testing.T) {
	repo := &mockProblemRepo{
		deleteProblemFn: func(_ context.Context, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProblem_InvalidID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateProblem_MissingTitle(t *testing.T) {
	h := NewProblemHandler(&mockProblemRepo{})
	body, _ := json.Marshal(map[string]any{"description": "no title"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateProblem_InvalidBody(t *testing.T) {
	h := NewProblemHandler(&mockProblemRepo{})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateProblem_InternalError(t *testing.T) {
	repo := &mockProblemRepo{
		createProblemFn: func(_ context.Context, _ store.CreateProblemParams) (*store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"title": "Two Sum"})
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateProblem_InvalidID(t *testing.T) {
	h := NewProblemHandler(&mockProblemRepo{})
	body, _ := json.Marshal(map[string]any{"title": "New Title"})
	req := httptest.NewRequest(http.MethodPatch, "/not-a-uuid", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateProblem_InvalidBody(t *testing.T) {
	id := uuid.New()
	h := NewProblemHandler(&mockProblemRepo{})
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateProblem_InternalError(t *testing.T) {
	repo := &mockProblemRepo{
		updateProblemFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateProblemParams) (*store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"title": "New Title"})
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetProblem_InternalError(t *testing.T) {
	repo := &mockProblemRepo{
		getProblemFn: func(_ context.Context, _ uuid.UUID) (*store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteProblem_InternalError(t *testing.T) {
	repo := &mockProblemRepo{
		deleteProblemFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewProblemHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteProblem_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(repo)
	router := h.Routes()

	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE, got %d: %s", rec.Code, rec.Body.String())
	}
}
