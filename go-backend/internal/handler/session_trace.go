package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/executor"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// TracerClient is the interface for sending trace requests to the executor.
type TracerClient interface {
	Trace(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error)
}

// traceHTTPRequest is the request body for POST /sessions/{id}/trace.
type traceHTTPRequest struct {
	StudentID uuid.UUID `json:"student_id" validate:"required"`
	Code      string    `json:"code" validate:"required"`
}

// TraceHandler handles debugger trace requests for sessions.
type TraceHandler struct {
	sessions store.SessionRepository
	tracer   TracerClient
}

// NewTraceHandler creates a new TraceHandler.
func NewTraceHandler(sessions store.SessionRepository, tracer TracerClient) *TraceHandler {
	return &TraceHandler{
		sessions: sessions,
		tracer:   tracer,
	}
}

// Trace handles POST /api/v1/sessions/{id}/trace.
func (h *TraceHandler) Trace(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Instructor+ only
	if authUser.Role == auth.RoleStudent {
		httputil.WriteError(w, http.StatusForbidden, "instructor or higher role required")
		return
	}

	sessionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[traceHTTPRequest](w, r)
	if err != nil {
		return
	}

	// Look up session
	session, err := h.sessions.GetSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "session not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Check user is creator or participant
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "you are not a participant in this session")
		return
	}

	// Validate student_id is a participant
	if !isCreatorOrParticipant(req.StudentID, session) {
		httputil.WriteError(w, http.StatusBadRequest, "student_id is not a participant in this session")
		return
	}

	// Call executor trace
	traceResp, err := h.tracer.Trace(r.Context(), executor.TraceRequest{Code: req.Code})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "trace execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, traceResp)
}
