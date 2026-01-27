package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/realtime"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// SessionStudentHandler handles session student participation routes.
type SessionStudentHandler struct {
	sessionStudents store.SessionStudentRepository
	publisher       realtime.SessionPublisher
	logger          *slog.Logger
}

// NewSessionStudentHandler creates a new SessionStudentHandler with the given repository.
func NewSessionStudentHandler(sessionStudents store.SessionStudentRepository, publisher realtime.SessionPublisher, logger *slog.Logger) *SessionStudentHandler {
	return &SessionStudentHandler{sessionStudents: sessionStudents, publisher: publisher, logger: logger}
}

// joinSessionRequest is the request body for POST /sessions/{id}/join.
type joinSessionRequest struct {
	Name string `json:"name" validate:"required,min=1"`
}

// Join handles POST /api/v1/sessions/{id}/join — student joins a session.
func (h *SessionStudentHandler) Join(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[joinSessionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	student, err := h.sessionStudents.JoinSession(r.Context(), store.JoinSessionParams{
		SessionID: sessionID,
		UserID:    authUser.ID,
		Name:      req.Name,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := h.publisher.StudentJoined(r.Context(), sessionID.String(), authUser.ID.String(), req.Name); err != nil {
		h.logger.Error("failed to publish student_joined", "error", err, "session_id", sessionID)
	}

	httputil.WriteJSON(w, http.StatusCreated, student)
}

// updateCodeRequest is the request body for PUT /sessions/{id}/code.
type updateCodeRequest struct {
	Code string `json:"code" validate:"required"`
}

// UpdateCode handles PUT /api/v1/sessions/{id}/code — student updates their code.
func (h *SessionStudentHandler) UpdateCode(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[updateCodeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	student, err := h.sessionStudents.UpdateCode(r.Context(), sessionID, authUser.ID, req.Code)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session student not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if err := h.publisher.CodeUpdated(r.Context(), sessionID.String(), authUser.ID.String(), req.Code); err != nil {
		h.logger.Error("failed to publish code_updated", "error", err, "session_id", sessionID)
	}

	httputil.WriteJSON(w, http.StatusOK, student)
}

// ListStudents handles GET /api/v1/sessions/{id}/students — list all students in a session.
func (h *SessionStudentHandler) ListStudents(w http.ResponseWriter, r *http.Request) {
	if auth.UserFromContext(r.Context()) == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	students, err := h.sessionStudents.ListSessionStudents(r.Context(), sessionID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if students == nil {
		students = []store.SessionStudent{}
	}

	httputil.WriteJSON(w, http.StatusOK, students)
}
