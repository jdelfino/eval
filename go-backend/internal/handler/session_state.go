package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/realtime"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SessionStateHandler handles composite session state endpoints.
type SessionStateHandler struct {
	sessions        store.SessionRepository
	sessionStudents store.SessionStudentRepository
	sections        store.SectionRepository
	publisher       realtime.SessionPublisher
	logger          *slog.Logger
}

// NewSessionStateHandler creates a new SessionStateHandler.
func NewSessionStateHandler(
	sessions store.SessionRepository,
	sessionStudents store.SessionStudentRepository,
	sections store.SectionRepository,
	publisher realtime.SessionPublisher,
	logger *slog.Logger,
) *SessionStateHandler {
	return &SessionStateHandler{
		sessions:        sessions,
		sessionStudents: sessionStudents,
		sections:        sections,
		publisher:       publisher,
		logger:          logger,
	}
}

type sessionStateResponse struct {
	Session  store.Session          `json:"session"`
	Students []store.SessionStudent `json:"students"`
	JoinCode string                 `json:"join_code"`
}

// State handles GET /api/v1/sessions/{id}/state — composite read.
func (h *SessionStateHandler) State(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	resp, err := h.buildStateResponse(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

// Details handles GET /api/v1/sessions/{id}/details — instructor-only composite read.
func (h *SessionStateHandler) Details(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	resp, err := h.buildStateResponse(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

func (h *SessionStateHandler) buildStateResponse(ctx context.Context, id uuid.UUID) (*sessionStateResponse, error) {
	session, err := h.sessions.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}

	students, err := h.sessionStudents.ListSessionStudents(ctx, id)
	if err != nil {
		return nil, err
	}
	if students == nil {
		students = []store.SessionStudent{}
	}

	section, err := h.sections.GetSection(ctx, session.SectionID)
	if err != nil {
		return nil, err
	}

	return &sessionStateResponse{
		Session:  *session,
		Students: students,
		JoinCode: section.JoinCode,
	}, nil
}

type sessionPublicStateResponse struct {
	Problem           json.RawMessage `json:"problem"`
	FeaturedStudentID *uuid.UUID      `json:"featured_student_id"`
	FeaturedCode      *string         `json:"featured_code"`
	JoinCode          string          `json:"join_code"`
	Status            string          `json:"status"`
}

// PublicState handles GET /api/v1/sessions/{id}/public-state — public display data.
func (h *SessionStateHandler) PublicState(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	session, err := h.sessions.GetSession(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	section, err := h.sections.GetSection(r.Context(), session.SectionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "section not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, sessionPublicStateResponse{
		Problem:           session.Problem,
		FeaturedStudentID: session.FeaturedStudentID,
		FeaturedCode:      session.FeaturedCode,
		JoinCode:          section.JoinCode,
		Status:            session.Status,
	})
}

type featureRequest struct {
	StudentID *uuid.UUID `json:"student_id"`
	Code      *string    `json:"code"`
}

// Feature handles POST /api/v1/sessions/{id}/feature — set/clear featured student.
func (h *SessionStateHandler) Feature(w http.ResponseWriter, r *http.Request) {
	id, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[featureRequest](w, r)
	if err != nil {
		return
	}

	session, err := h.sessions.UpdateSession(r.Context(), id, store.UpdateSessionParams{
		FeaturedStudentID: req.StudentID,
		FeaturedCode:      req.Code,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Publish featured_student_changed event.
	studentID := ""
	code := ""
	if req.StudentID != nil {
		studentID = req.StudentID.String()
	}
	if req.Code != nil {
		code = *req.Code
	}
	publishAsync(r, h.logger, id, func(ctx context.Context) error {
		return h.publisher.FeaturedStudentChanged(ctx, id.String(), studentID, code)
	})

	httputil.WriteJSON(w, http.StatusOK, session)
}
