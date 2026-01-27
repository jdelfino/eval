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
	"github.com/jdelfino/eval/internal/store"
)

// mockSectionRepo implements store.SectionRepository for testing.
type mockSectionRepo struct {
	listSectionsByClassFn func(ctx context.Context, classID uuid.UUID) ([]store.Section, error)
	getSectionFn          func(ctx context.Context, id uuid.UUID) (*store.Section, error)
	createSectionFn       func(ctx context.Context, params store.CreateSectionParams) (*store.Section, error)
	updateSectionFn       func(ctx context.Context, id uuid.UUID, params store.UpdateSectionParams) (*store.Section, error)
	deleteSectionFn       func(ctx context.Context, id uuid.UUID) error
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

func testSection() *store.Section {
	semester := "Fall 2025"
	return &store.Section{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID: "test-ns",
		ClassID:     uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		Name:        "Section A",
		Semester:    &semester,
		JoinCode:    "ABC-123-XYZ",
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

	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", sec.ClassID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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
	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("classID", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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

	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodGet, "/"+sec.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sec.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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
	h := NewSectionHandler(repo)
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

func TestGetSection_InvalidID(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodPatch, "/"+sec.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sec.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
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
	h := NewSectionHandler(repo)
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

	h := NewSectionHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/"+sectionID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sectionID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
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
	h := NewSectionHandler(repo)
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

func TestDeleteSection_InvalidID(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler(repo)
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

func TestDeleteSection_RBACForbidden(t *testing.T) {
	repo := &mockSectionRepo{}
	h := NewSectionHandler(repo)
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

func TestCreateSection_MissingName(t *testing.T) {
	classID := uuid.New()
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(&mockSectionRepo{})
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
	h := NewSectionHandler(repo)
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

func TestGetSection_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewSectionHandler(repo)
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

func TestDeleteSection_InternalError(t *testing.T) {
	repo := &mockSectionRepo{
		deleteSectionFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(repo)
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
	h := NewSectionHandler(repo)
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
	pattern := regexp.MustCompile(`^[A-Z]{3}-[0-9]{3}-[A-Z]{3}$`)
	if !pattern.MatchString(code) {
		t.Errorf("join code %q does not match expected format ABC-123-XYZ", code)
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
	// With 26^6 * 10^3 possible codes, 100 should all be unique
	if len(codes) < 90 {
		t.Errorf("expected mostly unique codes, got only %d unique out of 100", len(codes))
	}
}
