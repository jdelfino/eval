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

// classesTestRepos embeds stubRepos and delegates to mock function fields.
type classesTestRepos struct {
	stubRepos
	listClassesFn              func(ctx context.Context) ([]store.Class, error)
	getClassFn                 func(ctx context.Context, id uuid.UUID) (*store.Class, error)
	createClassFn              func(ctx context.Context, params store.CreateClassParams) (*store.Class, error)
	updateClassFn              func(ctx context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error)
	deleteClassFn              func(ctx context.Context, id uuid.UUID) error
	listClassInstructorNamesFn      func(ctx context.Context, classID uuid.UUID) (map[string]string, error)
	listClassSectionInstructorsFn   func(ctx context.Context, classID uuid.UUID) (map[string][]string, error)
	listSectionsByClassFn           func(ctx context.Context, classID uuid.UUID) ([]store.Section, error)
}

var _ store.Repos = (*classesTestRepos)(nil)

func (m *classesTestRepos) ListClasses(ctx context.Context) ([]store.Class, error) {
	return m.listClassesFn(ctx)
}

func (m *classesTestRepos) GetClass(ctx context.Context, id uuid.UUID) (*store.Class, error) {
	return m.getClassFn(ctx, id)
}

func (m *classesTestRepos) CreateClass(ctx context.Context, params store.CreateClassParams) (*store.Class, error) {
	return m.createClassFn(ctx, params)
}

func (m *classesTestRepos) UpdateClass(ctx context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error) {
	return m.updateClassFn(ctx, id, params)
}

func (m *classesTestRepos) DeleteClass(ctx context.Context, id uuid.UUID) error {
	return m.deleteClassFn(ctx, id)
}

func (m *classesTestRepos) ListClassInstructorNames(ctx context.Context, classID uuid.UUID) (map[string]string, error) {
	if m.listClassInstructorNamesFn != nil {
		return m.listClassInstructorNamesFn(ctx, classID)
	}
	return nil, nil
}

func (m *classesTestRepos) ListClassSectionInstructors(ctx context.Context, classID uuid.UUID) (map[string][]string, error) {
	if m.listClassSectionInstructorsFn != nil {
		return m.listClassSectionInstructorsFn(ctx, classID)
	}
	return nil, nil
}

func (m *classesTestRepos) ListSectionsByClass(ctx context.Context, classID uuid.UUID) ([]store.Section, error) {
	if m.listSectionsByClassFn != nil {
		return m.listSectionsByClassFn(ctx, classID)
	}
	return nil, nil
}

