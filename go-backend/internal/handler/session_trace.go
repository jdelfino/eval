package handler

import (
	"context"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/executor"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/pkg/httputil"
)

// TracerClient is the interface for sending trace requests to the executor.
type TracerClient interface {
	Trace(ctx context.Context, req executor.TraceRequest) (*executor.TraceResponse, error)
}

// standaloneTraceRequest is the request body for POST /trace.
type standaloneTraceRequest struct {
	Code     string `json:"code" validate:"required"`
	Stdin    string `json:"stdin"`
	MaxSteps *int   `json:"max_steps,omitempty"`
}

// TraceHandler handles debugger trace requests.
type TraceHandler struct {
	tracer TracerClient
}

// NewTraceHandler creates a new TraceHandler.
// Rate limiting is applied at the middleware level via ForCategory.
func NewTraceHandler(tracer TracerClient) *TraceHandler {
	return &TraceHandler{
		tracer: tracer,
	}
}

// StandaloneTrace handles POST /api/v1/trace.
// Any authenticated user can trace code — no session context needed.
func (h *TraceHandler) StandaloneTrace(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[standaloneTraceRequest](w, r)
	if err != nil {
		return
	}

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
