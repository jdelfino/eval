package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
)

// mockSectionRepo implements store.SectionRepository for testing.
type mockSectionRepo struct {
	listSectionsByClassFn    func(ctx context.Context, classID uuid.UUID) ([]store.Section, error)
	getSectionFn             func(ctx context.Context, id uuid.UUID) (*store.Section, error)
	createSectionFn          func(ctx context.Context, params store.CreateSectionParams) (*store.Section, error)
	updateSectionFn          func(ctx context.Context, id uuid.UUID, params store.UpdateSectionParams) (*store.Section, error)
	deleteSectionFn          func(ctx context.Context, id uuid.UUID) error
	listMySectionsFn         func(ctx context.Context, userID uuid.UUID) ([]store.MySectionInfo, error)
	updateSectionJoinCodeFn  func(ctx context.Context, id uuid.UUID, joinCode string) (*store.Section, error)
}

func (m *mockSectionRepo) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]store.Section, error) {
	return m.listSectionsByClassFn(ctx, classID)
}

func (m *mockSectionRepo) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	return m.getSectionFn(ctx, id)
}

func (m *mockSectionRepo) CreateSection(ctx context.Context, params store.CreateSectionParams) (*store.Section, error) {
	return m.createSectionFn(ctx, params)
}

func (m *mockSectionRepo) UpdateSection(ctx context.Context, id uuid.UUID, params store.UpdateSectionParams) (*store.Section, error) {
	return m.updateSectionFn(ctx, id, params)
}

func (m *mockSectionRepo) DeleteSection(ctx context.Context, id uuid.UUID) error {
	return m.deleteSectionFn(ctx, id)
}

func (m *mockSectionRepo) ListMySections(ctx context.Context, userID uuid.UUID) ([]store.MySectionInfo, error) {
	if m.listMySectionsFn != nil {
		return m.listMySectionsFn(ctx, userID)
	}
	return nil, nil
}

func (m *mockSectionRepo) UpdateSectionJoinCode(ctx context.Context, id uuid.UUID, joinCode string) (*store.Section, error) {
	if m.updateSectionJoinCodeFn != nil {
		return m.updateSectionJoinCodeFn(ctx, id, joinCode)
	}
	return nil, nil
}

