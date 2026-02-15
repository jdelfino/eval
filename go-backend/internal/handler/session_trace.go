package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// TracerClient is the interface for sending trace requests to the executor.
type TracerClient interface {
	Trace(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error)
}

// traceHTTPRequest is the request body for POST /sessions/{id}/trace.
type traceHTTPRequest struct {
	StudentID *uuid.UUID `json:"student_id"` // optional; defaults to caller's own ID
	Code      string     `json:"code" validate:"required"`
	Stdin     string     `json:"stdin"`
	MaxSteps  *int       `json:"max_steps,omitempty"`
}

// TraceHandler handles debugger trace requests for sessions.
type TraceHandler struct {
	tracer TracerClient
}

// NewTraceHandler creates a new TraceHandler.
func NewTraceHandler(tracer TracerClient) *TraceHandler {
	return &TraceHandler{
		tracer: tracer,
	}
}

// Trace handles POST /api/v1/sessions/{id}/trace.
func (h *TraceHandler) Trace(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[traceHTTPRequest](w, r)
	if err != nil {
		return
	}

	// Default student_id to caller's own ID (students tracing their own code).
	studentID := authUser.ID
	if req.StudentID != nil {
		studentID = *req.StudentID
	}

	repos := store.ReposFromContext(r.Context())
	// Look up session
	session, err := repos.GetSession(r.Context(), sessionID)
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
	if !isCreatorOrParticipant(studentID, session) {
		httputil.WriteError(w, http.StatusBadRequest, "student_id is not a participant in this session")
		return
	}

	// Call executor trace
	traceResp, err := h.tracer.Trace(r.Context(), executor.TraceRequest{
		Code:     req.Code,
		Stdin:    req.Stdin,
		MaxSteps: req.MaxSteps,
	})
	if err != nil {
		httputil.WriteInternalError(w, r, err, "trace execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, traceResp)
}
