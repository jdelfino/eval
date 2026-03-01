package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
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
	deletePreviewStudentFn                    func(ctx context.Context, instructorID uuid.UUID) error
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

func (m *mockPreviewRepo) DeletePreviewStudent(ctx context.Context, instructorID uuid.UUID) error {
	if m.deletePreviewStudentFn != nil {
		return m.deletePreviewStudentFn(ctx, instructorID)
	}
	panic("mockPreviewRepo: unexpected DeletePreviewStudent call")
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

// --- Route permission tests ---

// TestPreviewRoutes_UsesPermPreviewStudent verifies that the preview routes use
// PermPreviewStudent (not PermContentManage) as the required permission.
// A student must be denied 403, an instructor must be allowed through.
func TestPreviewRoutes_UsesPermPreviewStudent(t *testing.T) {
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
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error { return nil },
	}

	h := NewPreviewHandler(repo)
	router := h.Routes()

	repos := &previewTestRepos{}

	// Student should be rejected (lacks preview.enter permission)
	t.Run("student forbidden", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
		ctx := auth.WithUser(req.Context(), &auth.User{
			ID:          uuid.New(),
			Role:        auth.RoleStudent,
			NamespaceID: "test-ns",
		})
		ctx = store.WithRepos(ctx, repos)
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 for student, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	// Instructor should be allowed through (has preview.enter permission)
	t.Run("instructor allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
		ctx := auth.WithUser(req.Context(), &auth.User{
			ID:          instructorID,
			Role:        auth.RoleInstructor,
			NamespaceID: "test-ns",
		})
		ctx = store.WithRepos(ctx, repos)
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		if rec.Code == http.StatusForbidden {
			t.Errorf("expected instructor to be allowed, got 403: %s", rec.Body.String())
		}
	})
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

	var resp map[string]interface{}
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

	deleteCalled := false
	repo := &mockPreviewRepo{
		deletePreviewStudentFn: func(_ context.Context, id uuid.UUID) error {
			deleteCalled = true
			if id != instructorID {
				t.Errorf("delete: unexpected instructorID: %v", id)
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
	if !deleteCalled {
		t.Error("DeletePreviewStudent should have been called")
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

func TestExitPreview_NoPreviewStudent(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{
		deletePreviewStudentFn: func(_ context.Context, _ uuid.UUID) error {
			// No-op — no preview student exists, DELETE affects 0 rows
			return nil
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

	// If no preview student exists, delete is a no-op (204)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 (no-op when no preview student), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestExitPreview_DeleteError_BestEffort(t *testing.T) {
	sectionID := uuid.New()
	repo := &mockPreviewRepo{
		deletePreviewStudentFn: func(_ context.Context, _ uuid.UUID) error {
			return errors.New("db error")
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

	// Delete is best-effort, still returns 204
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 (delete is best-effort), got %d: %s", rec.Code, rec.Body.String())
	}
}


// --- WriteInternalError logging: underlying error must be logged for all 500 paths ---

// TestEnterPreview_GetSectionError_LogsUnderlyingError verifies that when GetSection
// fails with an internal error, WriteInternalError is used so the underlying error
// appears in the structured log output.
func TestEnterPreview_GetSectionError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	underlyingErr := fmt.Errorf("db: connection refused from GetSection")

	repo := &mockPreviewRepo{}
	repos := &previewTestRepos{
		getSectionFn: func(_ context.Context, _ uuid.UUID) (*store.Section, error) {
			return nil, underlyingErr
		},
	}

	h2 := NewPreviewHandler(repo)
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
	h2.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !h.containsErrorAttr("connection refused from GetSection") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestEnterPreview_GetPreviewStudentError_LogsUnderlyingError verifies that when
// GetPreviewStudent fails, WriteInternalError is used so the error is logged.
func TestEnterPreview_GetPreviewStudentError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	underlyingErr := fmt.Errorf("db: timeout from GetPreviewStudent")

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, underlyingErr
		},
	}
	repos := &previewTestRepos{}

	h2 := NewPreviewHandler(repo)
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
	h2.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !h.containsErrorAttr("timeout from GetPreviewStudent") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestEnterPreview_CreatePreviewStudentError_LogsUnderlyingError verifies that when
// CreatePreviewStudent fails, WriteInternalError is used so the error is logged.
func TestEnterPreview_CreatePreviewStudentError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	underlyingErr := fmt.Errorf("db: disk full from CreatePreviewStudent")

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, store.ErrNotFound
		},
		createPreviewStudentFn: func(_ context.Context, _ uuid.UUID, _ string) (*store.PreviewStudent, error) {
			return nil, underlyingErr
		},
	}
	repos := &previewTestRepos{}

	h2 := NewPreviewHandler(repo)
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
	h2.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !h.containsErrorAttr("disk full from CreatePreviewStudent") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestEnterPreview_EnrollError_LogsUnderlyingError verifies that when EnrollPreviewStudent
// fails, WriteInternalError is used so the error is logged.
func TestEnterPreview_EnrollError_LogsUnderlyingError(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()
	underlyingErr := fmt.Errorf("db: deadlock from EnrollPreviewStudent")

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error {
			return underlyingErr
		},
	}
	repos := &previewTestRepos{}

	h2 := NewPreviewHandler(repo)
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
	h2.EnterPreview(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", rec.Code, rec.Body.String())
	}
	if !h.containsErrorAttr("deadlock from EnrollPreviewStudent") {
		t.Error("expected underlying error to be logged via WriteInternalError, but it was not found in slog output; use WriteInternalError instead of WriteError")
	}
}

// TestEnterPreview_FullProfileInResponse verifies that the EnterPreview response
// includes the full profile fields: id, email, role, namespace_id, and
// student-level permissions (not the instructor's permissions).
func TestEnterPreview_FullProfileInResponse(t *testing.T) {
	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()
	namespaceID := "test-ns"

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error { return nil },
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

	var resp map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// id must be the preview student's user ID
	if resp["id"] != studentUserID.String() {
		t.Errorf("id = %q, want %q", resp["id"], studentUserID.String())
	}
	// email must be the deterministic preview student email
	wantEmail := fmt.Sprintf("preview+%s@system.internal", instructorID.String())
	if resp["email"] != wantEmail {
		t.Errorf("email = %q, want %q", resp["email"], wantEmail)
	}
	// role must be student (not instructor)
	if resp["role"] != string(auth.RoleStudent) {
		t.Errorf("role = %q, want %q", resp["role"], string(auth.RoleStudent))
	}
	// namespace_id must match the instructor's namespace
	if resp["namespace_id"] != namespaceID {
		t.Errorf("namespace_id = %q, want %q", resp["namespace_id"], namespaceID)
	}
	// permissions must be present and contain student permissions
	perms, ok := resp["permissions"].([]interface{})
	if !ok {
		t.Fatalf("permissions field missing or wrong type: %T = %v", resp["permissions"], resp["permissions"])
	}
	if len(perms) == 0 {
		t.Error("permissions must not be empty for student role")
	}
	// permissions must NOT contain instructor-only permissions
	for _, p := range perms {
		if p == string(auth.PermPreviewStudent) {
			t.Errorf("permissions must not include instructor-only %s for preview student", auth.PermPreviewStudent)
		}
		if p == string(auth.PermContentManage) {
			t.Errorf("permissions must not include instructor-only %s for preview student", auth.PermContentManage)
		}
	}
	// permissions must include student permissions
	foundSessionJoin := false
	for _, p := range perms {
		if p == string(auth.PermSessionJoin) {
			foundSessionJoin = true
		}
	}
	if !foundSessionJoin {
		t.Errorf("permissions must include %s for student role", auth.PermSessionJoin)
	}
}

// TestEnterPreview_UnenrollOtherSectionsError_Logged verifies that when
// UnenrollPreviewStudentFromOtherSections fails, the error is logged as a warning
// (not silently dropped) and the request still succeeds (best-effort).
func TestEnterPreview_UnenrollOtherSectionsError_Logged(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	studentUserID := uuid.New()
	unenrollErr := fmt.Errorf("db: disk full from UnenrollOtherSections")

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
		enrollPreviewStudentFn: func(_ context.Context, _, _ uuid.UUID) error { return nil },
		unenrollPreviewStudentFromOtherSectionsFn: func(_ context.Context, _, _ uuid.UUID) error {
			return unenrollErr
		},
	}
	repos := &previewTestRepos{}

	h2 := NewPreviewHandler(repo)
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
	h2.EnterPreview(rec, req)

	// Still succeeds — best-effort
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (unenroll other sections is best-effort), got %d: %s", rec.Code, rec.Body.String())
	}
	// But the error must be logged
	if !h.containsErrorAttr("disk full from UnenrollOtherSections") {
		t.Error("expected unenroll error to be logged as warn, but not found in slog output")
	}
}

// TestExitPreview_DeleteError_Logged verifies that when DeletePreviewStudent
// fails in ExitPreview, the error is logged as a warning (not silently dropped)
// and the request still succeeds (best-effort).
func TestExitPreview_DeleteError_Logged(t *testing.T) {
	h := &capturingSlogHandler{}
	orig := slog.Default()
	slog.SetDefault(slog.New(h))
	t.Cleanup(func() { slog.SetDefault(orig) })

	instructorID := uuid.New()
	sectionID := uuid.New()
	deleteErr := fmt.Errorf("db: connection lost from ExitPreview DeletePreviewStudent")

	repo := &mockPreviewRepo{
		deletePreviewStudentFn: func(_ context.Context, _ uuid.UUID) error {
			return deleteErr
		},
	}

	h2 := NewPreviewHandler(repo)
	req := httptest.NewRequest(http.MethodDelete, "/sections/"+sectionID.String()+"/preview", nil)
	req = req.WithContext(withChiParam(req.Context(), "section_id", sectionID.String()))
	ctx := auth.WithUser(req.Context(), &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		NamespaceID: "test-ns",
	})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	h2.ExitPreview(rec, req)

	// Still succeeds — best-effort
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 (delete is best-effort), got %d: %s", rec.Code, rec.Body.String())
	}
	// But the error must be logged
	if !h.containsErrorAttr("connection lost from ExitPreview DeletePreviewStudent") {
		t.Error("expected delete error to be logged as warn, but not found in slog output")
	}
}

