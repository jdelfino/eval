package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/store"
)

// mockPreviewRepo implements store.PreviewRepository for testing.
type mockPreviewRepo struct {
	getPreviewStudentFn                       func(ctx context.Context, instructorID uuid.UUID) (*store.PreviewStudent, error)
	createPreviewStudentFn                    func(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*store.PreviewStudent, error)
	enrollPreviewStudentFn                    func(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error
	unenrollPreviewStudentFromOtherSectionsFn func(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error
	unenrollPreviewStudentFn                  func(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error
	deletePreviewStudentFn                    func(ctx context.Context, instructorID uuid.UUID) error
}

func (m *mockPreviewRepo) GetPreviewStudent(ctx context.Context, instructorID uuid.UUID) (*store.PreviewStudent, error) {
	return m.getPreviewStudentFn(ctx, instructorID)
}

func (m *mockPreviewRepo) CreatePreviewStudent(ctx context.Context, instructorID uuid.UUID, namespaceID string) (*store.PreviewStudent, error) {
	return m.createPreviewStudentFn(ctx, instructorID, namespaceID)
}

func (m *mockPreviewRepo) EnrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	return m.enrollPreviewStudentFn(ctx, studentUserID, sectionID)
}

func (m *mockPreviewRepo) UnenrollPreviewStudentFromOtherSections(ctx context.Context, studentUserID uuid.UUID, keepSectionID uuid.UUID) error {
	return m.unenrollPreviewStudentFromOtherSectionsFn(ctx, studentUserID, keepSectionID)
}

func (m *mockPreviewRepo) UnenrollPreviewStudent(ctx context.Context, studentUserID uuid.UUID, sectionID uuid.UUID) error {
	return m.unenrollPreviewStudentFn(ctx, studentUserID, sectionID)
}

func (m *mockPreviewRepo) DeletePreviewStudent(ctx context.Context, instructorID uuid.UUID) error {
	if m.deletePreviewStudentFn != nil {
		return m.deletePreviewStudentFn(ctx, instructorID)
	}
	return nil
}

// newPreviewMiddlewareRequest creates a test request with the X-Preview-Section header.
func newPreviewMiddlewareRequest(sectionID string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/sections/test/problems", nil)
	if sectionID != "" {
		req.Header.Set("X-Preview-Section", sectionID)
	}
	return req
}

// TestPreviewMiddleware_NoHeader verifies that requests without X-Preview-Section pass through unchanged.
func TestPreviewMiddleware_NoHeader(t *testing.T) {
	repo := &mockPreviewRepo{}
	mw := PreviewMiddleware(repo)

	instructorID := uuid.New()
	instructor := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	var capturedUser *auth.User
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest("") // no header
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusOK)
	}
	// User in context should still be the instructor, not swapped
	if capturedUser == nil || capturedUser.ID != instructorID {
		t.Error("User should remain unchanged when no preview header is set")
	}
	// No preview context should be set
	if auth.IsPreview(req.Context()) {
		t.Error("Preview context should not be set when no header is provided")
	}
}

// TestPreviewMiddleware_StudentForbidden verifies students cannot use preview mode.
func TestPreviewMiddleware_StudentForbidden(t *testing.T) {
	repo := &mockPreviewRepo{}
	mw := PreviewMiddleware(repo)

	sectionID := uuid.New()
	student := &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleStudent,
		Email:       "student@example.com",
		NamespaceID: "test-ns",
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), student)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusForbidden)
	}
	if handlerCalled {
		t.Error("Handler should not be called for student with preview header")
	}
}

// TestPreviewMiddleware_NoUser verifies 401 when no user is in context.
// A missing user is an authentication failure, not an authorization failure,
// so the correct status is 401 Unauthorized (not 403 Forbidden).
func TestPreviewMiddleware_NoUser(t *testing.T) {
	repo := &mockPreviewRepo{}
	mw := PreviewMiddleware(repo)

	sectionID := uuid.New()

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	// no user in context

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
	if handlerCalled {
		t.Error("Handler should not be called when no user in context")
	}
}

