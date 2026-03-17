package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockProblemRepo implements store.ProblemRepository for testing.
type mockProblemRepo struct {
	listProblemsFn         func(ctx context.Context, classID *uuid.UUID) ([]store.Problem, error)
	listProblemsFilteredFn func(ctx context.Context, filters store.ProblemFilters) ([]store.Problem, error)
	getProblemFn           func(ctx context.Context, id uuid.UUID) (*store.Problem, error)
	createProblemFn        func(ctx context.Context, params store.CreateProblemParams) (*store.Problem, error)
	updateProblemFn        func(ctx context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error)
	deleteProblemFn        func(ctx context.Context, id uuid.UUID) error
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

func (m *mockProblemRepo) ListProblemsFiltered(ctx context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
	if m.listProblemsFilteredFn != nil {
		return m.listProblemsFilteredFn(ctx, filters)
	}
	return nil, nil
}

// problemTestRepos embeds stubRepos and overrides problem methods.
type problemTestRepos struct {
	stubRepos
	prob *mockProblemRepo
}

var _ store.Repos = (*problemTestRepos)(nil)

func (r *problemTestRepos) ListProblems(ctx context.Context, classID *uuid.UUID) ([]store.Problem, error) {
	return r.prob.ListProblems(ctx, classID)
}
func (r *problemTestRepos) ListProblemsFiltered(ctx context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
	return r.prob.ListProblemsFiltered(ctx, filters)
}
func (r *problemTestRepos) GetProblem(ctx context.Context, id uuid.UUID) (*store.Problem, error) {
	return r.prob.GetProblem(ctx, id)
}
func (r *problemTestRepos) CreateProblem(ctx context.Context, params store.CreateProblemParams) (*store.Problem, error) {
	return r.prob.CreateProblem(ctx, params)
}
func (r *problemTestRepos) UpdateProblem(ctx context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error) {
	return r.prob.UpdateProblem(ctx, id, params)
}
func (r *problemTestRepos) DeleteProblem(ctx context.Context, id uuid.UUID) error {
	return r.prob.DeleteProblem(ctx, id)
}

func problemRepos(repo *mockProblemRepo) *problemTestRepos {
	return &problemTestRepos{prob: repo}
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
		TestCases: json.RawMessage(`[{"input":"1 2","expected":"3"}]`),
		AuthorID:          uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		ClassID:           nil,
		CreatedAt:         time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:         time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func TestListProblems_Success(t *testing.T) {
	p := testProblem()
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			if filters.ClassID != nil {
				t.Fatalf("expected nil classID, got %v", filters.ClassID)
			}
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			if filters.ClassID == nil {
				t.Fatalf("expected classID, got nil")
			}
			if *filters.ClassID != classID {
				t.Fatalf("expected classID %v, got %v", classID, *filters.ClassID)
			}
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?class_id="+classID.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestListProblems_InvalidClassID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?class_id=not-a-uuid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListProblems_Empty(t *testing.T) {
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, _ store.ProblemFilters) ([]store.Problem, error) {
			return nil, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
		listProblemsFilteredFn: func(_ context.Context, _ store.ProblemFilters) ([]store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/"+p.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetProblem_InvalidID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
			if params.Language != "java" {
				t.Fatalf("unexpected language: %v", params.Language)
			}
			return p, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"title":       "Two Sum",
		"description": "Write a function that adds two numbers",
		"test_cases":  json.RawMessage(`[{"input":"1 2","expected":"3"}]`),
		"language":    "java",
	})
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          userID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateProblem_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
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
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	newLang := "java"
	p.Title = newTitle
	p.Language = newLang

	repo := &mockProblemRepo{
		updateProblemFn: func(_ context.Context, id uuid.UUID, params store.UpdateProblemParams) (*store.Problem, error) {
			if id != p.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Title == nil || *params.Title != newTitle {
				t.Fatalf("unexpected title: %v", params.Title)
			}
			if params.Language == nil || *params.Language != newLang {
				t.Fatalf("unexpected language: %v", params.Language)
			}
			return p, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"title":    newTitle,
		"language": newLang,
	})
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPatch, "/"+p.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", p.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+problemID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", problemID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteProblem_InvalidID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodDelete, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateProblem_MissingTitle(t *testing.T) {
	h := NewProblemHandler(nil)
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
	h := NewProblemHandler(nil)
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

	body, _ := json.Marshal(map[string]any{"title": "Two Sum", "language": "python"})
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateProblem_InvalidID(t *testing.T) {
	h := NewProblemHandler(nil)
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
	h := NewProblemHandler(nil)
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
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
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteProblem_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	router := h.Routes()

	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListProblems_FilteredByAuthor(t *testing.T) {
	authorID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	p := testProblem()

	var capturedFilters store.ProblemFilters
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			capturedFilters = filters
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?author_id="+authorID.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedFilters.AuthorID == nil || *capturedFilters.AuthorID != authorID {
		t.Fatalf("expected AuthorID %v, got %v", authorID, capturedFilters.AuthorID)
	}
}

func TestListProblems_FilteredByTags(t *testing.T) {
	p := testProblem()

	var capturedFilters store.ProblemFilters
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			capturedFilters = filters
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?tags=go,algorithms", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if len(capturedFilters.Tags) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(capturedFilters.Tags))
	}
	if capturedFilters.Tags[0] != "go" || capturedFilters.Tags[1] != "algorithms" {
		t.Errorf("expected tags [go, algorithms], got %v", capturedFilters.Tags)
	}
}

func TestListProblems_PublicOnly(t *testing.T) {
	p := testProblem()

	var capturedFilters store.ProblemFilters
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			capturedFilters = filters
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?public_only=true", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !capturedFilters.PublicOnly {
		t.Fatal("expected PublicOnly=true")
	}
}

func TestListProblems_InvalidAuthorID(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?author_id=not-a-uuid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListProblems_InvalidSortBy(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?sort_by=invalid_column", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListProblems_InvalidSortOrder(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?sort_order=invalid", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateProblem_InvalidLanguage(t *testing.T) {
	h := NewProblemHandler(nil)
	body, _ := json.Marshal(map[string]any{
		"title":    "Test Problem",
		"language": "ruby",
	})
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
		t.Fatalf("expected 422 for invalid language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateProblem_InvalidLanguage(t *testing.T) {
	id := uuid.New()
	h := NewProblemHandler(nil)
	lang := "ruby"
	body, _ := json.Marshal(map[string]any{
		"title":    "Test Problem",
		"language": lang,
	})
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for invalid language, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListProblems_FilteredSortBy(t *testing.T) {
	p := testProblem()

	var capturedFilters store.ProblemFilters
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			capturedFilters = filters
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/?sort_by=title&sort_order=desc", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedFilters.SortBy != "title" {
		t.Errorf("expected SortBy=title, got %q", capturedFilters.SortBy)
	}
	if capturedFilters.SortOrder != "desc" {
		t.Errorf("expected SortOrder=desc, got %q", capturedFilters.SortOrder)
	}
}

func TestExportProblems_Success(t *testing.T) {
	p1 := testProblem()
	p2 := testProblem()
	p2.ID = uuid.MustParse("22222222-3333-4444-5555-666666666666")
	p2.Title = "Three Sum"

	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			return []store.Problem{*p1, *p2}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/export", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Export(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify Content-Type and Content-Disposition headers
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
	cd := rec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "attachment") || !strings.Contains(cd, "problems-export-") {
		t.Errorf("expected Content-Disposition with attachment and filename, got %q", cd)
	}

	// Verify envelope structure
	var envelope map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode envelope: %v", err)
	}
	if _, ok := envelope["exported_at"]; !ok {
		t.Error("expected exported_at field in envelope")
	}

	// Verify problems array
	var problems []map[string]any
	if err := json.Unmarshal(envelope["problems"], &problems); err != nil {
		t.Fatalf("decode problems: %v", err)
	}
	if len(problems) != 2 {
		t.Fatalf("expected 2 problems, got %d", len(problems))
	}

	// Verify first problem has expected fields
	prob := problems[0]
	if prob["title"] != "Two Sum" {
		t.Errorf("expected title Two Sum, got %v", prob["title"])
	}
	// Verify internal fields are NOT present
	if _, ok := prob["id"]; ok {
		t.Error("expected id to be omitted from export")
	}
	if _, ok := prob["namespace_id"]; ok {
		t.Error("expected namespace_id to be omitted from export")
	}
	if _, ok := prob["author_id"]; ok {
		t.Error("expected author_id to be omitted from export")
	}
	if _, ok := prob["class_id"]; ok {
		t.Error("expected class_id to be omitted from export")
	}

	// Verify expected fields ARE present
	expectedFields := []string{"title", "description", "starter_code", "test_cases",
		"tags", "solution", "language", "created_at", "updated_at"}
	for _, field := range expectedFields {
		if _, ok := prob[field]; !ok {
			t.Errorf("expected field %q to be present", field)
		}
	}
}

func TestExportProblems_WithFilters(t *testing.T) {
	classID := uuid.MustParse("cccccccc-cccc-cccc-cccc-cccccccccccc")
	p := testProblem()

	var capturedFilters store.ProblemFilters
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, filters store.ProblemFilters) ([]store.Problem, error) {
			capturedFilters = filters
			return []store.Problem{*p}, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/export?class_id="+classID.String()+"&tags=go,algorithms", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Export(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify filters were passed through
	if capturedFilters.ClassID == nil || *capturedFilters.ClassID != classID {
		t.Errorf("expected ClassID filter %v, got %v", classID, capturedFilters.ClassID)
	}
	if len(capturedFilters.Tags) != 2 || capturedFilters.Tags[0] != "go" || capturedFilters.Tags[1] != "algorithms" {
		t.Errorf("expected tags [go, algorithms], got %v", capturedFilters.Tags)
	}
}

func TestExportProblems_EmptyResult(t *testing.T) {
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, _ store.ProblemFilters) ([]store.Problem, error) {
			return nil, nil
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/export", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Export(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var envelope map[string]json.RawMessage
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode envelope: %v", err)
	}

	// Verify problems is an empty array, not null
	var problems []map[string]any
	if err := json.Unmarshal(envelope["problems"], &problems); err != nil {
		t.Fatalf("decode problems: %v", err)
	}
	if problems == nil {
		t.Error("expected empty array, got nil")
	}
	if len(problems) != 0 {
		t.Errorf("expected 0 problems, got %d", len(problems))
	}
}

func TestExportProblems_StoreError(t *testing.T) {
	repo := &mockProblemRepo{
		listProblemsFilteredFn: func(_ context.Context, _ store.ProblemFilters) ([]store.Problem, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewProblemHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/export", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Export(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestExportProblems_RBACForbidden(t *testing.T) {
	repo := &mockProblemRepo{}
	h := NewProblemHandler(nil)
	router := h.Routes()

	req := httptest.NewRequest(http.MethodGet, "/export", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, problemRepos(repo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student GET /export, got %d: %s", rec.Code, rec.Body.String())
	}
}

// setupGenerateSolutionHandler creates an http.Handler for GenerateSolution tests.
func setupGenerateSolutionHandler(aiClient ai.Client) http.Handler {
	h := NewGenerateSolutionHandler(aiClient)
	r := chi.NewRouter()
	r.Post("/problems/generate-solution", h.GenerateSolution)
	return r
}

func TestGenerateSolution_Success(t *testing.T) {
	aiClient := &mockAIClient{
		generateSolutionFn: func(_ context.Context, req ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error) {
			if req.ProblemDescription != "Write a function that adds two numbers" {
				return nil, fmt.Errorf("unexpected description: %q", req.ProblemDescription)
			}
			if req.StarterCode != "def add(a, b):\n    pass" {
				return nil, fmt.Errorf("unexpected starter_code: %q", req.StarterCode)
			}
			return &ai.GenerateSolutionResponse{Solution: "def add(a, b):\n    return a + b"}, nil
		},
	}

	handler := setupGenerateSolutionHandler(aiClient)
	body, _ := json.Marshal(map[string]any{
		"description":  "Write a function that adds two numbers",
		"starter_code": "def add(a, b):\n    pass",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp["solution"] != "def add(a, b):\n    return a + b" {
		t.Errorf("expected solution %q, got %q", "def add(a, b):\n    return a + b", resp["solution"])
	}
}

func TestGenerateSolution_EmptyDescription_Returns422(t *testing.T) {
	aiClient := &mockAIClient{}

	handler := setupGenerateSolutionHandler(aiClient)
	body, _ := json.Marshal(map[string]any{
		"description": "",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGenerateSolution_AIError_Returns500(t *testing.T) {
	aiClient := &mockAIClient{
		generateSolutionFn: func(_ context.Context, _ ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error) {
			return nil, fmt.Errorf("ai: quota exceeded")
		},
	}

	handler := setupGenerateSolutionHandler(aiClient)
	body, _ := json.Marshal(map[string]any{
		"description": "Write a function that adds two numbers",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGenerateSolution_NoAuth_Returns401(t *testing.T) {
	aiClient := &mockAIClient{}

	// Use the RBAC-wired handler so the RequirePermission middleware returns 401
	// when no user is in context (mirroring production behaviour).
	handler := setupGenerateSolutionHandlerWithRBAC(aiClient)
	body, _ := json.Marshal(map[string]any{
		"description": "Write a function that adds two numbers",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGenerateSolution_StarterCodeOptional(t *testing.T) {
	var capturedReq ai.GenerateSolutionRequest
	aiClient := &mockAIClient{
		generateSolutionFn: func(_ context.Context, req ai.GenerateSolutionRequest) (*ai.GenerateSolutionResponse, error) {
			capturedReq = req
			return &ai.GenerateSolutionResponse{Solution: "def add(a, b):\n    return a + b"}, nil
		},
	}

	handler := setupGenerateSolutionHandler(aiClient)
	// Only description, no starter_code
	body, _ := json.Marshal(map[string]any{
		"description": "Write a function that adds two numbers",
	})
	req := httptest.NewRequest(http.MethodPost, "/problems/generate-solution", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedReq.StarterCode != "" {
		t.Errorf("expected empty starter_code, got %q", capturedReq.StarterCode)
	}
	if capturedReq.ProblemDescription != "Write a function that adds two numbers" {
		t.Errorf("expected description forwarded, got %q", capturedReq.ProblemDescription)
	}
}
