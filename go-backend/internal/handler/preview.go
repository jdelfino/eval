package handler

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/pkg/httputil"
)

// PreviewHandler handles instructor preview-as-student endpoints.
//
// It uses a pool-level PreviewRepository (no RLS) because preview student records
// are managed outside of per-request RLS contexts.
type PreviewHandler struct {
	previewRepo store.PreviewRepository
}

// NewPreviewHandler creates a new PreviewHandler.
func NewPreviewHandler(previewRepo store.PreviewRepository) *PreviewHandler {
	return &PreviewHandler{previewRepo: previewRepo}
}

// enterPreviewResponse is the JSON response body for POST /sections/{id}/preview.
// It includes the preview student's full profile so the frontend can swap the
// cached identity without an extra API call.
type enterPreviewResponse struct {
	// Legacy fields (kept for backward compatibility)
	PreviewUserID string `json:"preview_user_id"`
	SectionID     string `json:"section_id"`

	// Full profile fields for identity swap on the frontend
	ID          string          `json:"id"`
	Email       string          `json:"email"`
	Role        auth.Role       `json:"role"`
	NamespaceID string          `json:"namespace_id"`
	Permissions []auth.Permission `json:"permissions"`
}

// Routes returns a chi.Router for preview endpoints.
// All routes require the PermPreviewStudent permission (instructor+).
//
// These routes must be mounted BEFORE PreviewMiddleware is applied to the
// authenticated route group, so the caller's real instructor identity is used,
// not a swapped preview identity.
func (h *PreviewHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequirePermission(auth.PermPreviewStudent))
	r.Post("/", h.EnterPreview)
	r.Delete("/", h.ExitPreview)
	return r
}

// EnterPreview handles POST /sections/{section_id}/preview.
//
// It looks up or creates the instructor's preview student, enrolls them in the
// requested section, and cleans up stale memberships from other sections.
func (h *PreviewHandler) EnterPreview(w http.ResponseWriter, r *http.Request) {
	instructor := auth.UserFromContext(r.Context())
	if instructor == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httpbind.ParseUUIDParam(w, r, "section_id")
	if !ok {
		return
	}

	// Authorization gate: GetSection uses the RLS-scoped store, so it verifies
	// the instructor can see this section before any pool-level preview operations.
	// This is the security boundary — if the instructor cannot see the section via
	// RLS, the preview is denied regardless of what the pool-level repo would allow.
	repos := store.ReposFromContext(r.Context())
	if _, err := repos.GetSection(r.Context(), sectionID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Look up or create the preview student.
	ps, err := h.previewRepo.GetPreviewStudent(r.Context(), instructor.ID)
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			httputil.WriteInternalError(w, r, err, "internal error")
			return
		}
		// No preview student yet — create one now.
		ps, err = h.previewRepo.CreatePreviewStudent(r.Context(), instructor.ID, instructor.NamespaceID)
		if err != nil {
			httputil.WriteInternalError(w, r, err, "internal error")
			return
		}
	}

	// Enroll the preview student in the target section.
	if err := h.previewRepo.EnrollPreviewStudent(r.Context(), ps.StudentUserID, sectionID); err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Best-effort cleanup: remove the preview student from any other sections.
	// Errors are logged but do not fail the request — stale memberships are benign.
	if err := h.previewRepo.UnenrollPreviewStudentFromOtherSections(r.Context(), ps.StudentUserID, sectionID); err != nil {
		slog.WarnContext(r.Context(), "preview: failed to unenroll from other sections (best-effort)", "error", err)
	}

	// Compute permissions for the student role so the frontend can swap the
	// cached identity without an extra API call. Note: we use RoleStudent, not
	// the instructor's role — the preview student has student-level permissions.
	studentPerms := auth.RolePermissions(auth.RoleStudent)
	previewEmail := fmt.Sprintf("preview+%s@system.internal", instructor.ID.String())

	httputil.WriteJSON(w, http.StatusOK, enterPreviewResponse{
		PreviewUserID: ps.StudentUserID.String(),
		SectionID:     sectionID.String(),
		ID:            ps.StudentUserID.String(),
		Email:         previewEmail,
		Role:          auth.RoleStudent,
		NamespaceID:   instructor.NamespaceID,
		Permissions:   studentPerms,
	})
}

// ExitPreview handles DELETE /sections/{section_id}/preview.
//
// It unenrolls the preview student from the given section. This is best-effort;
// errors during unenroll do not fail the request.
func (h *PreviewHandler) ExitPreview(w http.ResponseWriter, r *http.Request) {
	instructor := auth.UserFromContext(r.Context())
	if instructor == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sectionID, ok := httpbind.ParseUUIDParam(w, r, "section_id")
	if !ok {
		return
	}

	ps, err := h.previewRepo.GetPreviewStudent(r.Context(), instructor.ID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			// No preview student — nothing to unenroll. Treat as success.
			w.WriteHeader(http.StatusNoContent)
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Best-effort unenroll: errors are logged but do not fail the request so
	// clients can always clean up their local state even if the server-side
	// membership cleanup fails.
	if err := h.previewRepo.UnenrollPreviewStudent(r.Context(), ps.StudentUserID, sectionID); err != nil {
		slog.WarnContext(r.Context(), "preview: failed to unenroll preview student (best-effort)", "error", err)
	}

	w.WriteHeader(http.StatusNoContent)
}