// TestPreviewMiddleware_InvalidSectionID verifies 400 for malformed UUID.
func TestPreviewMiddleware_InvalidSectionID(t *testing.T) {
	repo := &mockPreviewRepo{}
	mw := PreviewMiddleware(repo)

	instructor := &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest("not-a-uuid")
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusBadRequest)
	}
	if handlerCalled {
		t.Error("Handler should not be called for invalid section UUID")
	}
}

// TestPreviewMiddleware_PreviewNotInitialized verifies 412 when no preview student exists.
func TestPreviewMiddleware_PreviewNotInitialized(t *testing.T) {
	instructorID := uuid.New()
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, id uuid.UUID) (*store.PreviewStudent, error) {
			if id != instructorID {
				t.Fatalf("unexpected instructorID: %v", id)
			}
			return nil, store.ErrNotFound
		},
	}
	mw := PreviewMiddleware(repo)

	sectionID := uuid.New()
	instructor := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusPreconditionFailed {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusPreconditionFailed)
	}
	if handlerCalled {
		t.Error("Handler should not be called when preview not initialized")
	}
}

// TestPreviewMiddleware_RepoError verifies 500 when the repo returns an unexpected error.
func TestPreviewMiddleware_RepoError(t *testing.T) {
	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return nil, errors.New("database error")
		},
	}
	mw := PreviewMiddleware(repo)

	sectionID := uuid.New()
	instructor := &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("Status code = %d, want %d", rr.Code, http.StatusInternalServerError)
	}
	if handlerCalled {
		t.Error("Handler should not be called on repo error")
	}
}

// TestPreviewMiddleware_IdentitySwap verifies that the instructor's identity is swapped
// to the preview student's identity when preview mode is active.
func TestPreviewMiddleware_IdentitySwap(t *testing.T) {
	instructorID := uuid.New()
	studentUserID := uuid.New()
	sectionID := uuid.New()
	namespaceID := "test-ns"

	previewStudent := &store.PreviewStudent{
		InstructorID:  instructorID,
		StudentUserID: studentUserID,
	}

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, id uuid.UUID) (*store.PreviewStudent, error) {
			if id != instructorID {
				t.Fatalf("unexpected instructorID: %v", id)
			}
			return previewStudent, nil
		},
	}
	mw := PreviewMiddleware(repo)

	instructor := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: namespaceID,
	}

	var capturedUser *auth.User
	var capturedPreviewCtx *auth.PreviewContext
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = auth.UserFromContext(r.Context())
		capturedPreviewCtx = auth.PreviewContextFrom(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d: %s", rr.Code, http.StatusOK, rr.Body.String())
	}

	// Verify identity was swapped to preview student
	if capturedUser == nil {
		t.Fatal("User should be in context after identity swap")
	}
	if capturedUser.ID != studentUserID {
		t.Errorf("User ID = %v, want %v (preview student)", capturedUser.ID, studentUserID)
	}
	if capturedUser.Role != auth.RoleStudent {
		t.Errorf("User Role = %v, want %v", capturedUser.Role, auth.RoleStudent)
	}
	if capturedUser.NamespaceID != namespaceID {
		t.Errorf("User NamespaceID = %v, want %v", capturedUser.NamespaceID, namespaceID)
	}

	// Verify preview context is set with original instructor
	if capturedPreviewCtx == nil {
		t.Fatal("PreviewContext should be set in context")
	}
	if capturedPreviewCtx.OriginalUser == nil || capturedPreviewCtx.OriginalUser.ID != instructorID {
		t.Error("PreviewContext.OriginalUser should be the instructor")
	}
	if capturedPreviewCtx.SectionID != sectionID {
		t.Errorf("PreviewContext.SectionID = %v, want %v", capturedPreviewCtx.SectionID, sectionID)
	}
}

