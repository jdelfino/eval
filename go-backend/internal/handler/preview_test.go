package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockPreviewRepo implements store.PreviewRepository for handler testing.
type mockPreviewRepo struct {
	getPreviewStudentFn                       func(ctx context.Context, instructorID uuid.UUID) (*store.PreviewStudent, error)
	createPreviewStudentFn                    func(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*store.PreviewStudent, error)
	enrollPreviewStudentFn                    func(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error
	unenrollPreviewStudentFromOtherSectionsFn func(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error
	unenrollPreviewStudentFn                  func(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error
}

func (m *mockPreviewRepo) GetPreviewStudent(ctx context.Context, instructorID uuid.UUID) (*store.PreviewStudent, error) {
	if m.getPreviewStudentFn != nil {
		return m.getPreviewStudentFn(ctx, instructorID)
	}
	panic("mockPreviewRepo: unexpected GetPreviewStudent call")
}

func (m *mockPreviewRepo) CreatePreviewStudent(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*store.PreviewStudent, error) {
	if m.createPreviewStudentFn != nil {
		return m.createPreviewStudentFn(ctx, instructorID, namespaceID)
	}
	panic("mockPreviewRepo: unexpected CreatePreviewStudent call")
}

func (m *mockPreviewRepo) EnrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	if m.enrollPreviewStudentFn != nil {
		return m.enrollPreviewStudentFn(ctx, studentUserID, sectionID)
	}
	panic("mockPreviewRepo: unexpected EnrollPreviewStudent call")
}

func (m *mockPreviewRepo) UnenrollPreviewStudentFromOtherSections(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error {
	if m.unenrollPreviewStudentFromOtherSectionsFn != nil {
		return m.unenrollPreviewStudentFromOtherSectionsFn(ctx, studentUserID, keepSectionID)
	}
	// Best-effort, silently return nil if not set
	return nil
}

func (m *mockPreviewRepo) UnenrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	if m.unenrollPreviewStudentFn != nil {
		return m.unenrollPreviewStudentFn(ctx, studentUserID, sectionID)
	}
	panic("mockPreviewRepo: unexpected UnenrollPreviewStudent call")
}

// --- previewTestRepos: overrides GetSection for defense-in-depth check ---

type previewTestRepos struct {
	stubRepos
	getSectionFn func(ctx context.Context, id uuid.UUID) (*store.Section, error)
}

var _ store.Repos = (*previewTestRepos)(nil)

func (r *previewTestRepos) GetSection(ctx context.Context, id uuid.UUID) (*store.Section, error) {
	if r.getSectionFn != nil {
		return r.getSectionFn(ctx, id)
	}
	return &store.Section{ID: id}, nil
}

// --- EnterPreview tests ---

func TestEnterPreview_Success_ExistingPreviewStudent(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()

	existingPS := &store.PreviewStudent{
		InstructorID:  instructorID,
		StudentUserID: studentUserID,
	}

	enrollCalled := false
	unenrollOtherCalled := false

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, id uuid.UUID) (*store.PreviewStudent, error) {
			if id != instructorID {
				t.Fatalf("unexpected instructorID: %v", id)
			}
			return existingPS, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, stuID, secID uuid.UUID) error {
			enrollCalled = true
			if stuID != studentUserID {
				t.Errorf("enroll: unexpected studentUserID: %v", stuID)
			}
			if secID != sectionID {
				t.Errorf("enroll: unexpected sectionID: %v", secID)
			}
			return nil
		},
		unenrollPreviewStudentFromOtherSectionsFn: func(_ context.Context, stuID, keepSecID uuid.UUID) error {
			unenrollOtherCalled = true
			if stuID != studentUserID {
				t.Errorf("unenrollOther: unexpected studentUserID: %v", stuID)
			}
			if keepSecID != sectionID {
				t.Errorf("unenrollOther: unexpected keepSectionID: %v", keepSecID)
			}
			return nil
		},
	}

	repos := &previewTestRepos{}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["preview_user_id"] != studentUserID.String() {
		t.Errorf("preview_user_id = %q, want %q", resp["preview_user_id"], studentUserID.String())
	}
	if resp["section_id"] != sectionID.String() {
		t.Errorf("section_id = %q, want %q", resp["section_id"], sectionID.String())
	}

	if !enrollCalled {
		t.Error("EnrollPreviewStudent should have been called")
	}
	if !unenrollOtherCalled {
		t.Error("UnenrollPreviewStudentFromOtherSections should have been called")
	}
}

