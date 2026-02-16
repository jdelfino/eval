package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
	"github.com/jdelfino/eval/pkg/ratelimit"
)

// analyzeHTTPRequest is the request body for POST /sessions/{id}/analyze.
type analyzeHTTPRequest struct {
	StudentID          uuid.UUID `json:"student_id" validate:"required"`
	Code               string    `json:"code" validate:"required"`
	ProblemDescription string    `json:"problem_description"`
}

// AnalyzeHandler handles AI analysis requests for session code.
type AnalyzeHandler struct {
	aiClient ai.Client
	limiter  ratelimit.Limiter
}

// NewAnalyzeHandler creates a new AnalyzeHandler.
// The limiter is used for daily rate limit checks (global and per-user).
// If limiter is nil, daily rate limiting is skipped.
func NewAnalyzeHandler(aiClient ai.Client, limiter ratelimit.Limiter) *AnalyzeHandler {
	return &AnalyzeHandler{
		aiClient: aiClient,
		limiter:  limiter,
	}
}

// Analyze handles POST /api/v1/sessions/{id}/analyze.
func (h *AnalyzeHandler) Analyze(w http.ResponseWriter, r *http.Request) {
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

	// Daily rate limit checks (global and per-user)
	if h.limiter != nil {
		ctx := r.Context()
		userID := authUser.ID.String()

		// Check global daily limit first
		result, err := h.limiter.Allow(ctx, "analyzeGlobal", "global")
		if err != nil {
			slog.Warn("analyze global rate limit check failed, allowing request",
				"error", err,
			)
		} else if result != nil && !result.Allowed {
			httputil.WriteError(w, http.StatusTooManyRequests, "Global daily analysis limit reached. Please try again tomorrow.")
			return
		}

		// Check per-user daily limit
		result, err = h.limiter.Allow(ctx, "analyzeDaily", userID)
		if err != nil {
			slog.Warn("analyze daily rate limit check failed, allowing request",
				"error", err,
				"user_id", userID,
			)
		} else if result != nil && !result.Allowed {
			httputil.WriteError(w, http.StatusTooManyRequests, "Daily analysis limit reached (100 per day). Please try again tomorrow.")
			return
		}
	}

	sessionID, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[analyzeHTTPRequest](w, r)
	if err != nil {
		return
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
	if !isCreatorOrParticipant(req.StudentID, session) {
		httputil.WriteError(w, http.StatusBadRequest, "student_id is not a participant in this session")
		return
	}

	// Call AI client
	aiResp, err := h.aiClient.AnalyzeCode(r.Context(), ai.AnalyzeRequest{
		Code:               req.Code,
		ProblemDescription: req.ProblemDescription,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "AI analysis failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, aiResp)
}