func testClass() *store.Class {
	desc := "Intro to CS"
	return &store.Class{
		ID:          uuid.MustParse("11111111-2222-3333-4444-555555555555"),
		NamespaceID: "test-ns",
		Name:        "CS 101",
		Description: &desc,
		CreatedBy:   uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
		CreatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

// withClassRepos injects classesTestRepos into the request context.
func withClassRepos(ctx context.Context, r *classesTestRepos) context.Context {
	return store.WithRepos(ctx, r)
}

func TestListClasses_Success(t *testing.T) {
	c := testClass()
	repos := &classesTestRepos{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return []store.Class{*c}, nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got []store.Class
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 class, got %d", len(got))
	}
	if got[0].ID != c.ID {
		t.Errorf("expected id %q, got %q", c.ID, got[0].ID)
	}
}

func TestListClasses_Empty(t *testing.T) {
	repos := &classesTestRepos{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return nil, nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
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

func TestListClasses_InternalError(t *testing.T) {
	repos := &classesTestRepos{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetClass_Success(t *testing.T) {
	c := testClass()
	repos := &classesTestRepos{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != c.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return c, nil
		},
		listSectionsByClassFn: func(_ context.Context, _ uuid.UUID) ([]store.Section, error) {
			return nil, nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+c.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", c.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got classDetailResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Class == nil {
		t.Fatal("expected class, got nil")
	}
	if got.Class.ID != c.ID {
		t.Errorf("expected id %q, got %q", c.ID, got.Class.ID)
	}
}

func TestGetClass_NotFound(t *testing.T) {
	repos := &classesTestRepos{
		getClassFn: func(_ context.Context, _ uuid.UUID) (*store.Class, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetClass_InvalidID(t *testing.T) {
	repos := &classesTestRepos{}
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateClass_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	c := testClass()

	repos := &classesTestRepos{
		createClassFn: func(_ context.Context, params store.CreateClassParams) (*store.Class, error) {
			if params.Name != "CS 101" {
				t.Fatalf("unexpected name: %v", params.Name)
			}
			if params.NamespaceID != "test-ns" {
				t.Fatalf("unexpected namespace_id: %v", params.NamespaceID)
			}
			if params.CreatedBy != userID {
				t.Fatalf("unexpected created_by: %v", params.CreatedBy)
			}
			return c, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"name":        "CS 101",
		"description": "Intro to CS",
	})
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          userID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Class
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != c.ID {
		t.Errorf("expected id %q, got %q", c.ID, got.ID)
	}
}

func TestCreateClass_Unauthorized(t *testing.T) {
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	ctx := withClassRepos(req.Context(), &classesTestRepos{})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateClass_RBACForbidden(t *testing.T) {
	repos := &classesTestRepos{}
	h := NewClassHandler()
	router := h.Routes()

	body, _ := json.Marshal(map[string]any{
		"name": "CS 101",
	})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student POST, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateClass_Success(t *testing.T) {
	c := testClass()
	newName := "CS 201"
	c.Name = newName

	repos := &classesTestRepos{
		updateClassFn: func(_ context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error) {
			if id != c.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			if params.Name == nil || *params.Name != newName {
				t.Fatalf("unexpected name: %v", params.Name)
			}
			return c, nil
		},
	}

	body, _ := json.Marshal(map[string]any{
		"name": newName,
	})
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+c.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", c.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got store.Class
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Name != newName {
		t.Errorf("expected name %q, got %q", newName, got.Name)
	}
}

func TestUpdateClass_NotFound(t *testing.T) {
	repos := &classesTestRepos{
		updateClassFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateClassParams) (*store.Class, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteClass_Success(t *testing.T) {
	classID := uuid.New()
	repos := &classesTestRepos{
		deleteClassFn: func(_ context.Context, id uuid.UUID) error {
			if id != classID {
				t.Fatalf("unexpected id: %v", id)
			}
			return nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+classID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestDeleteClass_NotFound(t *testing.T) {
	repos := &classesTestRepos{
		deleteClassFn: func(_ context.Context, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteClass_InvalidID(t *testing.T) {
	repos := &classesTestRepos{}
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodDelete, "/not-a-uuid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestCreateClass_MissingName(t *testing.T) {
	h := NewClassHandler()
	body, _ := json.Marshal(map[string]any{"description": "no name"})
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = withClassRepos(ctx, &classesTestRepos{})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateClass_InvalidBody(t *testing.T) {
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = withClassRepos(ctx, &classesTestRepos{})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateClass_InternalError(t *testing.T) {
	repos := &classesTestRepos{
		createClassFn: func(_ context.Context, _ store.CreateClassParams) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "CS 101"})
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateClass_InvalidID(t *testing.T) {
	repos := &classesTestRepos{}
	h := NewClassHandler()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	req := httptest.NewRequest(http.MethodPatch, "/not-a-uuid", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "not-a-uuid")
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateClass_InvalidBody(t *testing.T) {
	id := uuid.New()
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, &classesTestRepos{})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestUpdateClass_InternalError(t *testing.T) {
	repos := &classesTestRepos{
		updateClassFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateClassParams) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodPatch, "/"+id.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Update(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetClass_InternalError(t *testing.T) {
	repos := &classesTestRepos{
		getClassFn: func(_ context.Context, _ uuid.UUID) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteClass_InternalError(t *testing.T) {
	repos := &classesTestRepos{
		deleteClassFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestDeleteClass_RBACForbidden(t *testing.T) {
	repos := &classesTestRepos{}
	h := NewClassHandler()
	router := h.Routes()

	id := uuid.New()
	req := httptest.NewRequest(http.MethodDelete, "/"+id.String(), nil)
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleStudent,
	})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for student DELETE, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetClassDetail_WithSections(t *testing.T) {
	c := testClass()
	classID := c.ID
	sectionID := uuid.MustParse("aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")

	repos := &classesTestRepos{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != classID {
				t.Fatalf("unexpected id: %v", id)
			}
			return c, nil
		},
		listSectionsByClassFn: func(_ context.Context, cid uuid.UUID) ([]store.Section, error) {
			if cid != classID {
				t.Fatalf("unexpected class id: %v", cid)
			}
			return []store.Section{
				{ID: sectionID, ClassID: classID, Name: "Section A"},
			}, nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+classID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got classDetailResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Class == nil {
		t.Fatal("expected class, got nil")
	}
	if got.Class.ID != classID {
		t.Errorf("expected class id %q, got %q", classID, got.Class.ID)
	}
	if len(got.Sections) != 1 {
		t.Fatalf("expected 1 section, got %d", len(got.Sections))
	}
	if got.InstructorNames == nil {
		t.Fatal("expected instructorNames map, got nil")
	}
}

func TestGetClassDetail_WithInstructorNames(t *testing.T) {
	c := testClass()
	classID := c.ID
	inst1ID := uuid.New()
	inst2ID := uuid.New()

	repos := &classesTestRepos{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != classID {
				t.Fatalf("unexpected id: %v", id)
			}
			return c, nil
		},
		listSectionsByClassFn: func(_ context.Context, _ uuid.UUID) ([]store.Section, error) {
			return nil, nil
		},
		listClassInstructorNamesFn: func(_ context.Context, cid uuid.UUID) (map[string]string, error) {
			if cid != classID {
				t.Fatalf("unexpected class id: %v", cid)
			}
			return map[string]string{
				inst1ID.String(): "Dr. Smith",
				inst2ID.String(): "jane@example.com",
			}, nil
		},
	}

	h := NewClassHandler()
	req := httptest.NewRequest(http.MethodGet, "/"+classID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	ctx = withClassRepos(ctx, repos)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var got classDetailResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got.InstructorNames) != 2 {
		t.Fatalf("expected 2 instructor names, got %d", len(got.InstructorNames))
	}
	if got.InstructorNames[inst1ID.String()] != "Dr. Smith" {
		t.Errorf("expected 'Dr. Smith', got %q", got.InstructorNames[inst1ID.String()])
	}
	if got.InstructorNames[inst2ID.String()] != "jane@example.com" {
		t.Errorf("expected 'jane@example.com', got %q", got.InstructorNames[inst2ID.String()])
	}
}

// mockClassRepo is kept for use by other test files (e.g. auth_accept_invite_test.go).
type mockClassRepo struct {
	listClassesFn                 func(ctx context.Context) ([]store.Class, error)
	getClassFn                    func(ctx context.Context, id uuid.UUID) (*store.Class, error)
	createClassFn                 func(ctx context.Context, params store.CreateClassParams) (*store.Class, error)
	updateClassFn                 func(ctx context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error)
	deleteClassFn                 func(ctx context.Context, id uuid.UUID) error
	listClassInstructorNamesFn    func(ctx context.Context, classID uuid.UUID) (map[string]string, error)
	listClassSectionInstructorsFn func(ctx context.Context, classID uuid.UUID) (map[string][]string, error)
}

func (m *mockClassRepo) ListClasses(ctx context.Context) ([]store.Class, error) {
	return m.listClassesFn(ctx)
}

func (m *mockClassRepo) GetClass(ctx context.Context, id uuid.UUID) (*store.Class, error) {
	return m.getClassFn(ctx, id)
}

func (m *mockClassRepo) CreateClass(ctx context.Context, params store.CreateClassParams) (*store.Class, error) {
	return m.createClassFn(ctx, params)
}

func (m *mockClassRepo) UpdateClass(ctx context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error) {
	return m.updateClassFn(ctx, id, params)
}

func (m *mockClassRepo) DeleteClass(ctx context.Context, id uuid.UUID) error {
	return m.deleteClassFn(ctx, id)
}

func (m *mockClassRepo) ListClassInstructorNames(ctx context.Context, classID uuid.UUID) (map[string]string, error) {
	if m.listClassInstructorNamesFn != nil {
		return m.listClassInstructorNamesFn(ctx, classID)
	}
	return nil, nil
}

func (m *mockClassRepo) ListClassSectionInstructors(ctx context.Context, classID uuid.UUID) (map[string][]string, error) {
	if m.listClassSectionInstructorsFn != nil {
		return m.listClassSectionInstructorsFn(ctx, classID)
	}
	return nil, nil
}
