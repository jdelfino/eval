package handler

import (
	"context"
	"log/slog"
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
	Code       string             `json:"code" validate:"required"`
	Language   string             `json:"language,omitempty"`
	Stdin      string             `json:"stdin"`
	Files      []executor.File `json:"files,omitempty"`
	RandomSeed *int               `json:"random_seed,omitempty"`
	MaxSteps   *int               `json:"max_steps,omitempty"`
}

// TraceHandler handles debugger trace requests.
type TraceHandler struct {
	tracer     TracerClient
	activation ActivationService
}

// NewTraceHandler creates a new TraceHandler.
// Rate limiting is applied at the middleware level via ForCategory.
func NewTraceHandler(tracer TracerClient) *TraceHandler {
	return &TraceHandler{
		tracer: tracer,
	}
}

// SetActivation attaches an ActivationService to the handler.
// Must be called before the handler serves requests.
func (h *TraceHandler) SetActivation(svc ActivationService) {
	h.activation = svc
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

	lang, err := normalizeLanguage(req.Language)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Signal executor demand so KEDA can scale from zero.
	if h.activation != nil {
		ctx := context.WithoutCancel(r.Context())
		go func() {
			if err := h.activation.SignalDemand(ctx); err != nil {
				slog.Error("activation: SignalDemand failed", "handler", "trace.StandaloneTrace", "error", err)
			}
		}()
	}

	traceResp, err := h.tracer.Trace(r.Context(), executor.TraceRequest{
		Code:       req.Code,
		Language:   lang,
		Stdin:      req.Stdin,
		Files:      req.Files,
		RandomSeed: req.RandomSeed,
		MaxSteps:   req.MaxSteps,
	})
	if err != nil {
		writeExecutorError(w, r, err, "trace execution failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, traceResp)
}
