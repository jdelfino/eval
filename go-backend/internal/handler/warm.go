package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/pkg/httputil"
)

// ActivationService is the interface for signaling executor demand.
type ActivationService interface {
	SignalDemand(ctx context.Context) error
}

// WarmHandler handles POST /api/v1/executor/warm — proactive executor warming.
type WarmHandler struct {
	activation ActivationService
}

// NewWarmHandler creates a new WarmHandler. If svc is nil, SignalDemand is skipped.
func NewWarmHandler(svc ActivationService) *WarmHandler {
	return &WarmHandler{activation: svc}
}

// Warm handles POST /api/v1/executor/warm.
// Any authenticated user can call this endpoint. It signals executor demand
// so that KEDA can scale the executor from zero before the student submits code.
//
// Returns 200 with an empty JSON object regardless of Redis errors — warming
// is best-effort and must not block the caller.
func (h *WarmHandler) Warm(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	if h.activation != nil {
		if err := h.activation.SignalDemand(r.Context()); err != nil {
			// Best-effort: log the error but don't fail the request.
			slog.Error("activation: SignalDemand failed in warm handler", "error", err)
		}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]any{})
}
