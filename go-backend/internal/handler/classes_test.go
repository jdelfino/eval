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

// mockClassRepo implements store.ClassRepository for testing.
type mockClassRepo struct {
	listClassesFn  func(ctx context.Context) ([]store.Class, error)
	getClassFn     func(ctx context.Context, id uuid.UUID) (*store.Class, error)
	createClassFn  func(ctx context.Context, params store.CreateClassParams) (*store.Class, error)
	updateClassFn  func(ctx context.Context, id uuid.UUID, params store.UpdateClassParams) (*store.Class, error)
	deleteClassFn  func(ctx context.Context, id uuid.UUID) error
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

func TestListClasses_Success(t *testing.T) {
	c := testClass()
	repo := &mockClassRepo{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return []store.Class{*c}, nil
		},
	}

	h := NewClassHandler(repo, nil, nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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
	repo := &mockClassRepo{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return nil, nil
		},
	}

	h := NewClassHandler(repo, nil, nil, nil)
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

func TestListClasses_InternalError(t *testing.T) {
	repo := &mockClassRepo{
		listClassesFn: func(_ context.Context) ([]store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewClassHandler(repo, nil, nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := auth.WithUser(req.Context(), &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.List(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestGetClass_Success(t *testing.T) {
	c := testClass()
	repo := &mockClassRepo{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != c.ID {
				t.Fatalf("unexpected id: %v", id)
			}
			return c, nil
		},
	}

	h := NewClassHandler(repo, nil, nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/"+c.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", c.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Get(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var got store.Class
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != c.ID {
		t.Errorf("expected id %q, got %q", c.ID, got.ID)
	}
}

func TestGetClass_NotFound(t *testing.T) {
	repo := &mockClassRepo{
		getClassFn: func(_ context.Context, _ uuid.UUID) (*store.Class, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestGetClass_InvalidID(t *testing.T) {
	repo := &mockClassRepo{}
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestCreateClass_Success(t *testing.T) {
	userID := uuid.MustParse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
	c := testClass()

	repo := &mockClassRepo{
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
	h := NewClassHandler(repo, nil, nil, nil)
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

	var got store.Class
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != c.ID {
		t.Errorf("expected id %q, got %q", c.ID, got.ID)
	}
}

func TestCreateClass_Unauthorized(t *testing.T) {
	h := NewClassHandler(&mockClassRepo{}, nil, nil, nil)
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rec := httptest.NewRecorder()

	h.Create(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestCreateClass_RBACForbidden(t *testing.T) {
	repo := &mockClassRepo{}
	h := NewClassHandler(repo, nil, nil, nil)
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

	repo := &mockClassRepo{
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
	h := NewClassHandler(repo, nil, nil, nil)
	req := httptest.NewRequest(http.MethodPatch, "/"+c.ID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", c.ID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
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
	repo := &mockClassRepo{
		updateClassFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateClassParams) (*store.Class, error) {
			return nil, store.ErrNotFound
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestDeleteClass_Success(t *testing.T) {
	classID := uuid.New()
	repo := &mockClassRepo{
		deleteClassFn: func(_ context.Context, id uuid.UUID) error {
			if id != classID {
				t.Fatalf("unexpected id: %v", id)
			}
			return nil
		},
	}

	h := NewClassHandler(repo, nil, nil, nil)
	req := httptest.NewRequest(http.MethodDelete, "/"+classID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleInstructor})
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	h.Delete(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestDeleteClass_NotFound(t *testing.T) {
	repo := &mockClassRepo{
		deleteClassFn: func(_ context.Context, _ uuid.UUID) error {
			return store.ErrNotFound
		},
	}

	id := uuid.New()
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestDeleteClass_InvalidID(t *testing.T) {
	repo := &mockClassRepo{}
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestCreateClass_MissingName(t *testing.T) {
	h := NewClassHandler(&mockClassRepo{}, nil, nil, nil)
	body, _ := json.Marshal(map[string]any{"description": "no name"})
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

func TestCreateClass_InvalidBody(t *testing.T) {
	h := NewClassHandler(&mockClassRepo{}, nil, nil, nil)
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

func TestCreateClass_InternalError(t *testing.T) {
	repo := &mockClassRepo{
		createClassFn: func(_ context.Context, _ store.CreateClassParams) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	body, _ := json.Marshal(map[string]any{"name": "CS 101"})
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestUpdateClass_InvalidID(t *testing.T) {
	repo := &mockClassRepo{}
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestUpdateClass_InvalidBody(t *testing.T) {
	id := uuid.New()
	h := NewClassHandler(&mockClassRepo{}, nil, nil, nil)
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

func TestUpdateClass_InternalError(t *testing.T) {
	repo := &mockClassRepo{
		updateClassFn: func(_ context.Context, _ uuid.UUID, _ store.UpdateClassParams) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	body, _ := json.Marshal(map[string]any{"name": "New Name"})
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestGetClass_InternalError(t *testing.T) {
	repo := &mockClassRepo{
		getClassFn: func(_ context.Context, _ uuid.UUID) (*store.Class, error) {
			return nil, errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestDeleteClass_InternalError(t *testing.T) {
	repo := &mockClassRepo{
		deleteClassFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	id := uuid.New()
	h := NewClassHandler(repo, nil, nil, nil)
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

func TestDeleteClass_RBACForbidden(t *testing.T) {
	repo := &mockClassRepo{}
	h := NewClassHandler(repo, nil, nil, nil)
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

// classTestUserRepo implements store.UserRepository for class tests.
type classTestUserRepo struct {
	getUserByIDFn func(ctx context.Context, id uuid.UUID) (*store.User, error)
}

func (m *classTestUserRepo) GetUserByID(ctx context.Context, id uuid.UUID) (*store.User, error) {
	if m.getUserByIDFn != nil {
		return m.getUserByIDFn(ctx, id)
	}
	return nil, store.ErrNotFound
}

func (m *classTestUserRepo) GetUserByExternalID(_ context.Context, _ string) (*store.User, error) {
	return nil, store.ErrNotFound
}

func (m *classTestUserRepo) GetUserByEmail(_ context.Context, _ string) (*store.User, error) {
	return nil, store.ErrNotFound
}

func (m *classTestUserRepo) UpdateUser(_ context.Context, _ uuid.UUID, _ store.UpdateUserParams) (*store.User, error) {
	return nil, store.ErrNotFound
}

func (m *classTestUserRepo) ListUsers(_ context.Context, _ store.UserFilters) ([]store.User, error) {
	return nil, nil
}

func (m *classTestUserRepo) UpdateUserAdmin(_ context.Context, _ uuid.UUID, _ store.UpdateUserAdminParams) (*store.User, error) {
	return nil, store.ErrNotFound
}

func (m *classTestUserRepo) DeleteUser(_ context.Context, _ uuid.UUID) error {
	return store.ErrNotFound
}

func (m *classTestUserRepo) CountUsersByRole(_ context.Context, _ string) (map[string]int, error) {
	return nil, nil
}

func TestGetClassDetail_WithSectionsAndInstructors(t *testing.T) {
	c := testClass()
	classID := c.ID
	sectionID := uuid.MustParse("aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee")
	instructorID := uuid.MustParse("bbbb1111-cccc-dddd-eeee-ffffffffffff")
	studentID := uuid.MustParse("cccc1111-dddd-eeee-ffff-aaaaaaaaaaaa")

	classRepo := &mockClassRepo{
		getClassFn: func(_ context.Context, id uuid.UUID) (*store.Class, error) {
			if id != classID {
				t.Fatalf("unexpected id: %v", id)
			}
			return c, nil
		},
	}

	sectionRepo := &mockSectionRepo{
		listSectionsByClassFn: func(_ context.Context, cid uuid.UUID) ([]store.Section, error) {
			if cid != classID {
				t.Fatalf("unexpected class id: %v", cid)
			}
			return []store.Section{
				{ID: sectionID, ClassID: classID, Name: "Section A"},
			}, nil
		},
	}

	membershipRepo := &mockMembershipRepo{
		listMembersFn: func(_ context.Context, sid uuid.UUID) ([]store.SectionMembership, error) {
			if sid != sectionID {
				t.Fatalf("unexpected section id: %v", sid)
			}
			return []store.SectionMembership{
				{ID: uuid.New(), UserID: instructorID, SectionID: sectionID, Role: "instructor"},
				{ID: uuid.New(), UserID: studentID, SectionID: sectionID, Role: "student"},
			}, nil
		},
	}

	displayName := "Prof. Smith"
	userRepo := &classTestUserRepo{
		getUserByIDFn: func(_ context.Context, id uuid.UUID) (*store.User, error) {
			if id == instructorID {
				return &store.User{ID: instructorID, Email: "smith@example.com", DisplayName: &displayName}, nil
			}
			return nil, store.ErrNotFound
		},
	}

	h := NewClassHandler(classRepo, sectionRepo, membershipRepo, userRepo)
	req := httptest.NewRequest(http.MethodGet, "/"+classID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", classID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, rctx)
	ctx = auth.WithUser(ctx, &auth.User{ID: uuid.New(), Role: auth.RoleStudent})
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
	if got.Class.ID != classID {
		t.Errorf("expected class id %q, got %q", classID, got.Class.ID)
	}
	if len(got.Sections) != 1 {
		t.Fatalf("expected 1 section, got %d", len(got.Sections))
	}
	if len(got.InstructorNames) != 1 {
		t.Fatalf("expected 1 instructor name, got %d", len(got.InstructorNames))
	}
	if got.InstructorNames[0] != "Prof. Smith" {
		t.Errorf("expected instructor name %q, got %q", "Prof. Smith", got.InstructorNames[0])
	}
}