func TestEnterPreview_Success_CreatesPreviewStudent(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()
	namespaceID := "test-ns"

	newPS := &store.PreviewStudent{
		InstructorID:  instructorID,
		StudentUserID: studentUserID,
	}

	createCalled := false
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, store.ErrNotFound
		},
		createPreviewStudentFn: func(_ context.Context, instrID uuid.UUID, ns string) (*store.PreviewStudent, error) {
			createCalled = true
			if instrID != instructorID {
				t.Errorf("create: unexpected instructorID: %v", instrID)
			}
			if ns != namespaceID {
				t.Errorf("create: unexpected namespaceID: %v", ns)
			}
			return newPS, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error {
			return nil
		},
	}

	repos := &previewTestRepos{}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: namespaceID,
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	if !createCalled {
		t.Error("CreatePreviewStudent should have been called when no preview student exists")
	}
}

func TestEnterPreview_Unauthorized(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{}
	h := NewPreviewHandler(repo)

	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	// no user in context

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestEnterPreview_InvalidSectionID(t *testing.T) {
	repo := &mockPreviewRepo{}
	h := NewPreviewHandler(repo)

	req := httptest.NewRequest(http.MethodPost, "/sections/not-a-uuid/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", "not-a-uuid"))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleInstructor,
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestEnterPreview_SectionNotVisible(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()

	repo := &mockPreviewRepo{}
	repos := &previewTestRepos{
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEnterPreview_GetPreviewStudentError(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, errors.New("db error")
		},
	}
	repos := &previewTestRepos{}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEnterPreview_CreatePreviewStudentError(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, store.ErrNotFound
		},
		createPreviewStudentFn: func(_ context.Context, _ uuid.UUID, _ string) (*store.PreviewStudent, error) {
			return nil, errors.New("db error")
		},
	}
	repos := &previewTestRepos{}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestEnterPreview_EnrollError(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}
	repos := &previewTestRepos{}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	ctx = store.WithRepos(ctx, repos)
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- ExitPreview tests ---

func TestExitPreview_Success(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()

	unenrollCalled := false
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, id uuid.UUID) (*store.PreviewStudent, error) {
			if id != instructorID {
				t.Fatalf("unexpected instructorID: %v", id)
			}
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		unenrollPreviewStudentFn: func(_ context.Context, stuID, secID uuid.UUID) error {
			unenrollCalled = true
			if stuID != studentUserID {
				t.Errorf("unenroll: unexpected studentUserID: %v", stuID)
			}
			if secID != sectionID {
				t.Errorf("unenroll: unexpected sectionID: %v", secID)
			}
			return nil
		},
	}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if !unenrollCalled {
		t.Error("UnenrollPreviewStudent should have been called")
	}
}

func TestExitPreview_Unauthorized(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{}
	h := NewPreviewHandler(repo)

	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	// no user in context

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestExitPreview_InvalidSectionID(t *testing.T) {
	repo := &mockPreviewRepo{}
	h := NewPreviewHandler(repo)

	req := httptest.NewRequest(http.MethodDelete, "/sections/not-a-uuid/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", "not-a-uuid"))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:   uuid.New(),
		Role: auth.RoleInstructor,
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExitPreview_PreviewStudentNotFound(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, store.ErrNotFound
		},
	}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	// If no preview student exists, exit is a no-op (204)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 (no-op when no preview student), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExitPreview_GetPreviewStudentError(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, errors.New("db error")
		},
	}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestExitPreview_UnenrollBestEffort verifies that unenroll errors don't fail the request (best-effort).
func TestExitPreview_UnenrollBestEffort(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		unenrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error {
			return errors.New("db error")
		},
	}

	h := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h.ExitPreview(rec, req)

	// Unenroll is best-effort, still returns 204
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 (unenroll is best-effort), got %d: %s", rec.Code, rec.Body.String())
	}
}