func testSection() *store.Section {
	semester := "Fall 2025"
	return &store.Section{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID: "test-ns",
		ClassID:     uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		Name:        "Section A",
		Semester:    &semester,
		JoinCode:    "ABC-123",
		Active:      true,
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func TestListSectionsByClass_Success(t *testing.T) {
	sec := testSection()
	repo := &mockSectionRepo{
		listSectionsByClassFn: func(_ context.Context, classID uuid.UUID) ([]store.Section, error) {
			if classID != sec.ClassID {
				t.Fatalf("unexpected classID: %v", classID)
			}
			return []store.Section{*sec}, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", sec.ClassID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListByClass(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Section
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 section, got %d", len(got))
	}
	if got[0].ID != sec.ID {
		t.Errorf("expected id %q, got %q", sec.ID, got[0].ID)
	}
}

func TestListSectionsByClass_Empty(t *testing.T) {
	classID := uuid.New()
	repo := &mockSectionRepo{
		listSectionsByClassFn: func(_ context.Context, _ uuid.UUID) ([]store.Section, error) {
			return nil, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListByClass(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

func TestListSectionsByClass_InvalidClassID(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListByClass(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestListSectionsByClass_InternalError(t *testing.T) {
	classID := uuid.New()
	repo := &mockSectionRepo{
		listSectionsByClassFn: func(_ context.Context, _ uuid.UUID) ([]store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListByClass(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetSection_Success(t *testing.T) {
	sec := testSection()
	repo := &mockSectionRepo{
		getSectionFn: func(_ context.Context, id uuid.UUID) (*store.Section, error) {
			if id != sec.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return sec, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+sec.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sec.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.Section
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != sec.ID {
		t.Errorf("expected id %q, got %q", sec.ID, got.ID)
	}
}

func TestGetSection_NotFound(t *testing.T) {
	repo := &mockSectionRepo{
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetSection_InvalidID(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateSection_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	classID := uuid.MustParse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff")
	sec := testSection()

	repo := &mockSectionRepo{
		createSectionFn: func(_ context.Context, params store.CreateSectionParams) (*store.Section, error) {
			if params.Name != "Section A" {
				t.Fatalf("unexpected name: %v", params.Name)
			}
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			if params.ClassID != classID {
				t.Fatalf("unexpected class_id: %v", params.ClassID)
			}
			if params.JoinCode == "" {
				t.Fatal("expected non-empty join code")
			}
			return sec, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"name":     "Section A",
		"semester": "Fall 2025",
	})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
		ID:          userID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Section
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != sec.ID {
		t.Errorf("expected id %q, got %q", sec.ID, got.ID)
	}
}

func TestCreateSection_Unauthorized(t *testing.T) {
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateSection_InvalidClassID(t *testing.T) {
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor, NamespaceID: "test-ns"})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateSection_RBACForbidden(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler()
	router := h.ClassRoutes()

	body, _ := json.Marshal(map[string]any{
		"name": "Section A",
	})

	// We need to wrap in a parent route that sets classID
	parent := chi.NewRouter()
	parent.Route("/classes/{classID}/sections", func(r chi.Router) {
		r.Mount("/", router)
	})

	req := httptest.NewRequest(http.MethodPost, "/classes/"+uuid.New().String()+"/sections/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	parent.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateSection_Success(t *testing.T) {
	sec := testSection()
	newName := "Section B"
	sec.Name = newName

	repo := &mockSectionRepo{
		updateSectionFn: func(_ context.Context, id uuid.UUID, params store.UpdateSectionParams) (*store.Section, error) {
			if id != sec.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Name == nil || *params.Name != newName {
				t.Fatalf("unexpected name: %v", params.Name)
			}
			return sec, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"name": newName,
	})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+sec.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sec.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Section
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != newName {
		t.Errorf("expected name %q, got %q", newName, got.Name)
	}
}

func TestUpdateSection_NotFound(t *testing.T) {
	repo := &mockSectionRepo{
		updateSectionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSectionParams) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteSection_Success(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockSectionRepo{
		deleteSectionFn: func(_ context.Context, id uuid.UUID) error {
			if id != sectionID {
				t.Fatalf("unexpected id: %v", id)
			}
			return nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+sectionID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestDeleteSection_NotFound(t *testing.T) {
	repo := &mockSectionRepo{
		deleteSectionFn: func(_ context.Context, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteSection_InvalidID(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestDeleteSection_RBACForbidden(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler()
	router := h.Routes()

	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateSection_MissingName(t *testing.T) {
	classID := uuid.New()
	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"semester": "Fall 2025"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
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

func TestCreateSection_InvalidBody(t *testing.T) {
	classID := uuid.New()
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
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

func TestUpdateSection_InvalidID(t *testing.T) {
	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
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

func TestUpdateSection_InvalidBody(t *testing.T) {
	id := uuid.New()
	h := NewSectionHandler()
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

func TestUpdateSection_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		updateSectionFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateSectionParams) (*store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetSection_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteSection_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		deleteSectionFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestCreateSection_JoinCodeRetrySuccess(t *testing.T) {
	classID := uuid.MustParse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff")
	sec := testSection()
	callCount := 0

	repo := &mockSectionRepo{
		createSectionFn: func(_ context.Context, params store.CreateSectionParams) (*store.Section, error) {
			callCount++
			if callCount == 1 {
				return nil, &pgconn.PgError{Code: "23505", ConstraintName: "sections_join_code_key"}
			}
			return sec, nil
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Section A"})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if callCount != 2 {
		t.Fatalf("expected 2 calls to CreateSection, got %d", callCount)
	}
}

func TestCreateSection_JoinCodeRetryExhausted(t *testing.T) {
	classID := uuid.MustParse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff")
	callCount := 0

	repo := &mockSectionRepo{
		createSectionFn: func(_ context.Context, _ store.CreateSectionParams) (*store.Section, error) {
			callCount++
			return nil, &pgconn.PgError{Code: "23505", ConstraintName: "sections_join_code_key"}
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Section A"})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if callCount != 3 {
		t.Fatalf("expected 3 calls to CreateSection, got %d", callCount)
	}
}

func TestCreateSection_OtherUniqueViolationNoRetry(t *testing.T) {
	classID := uuid.MustParse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff")
	callCount := 0

	repo := &mockSectionRepo{
		createSectionFn: func(_ context.Context, _ store.CreateSectionParams) (*store.Section, error) {
			callCount++
			return nil, &pgconn.PgError{Code: "23505", ConstraintName: "sections_pkey"}
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "Section A"})
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if callCount != 1 {
		t.Fatalf("expected 1 call to CreateSection (no retry), got %d", callCount)
	}
}

func TestGenerateJoinCode_Format(t *testing.T) {
	code, err := generateJoinCode()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pattern := regexp.MustCompile(`^[A-Z]{3}-[0-9]{3}$`)
	if !pattern.MatchString(code) {
		t.Errorf("join code %q does not match expected format ABC-123", code)
	}
}

func TestGenerateJoinCode_Unique(t *testing.T) {
	codes := make(map[string]bool)
	for i := 0; i < 100; i++ {
		code, err := generateJoinCode()
		if err != nil {
			t.Fatalf("unexpected error on iteration %d: %v", i, err)
		}
		codes[code] = true
	}
	// With 26^3 * 10^3 possible codes, 100 should all be unique
	if len(codes) < 90 {
		t.Errorf("expected mostly unique codes, got only %d unique out of 100", len(codes))
	}
}

// sectionTestUserRepo implements store.UserRepository for section handler tests.
type sectionTestUserRepo struct {
	getUserByEmailFn func(ctx context.Context, email string) (*store.User, error)
}

func (m *sectionTestUserRepo) GetUserByID(_ context.Context, _ uuid.UUID) (*store.User, error) {
	return nil, store.ErrNotFound
}
func (m *sectionTestUserRepo) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return nil, store.ErrNotFound
}
func (m *sectionTestUserRepo) GetUserByEmail(ctx context.Context, email string) (*store.User, error) {
	if m.getUserByEmailFn != nil {
		return m.getUserByEmailFn(ctx, email)
	}
	return nil, store.ErrNotFound
}
func (m *sectionTestUserRepo) UpdateUser(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
	return nil, store.ErrNotFound
}
func (m *sectionTestUserRepo) ListUsers(_ context.Context, _ store.UserFilters) ([]store.User, error) {
	return nil, nil
}
func (m *sectionTestUserRepo) UpdateUserAdmin(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
	return nil, store.ErrNotFound
}
func (m *sectionTestUserRepo) DeleteUser(_ context.Context, _ uuid.UUID) error {
	return store.ErrNotFound
}
func (m *sectionTestUserRepo) CountUsersByRole(_ context.Context, _ string) (map[string]int, error) {
	return nil, nil
}
func (m *sectionTestUserRepo) CreateUser(_ context.Context, _ store.CreateUserParams) (*store.User, error) {
	return nil, nil
}

// sectionTestRepos embeds stubRepos and overrides section-related methods.
type sectionTestRepos struct {
	stubRepos
	sec   *mockSectionRepo
	sess  *mockSessionRepo
	memb  *mockMembershipRepo
	users *sectionTestUserRepo
}

var _ store.Repos = (*sectionTestRepos)(nil)

func (r *sectionTestRepos) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]store.Section, error) {
	return r.sec.ListSectionsByClass(ctx, classID)
}
func (r *sectionTestRepos) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	return r.sec.GetSection(ctx, id)
}
func (r *sectionTestRepos) CreateSection(ctx context.Context, params store.CreateSectionParams) (*store.Section, error) {
	return r.sec.CreateSection(ctx, params)
}
func (r *sectionTestRepos) UpdateSection(ctx context.Context, id uuid.UUID, params store.UpdateSectionParams) (*store.Section, error) {
	return r.sec.UpdateSection(ctx, id, params)
}
func (r *sectionTestRepos) DeleteSection(ctx context.Context, id uuid.UUID) error {
	return r.sec.DeleteSection(ctx, id)
}
func (r *sectionTestRepos) ListMySections(ctx context.Context, userID uuid.UUID) ([]store.MySectionInfo, error) {
	return r.sec.ListMySections(ctx, userID)
}
func (r *sectionTestRepos) UpdateSectionJoinCode(ctx context.Context, id uuid.UUID, joinCode string) (*store.Section, error) {
	return r.sec.UpdateSectionJoinCode(ctx, id, joinCode)
}
func (r *sectionTestRepos) ListSessions(ctx context.Context, filters store.SessionFilters) ([]store.Session, error) {
	return r.sess.ListSessions(ctx, filters)
}
func (r *sectionTestRepos) ListMembersByRole(ctx context.Context, sectionID uuid.UUID, role string) ([]store.SectionMembership, error) {
	return r.memb.ListMembersByRole(ctx, sectionID, role)
}
func (r *sectionTestRepos) CreateMembership(ctx context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
	return r.memb.CreateMembership(ctx, params)
}
func (r *sectionTestRepos) DeleteMembershipIfNotLast(ctx context.Context, sectionID, userID uuid.UUID, role string) error {
	return r.memb.DeleteMembershipIfNotLast(ctx, sectionID, userID, role)
}
func (r *sectionTestRepos) GetUserByEmail(ctx context.Context, email string) (*store.User, error) {
	return r.users.GetUserByEmail(ctx, email)
}

func secRepos(sec *mockSectionRepo, sess *mockSessionRepo, memb *mockMembershipRepo, users *sectionTestUserRepo) *sectionTestRepos {
	return &sectionTestRepos{sec: sec, sess: sess, memb: memb, users: users}
}

// --- MySections tests ---

func TestMySections_Success(t *testing.T) {
	userID := uuid.New()
	sec := testSection()
	repo := &mockSectionRepo{
		listMySectionsFn: func(_ context.Context, uid uuid.UUID) ([]store.MySectionInfo, error) {
			if uid != userID {
				t.Fatalf("unexpected userID: %v", uid)
			}
			return []store.MySectionInfo{
				{Section: *sec, ClassName: "CS101"},
			}, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/my", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: userID, Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.MySections(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.MySectionInfo
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 section, got %d", len(got))
	}
	if got[0].ClassName != "CS101" {
		t.Errorf("expected class_name CS101, got %q", got[0].ClassName)
	}
}

func TestMySections_Unauthorized(t *testing.T) {
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/my", nil)
	rec := httptest.NewRecorder()

	h.MySections(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMySections_Empty(t *testing.T) {
	repo := &mockSectionRepo{
		listMySectionsFn: func(_ context.Context, _ uuid.UUID) ([]store.MySectionInfo, error) {
			return nil, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/my", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.MySections(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

// --- ListSessions tests ---

func TestSectionListSessions_Success(t *testing.T) {
	sectionID := uuid.New()
	sess := testSession()
	sessRepo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, filters store.SessionFilters) ([]store.Session, error) {
			if filters.SectionID == nil || *filters.SectionID != sectionID {
				t.Fatalf("unexpected section filter: %v", filters.SectionID)
			}
			return []store.Session{*sess}, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, sessRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListSessions(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 session, got %d", len(got))
	}
}

func TestSectionListSessions_InvalidID(t *testing.T) {
	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListSessions(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

// --- RegenerateCode tests ---

func TestRegenerateCode_Success(t *testing.T) {
	sec := testSection()
	repo := &mockSectionRepo{
		updateSectionJoinCodeFn: func(_ context.Context, id uuid.UUID, code string) (*store.Section, error) {
			if id != sec.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if code == "" {
				t.Fatal("expected non-empty join code")
			}
			updated := *sec
			updated.JoinCode = code
			return &updated, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sec.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RegenerateCode(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Section
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.JoinCode == "" {
		t.Error("expected non-empty join code in response")
	}
}

func TestRegenerateCode_NotFound(t *testing.T) {
	repo := &mockSectionRepo{
		updateSectionJoinCodeFn: func(_ context.Context, _ uuid.UUID, _ string) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RegenerateCode(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- ListInstructors tests ---

func TestListInstructors_Success(t *testing.T) {
	sectionID := uuid.New()
	instrID := uuid.New()

	membRepo := &mockMembershipRepo{
		listMembersByRoleFn: func(_ context.Context, sid uuid.UUID, role string) ([]store.SectionMembership, error) {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: %v", sid)
			}
			if role != "instructor" {
				t.Fatalf("unexpected role: %v", role)
			}
			return []store.SectionMembership{
				{ID: uuid.New(), UserID: instrID, SectionID: sectionID, Role: "instructor", JoinedAt: time.Now()},
			}, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListInstructors(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.SectionMembership
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 instructor, got %d", len(got))
	}
	if got[0].UserID != instrID {
		t.Errorf("expected instructor user ID %v, got %v", instrID, got[0].UserID)
	}
}

func TestListInstructors_Empty(t *testing.T) {
	sectionID := uuid.New()
	membRepo := &mockMembershipRepo{
		listMembersByRoleFn: func(_ context.Context, _ uuid.UUID, _ string) ([]store.SectionMembership, error) {
			return nil, nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListInstructors(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	body := rec.Body.String()
	if body != "[]\n" {
		t.Errorf("expected empty array, got %q", body)
	}
}

// --- AddInstructor tests ---

func TestAddInstructor_Success(t *testing.T) {
	sectionID := uuid.New()
	instrUser := &store.User{
		ID:    uuid.New(),
		Email: "prof@example.com",
		Role:  string(auth.RoleInstructor),
	}
	membership := &store.SectionMembership{
		ID:        uuid.New(),
		UserID:    instrUser.ID,
		SectionID: sectionID,
		Role:      "instructor",
		JoinedAt:  time.Now(),
	}

	userRepo := &sectionTestUserRepo{
		getUserByEmailFn: func(_ context.Context, email string) (*store.User, error) {
			if email != "prof@example.com" {
				t.Fatalf("unexpected email: %v", email)
			}
			return instrUser, nil
		},
	}
	membRepo := &mockMembershipRepo{
		createMembershipFn: func(_ context.Context, params store.CreateMembershipParams) (*store.SectionMembership, error) {
			if params.UserID != instrUser.ID {
				t.Fatalf("unexpected userID: %v", params.UserID)
			}
			if params.SectionID != sectionID {
				t.Fatalf("unexpected sectionID: %v", params.SectionID)
			}
			return membership, nil
		},
	}

	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"email": "prof@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, userRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.AddInstructor(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.SectionMembership
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.UserID != instrUser.ID {
		t.Errorf("expected userID %v, got %v", instrUser.ID, got.UserID)
	}
}

func TestAddInstructor_UserNotFound(t *testing.T) {
	userRepo := &sectionTestUserRepo{
		getUserByEmailFn: func(_ context.Context, _ string) (*store.User, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"email": "nobody@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, nil, userRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.AddInstructor(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAddInstructor_NotInstructorRole(t *testing.T) {
	userRepo := &sectionTestUserRepo{
		getUserByEmailFn: func(_ context.Context, _ string) (*store.User, error) {
			return &store.User{
				ID:    uuid.New(),
				Email: "student@example.com",
				Role:  string(auth.RoleStudent),
			}, nil
		},
	}

	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"email": "student@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, nil, userRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.AddInstructor(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["error"] != "user is not an instructor" {
		t.Errorf("expected 'user is not an instructor', got %q", resp["error"])
	}
}

func TestAddInstructor_AlreadyExists(t *testing.T) {
	instrUser := &store.User{
		ID:    uuid.New(),
		Email: "prof@example.com",
		Role:  string(auth.RoleInstructor),
	}
	userRepo := &sectionTestUserRepo{
		getUserByEmailFn: func(_ context.Context, _ string) (*store.User, error) {
			return instrUser, nil
		},
	}
	membRepo := &mockMembershipRepo{
		createMembershipFn: func(_ context.Context, _ store.CreateMembershipParams) (*store.SectionMembership, error) {
			return nil, store.ErrDuplicate
		},
	}

	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"email": "prof@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, userRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.AddInstructor(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- RemoveInstructor tests ---

func TestRemoveInstructor_Success(t *testing.T) {
	sectionID := uuid.New()
	userToRemove := uuid.New()

	membRepo := &mockMembershipRepo{
		deleteMembershipIfNotLastFn: func(_ context.Context, sid, uid uuid.UUID, role string) error {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: %v", sid)
			}
			if uid != userToRemove {
				t.Fatalf("unexpected userID: %v", uid)
			}
			if role != "instructor" {
				t.Fatalf("unexpected role: %v", role)
			}
			return nil
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", userToRemove.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RemoveInstructor(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRemoveInstructor_LastInstructor(t *testing.T) {
	sectionID := uuid.New()
	userToRemove := uuid.New()

	membRepo := &mockMembershipRepo{
		deleteMembershipIfNotLastFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) error {
			return store.ErrLastMember
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", userToRemove.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RemoveInstructor(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["error"] != "cannot remove the last instructor" {
		t.Errorf("expected 'cannot remove the last instructor', got %q", resp["error"])
	}
}

func TestRemoveInstructor_NotFound(t *testing.T) {
	sectionID := uuid.New()
	userToRemove := uuid.New()

	membRepo := &mockMembershipRepo{
		deleteMembershipIfNotLastFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) error {
			return store.ErrNotFound
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", userToRemove.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RemoveInstructor(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestMySections_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		listMySectionsFn: func(_ context.Context, _ uuid.UUID) ([]store.MySectionInfo, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/my", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.MySections(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSectionListSessions_InternalError(t *testing.T) {
	sectionID := uuid.New()
	sessRepo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, _ store.SessionFilters) ([]store.Session, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, sessRepo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListSessions(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRegenerateCode_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		updateSectionJoinCodeFn: func(_ context.Context, _ uuid.UUID, _ string) (*store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(repo, nil, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RegenerateCode(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAddInstructor_InternalError(t *testing.T) {
	instrUser := &store.User{
		ID:    uuid.New(),
		Email: "prof@example.com",
		Role:  string(auth.RoleInstructor),
	}
	userRepo := &sectionTestUserRepo{
		getUserByEmailFn: func(_ context.Context, _ string) (*store.User, error) {
			return instrUser, nil
		},
	}
	membRepo := &mockMembershipRepo{
		createMembershipFn: func(_ context.Context, _ store.CreateMembershipParams) (*store.SectionMembership, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	body, _ := json.Marshal(map[string]any{"email": "prof@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, userRepo))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.AddInstructor(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestRemoveInstructor_NotMemberButOtherInstructorExists verifies that removing
// a user who is NOT an instructor of the section returns 404 (not 400) even when
// other instructors exist. This is the edge case for PLAT-59r: the store must
// distinguish "target is the last instructor" from "target is not a member at all".
func TestRemoveInstructor_NotMemberButOtherInstructorExists(t *testing.T) {
	sectionID := uuid.New()
	nonMemberUser := uuid.New()

	membRepo := &mockMembershipRepo{
		deleteMembershipIfNotLastFn: func(_ context.Context, sid, uid uuid.UUID, role string) error {
			if sid != sectionID {
				t.Fatalf("unexpected sectionID: %v", sid)
			}
			if uid != nonMemberUser {
				t.Fatalf("unexpected userID: %v", uid)
			}
			if role != "instructor" {
				t.Fatalf("unexpected role: %v", role)
			}
			// The store should return ErrNotFound when the target is not a member,
			// even if there is only one instructor (who is someone else).
			return store.ErrNotFound
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", nonMemberUser.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RemoveInstructor(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when target is not a member, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRemoveInstructor_InternalError(t *testing.T) {
	sectionID := uuid.New()
	userToRemove := uuid.New()

	membRepo := &mockMembershipRepo{
		deleteMembershipIfNotLastFn: func(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ string) error {
			return errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	rctx.URLParams.Add("userID", userToRemove.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.RemoveInstructor(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListInstructors_InternalError(t *testing.T) {
	sectionID := uuid.New()
	membRepo := &mockMembershipRepo{
		listMembersByRoleFn: func(_ context.Context, _ uuid.UUID, _ string) ([]store.SectionMembership, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewSectionHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = store.WithRepos(ctx, secRepos(&mockSectionRepo{}, nil, membRepo, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.ListInstructors(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- RBAC Forbidden tests (middleware-level, mimicking server.go routing) ---

// buildSectionRouterMatchingServerLayout creates a router matching the server.go
// layout: ListSessions is outside the permission group (students need it to
// discover active sessions; RLS enforces visibility), while instructor-only
// endpoints are inside RequirePermission.
func buildSectionRouterMatchingServerLayout(h *SectionHandler) chi.Router {
	r := chi.NewRouter()
	// Students need to list sessions (RLS enforces visibility)
	r.Get("/sections/{id}/sessions", h.ListSessions)
	// Instructor+ endpoints
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequirePermission(auth.PermContentManage))
		r.Post("/sections/{id}/regenerate-code", h.RegenerateCode)
		r.Get("/sections/{id}/instructors", h.ListInstructors)
		r.Post("/sections/{id}/instructors", h.AddInstructor)
		r.Delete("/sections/{id}/instructors/{userID}", h.RemoveInstructor)
	})
	return r
}

func TestSectionListSessions_StudentAllowed(t *testing.T) {
	// Regression test: students must be able to list sessions to discover active
	// ones. The route lives outside RequirePermission; RLS enforces visibility.
	sectionID := uuid.New()
	sess := testSession()
	repo := &mockSessionRepo{
		listSessionsFn: func(_ context.Context, filters store.SessionFilters) ([]store.Session, error) {
			if filters.SectionID == nil || *filters.SectionID != sectionID {
				t.Fatalf("expected section_id %v, got %v", sectionID, filters.SectionID)
			}
			return []store.Session{*sess}, nil
		},
	}

	h := NewSectionHandler()
	router := buildSectionRouterMatchingServerLayout(h)

	req := httptest.NewRequest(http.MethodGet, "/sections/"+sectionID.String()+"/sessions", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = store.WithRepos(ctx, secRepos(nil, repo, nil, nil))
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for student GET sessions, got %d: %s", rec.Code, rec.Body.String())
	}

	var got []store.Session
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 session, got %d", len(got))
	}
}

func TestRegenerateCode_RBACForbidden(t *testing.T) {
	h := NewSectionHandler()
	router := buildSectionRouterMatchingServerLayout(h)

	req := httptest.NewRequest(http.MethodPost, "/sections/"+uuid.New().String()+"/regenerate-code", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST regenerate-code, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListInstructors_RBACForbidden(t *testing.T) {
	h := NewSectionHandler()
	router := buildSectionRouterMatchingServerLayout(h)

	req := httptest.NewRequest(http.MethodGet, "/sections/"+uuid.New().String()+"/instructors", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student GET instructors, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAddInstructor_RBACForbidden(t *testing.T) {
	h := NewSectionHandler()
	router := buildSectionRouterMatchingServerLayout(h)

	body, _ := json.Marshal(map[string]any{"email": "prof@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/sections/"+uuid.New().String()+"/instructors", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST instructors, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRemoveInstructor_RBACForbidden(t *testing.T) {
	h := NewSectionHandler()
	router := buildSectionRouterMatchingServerLayout(h)

	req := httptest.NewRequest(http.MethodDelete, "/sections/"+uuid.New().String()+"/instructors/"+uuid.New().String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE instructor, got %d: %s", rec.Code, rec.Body.String())
	}
}