// TestPreviewMiddleware_NamespaceAdminCanPreview verifies that namespace-admin users can use preview.
func TestPreviewMiddleware_NamespaceAdminCanPreview(t *testing.T) {
	instructorID := uuid.New()
	studentUserID := uuid.New()
	sectionID := uuid.New()

	previewStudent := &store.PreviewStudent{
		InstructorID:  instructorID,
		StudentUserID: studentUserID,
	}

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return previewStudent, nil
		},
	}
	mw := PreviewMiddleware(repo)

	admin := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleNamespaceAdmin,
		Email:       "admin@example.com",
		NamespaceID: "test-ns",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), admin)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d: namespace-admin should be allowed to use preview", rr.Code, http.StatusOK)
	}
}

// TestPreviewMiddleware_SystemAdminCanPreview verifies system-admin users can use preview.
func TestPreviewMiddleware_SystemAdminCanPreview(t *testing.T) {
	instructorID := uuid.New()
	studentUserID := uuid.New()
	sectionID := uuid.New()

	previewStudent := &store.PreviewStudent{
		InstructorID:  instructorID,
		StudentUserID: studentUserID,
	}

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return previewStudent, nil
		},
	}
	mw := PreviewMiddleware(repo)

	admin := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleSystemAdmin,
		Email:       "sysadmin@example.com",
		NamespaceID: "",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), admin)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d: system-admin should be allowed to use preview", rr.Code, http.StatusOK)
	}
}

// TestPreviewMiddleware_UsesPermissionCheck verifies the middleware rejects based on
// PermPreviewStudent permission, not a raw role equality check.
// This test uses a hypothetical role that equals auth.RoleStudent string value but
// we verify that students are rejected via the permission path (not a raw == check).
// The real behavioral assertion: a user whose role has PermPreviewStudent must pass
// and a user whose role does not have it must fail — we test this indirectly by
// confirming an instructor passes (has PermPreviewStudent) and a student is rejected
// (lacks PermPreviewStudent).
func TestPreviewMiddleware_UsesPermissionCheck_InstructorAllowed(t *testing.T) {
	instructorID := uuid.New()
	studentUserID := uuid.New()
	sectionID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
	}
	mw := PreviewMiddleware(repo)

	instructor := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	// Instructor has PermPreviewStudent, should be allowed
	if rr.Code != http.StatusOK {
		t.Errorf("Status code = %d, want %d: instructor with PermPreviewStudent should pass", rr.Code, http.StatusOK)
	}
}

func TestPreviewMiddleware_UsesPermissionCheck_StudentRejectedByPermission(t *testing.T) {
	repo := &mockPreviewRepo{}
	mw := PreviewMiddleware(repo)

	sectionID := uuid.New()
	student := &auth.User{
		ID:          uuid.New(),
		Role:        auth.RoleStudent,
		Email:       "student@example.com",
		NamespaceID: "test-ns",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), student)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	// Student lacks PermPreviewStudent, must be rejected with 403
	if rr.Code != http.StatusForbidden {
		t.Errorf("Status code = %d, want %d: student without PermPreviewStudent must be forbidden", rr.Code, http.StatusForbidden)
	}
}

// TestPreviewMiddleware_IsPreviewSetInContext verifies IsPreview returns true during preview.
func TestPreviewMiddleware_IsPreviewSetInContext(t *testing.T) {
	instructorID := uuid.New()
	studentUserID := uuid.New()
	sectionID := uuid.New()

	repo := &mockPreviewRepo{
		getPreviewStudentFn: func(_ context.Context, _ uuid.UUID) (*store.PreviewStudent, error) {
			return &store.PreviewStudent{
				InstructorID:  instructorID,
				StudentUserID: studentUserID,
			}, nil
		},
	}
	mw := PreviewMiddleware(repo)

	instructor := &auth.User{
		ID:          instructorID,
		Role:        auth.RoleInstructor,
		Email:       "instructor@example.com",
		NamespaceID: "test-ns",
	}

	var isPreview bool
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isPreview = auth.IsPreview(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := newPreviewMiddlewareRequest(sectionID.String())
	ctx := auth.WithUser(req.Context(), instructor)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	mw(handler).ServeHTTP(rr, req)

	if !isPreview {
		t.Error("auth.IsPreview should return true inside preview middleware")
	}
}
