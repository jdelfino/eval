package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// startPracticeRequest is the JSON body for POST /problems/{id}/practice.
type startPracticeRequest struct {
	SectionID uuid.UUID `json:"section_id" validate:"required"`
}

// startPracticeResponse is the JSON response for POST /problems/{id}/practice.
type startPracticeResponse struct {
	SessionID string `json:"session_id"`
}

// PracticeSessionStore is the interface for practice session admin operations.
// These bypass RLS because students cannot create sessions directly.
type PracticeSessionStore interface {
	FindCompletedSessionByProblem(ctx context.Context, sectionID, problemID uuid.UUID) (*store.Session, error)
	CreateSession(ctx context.Context, params store.CreateSessionParams) (*store.Session, error)
	UpdateSession(ctx context.Context, id uuid.UUID, params store.UpdateSessionParams) (*store.Session, error)
}

// PracticeSessionHandler handles practice session creation.
// It uses an admin store (no RLS) to find/create sessions because students
// don't have INSERT/UPDATE permissions on the sessions table.
type PracticeSessionHandler struct {
	adminStore PracticeSessionStore
}

// NewPracticeSessionHandler creates a PracticeSessionHandler.
func NewPracticeSessionHandler(adminStore PracticeSessionStore) *PracticeSessionHandler {
	return &PracticeSessionHandler{adminStore: adminStore}
}

// StartPractice handles POST /api/v1/problems/{id}/practice.
// It finds an existing completed session for the problem in the given section,
// or creates one on the fly. Returns the session ID so the frontend can redirect
// the student to the practice workspace.
func (h *PracticeSessionHandler) StartPractice(w http.ResponseWriter, r *http.Request) {
	// 1. Auth check
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// 2. Parse problem ID from URL
	problemID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	// 3. Bind request body
	req, err := httpbind.BindJSON[startPracticeRequest](w, r)
	if err != nil {
		return
	}

	// 4. RLS-scoped repos for access-checked reads
	repos := store.ReposFromContext(r.Context())

	// 5. Validate problem exists (RLS enforces namespace visibility)
	problem, err := repos.GetProblem(r.Context(), problemID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "problem not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// 6. Validate section exists and user has access (RLS enforces visibility)
	section, err := repos.GetSection(r.Context(), req.SectionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// 7. Verify the user is enrolled in this section
	mySections, err := repos.ListMySections(r.Context(), authUser.ID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}
	enrolled := false
	for _, s := range mySections {
		if s.Section.ID == req.SectionID {
			enrolled = true
			break
		}
	}
	if !enrolled {
		httputil.WriteError(w, http.StatusForbidden, "not enrolled in this section")
		return
	}

	// 8. Validate section belongs to the same class as the problem
	if problem.ClassID != nil && *problem.ClassID != section.ClassID {
		httputil.WriteError(w, http.StatusBadRequest, "section does not belong to the problem's class")
		return
	}

	// 9. Find existing completed session (admin store, no RLS needed)
	session, err := h.adminStore.FindCompletedSessionByProblem(r.Context(), req.SectionID, problemID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// 10. If no existing session, create one and immediately complete it
	if session == nil {
		problemJSON, marshalErr := json.Marshal(problem)
		if marshalErr != nil {
			httputil.WriteInternalError(w, r, marshalErr, "internal error")
			return
		}

		newSession, createErr := h.adminStore.CreateSession(r.Context(), store.CreateSessionParams{
			NamespaceID: section.NamespaceID,
			SectionID:   section.ID,
			SectionName: section.Name,
			Problem:     problemJSON,
			CreatorID:   authUser.ID,
		})
		if createErr != nil {
			httputil.WriteInternalError(w, r, createErr, "internal error")
			return
		}

		completed := "completed"
		now := time.Now()
		session, err = h.adminStore.UpdateSession(r.Context(), newSession.ID, store.UpdateSessionParams{
			Status:  &completed,
			EndedAt: &now,
		})
		if err != nil {
			httputil.WriteInternalError(w, r, err, "internal error")
			return
		}
	}

	// 11. Return session ID
	httputil.WriteJSON(w, http.StatusOK, startPracticeResponse{
		SessionID: session.ID.String(),
	})
}
