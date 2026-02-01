package handler

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/ai"
	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
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
}

// NewAnalyzeHandler creates a new AnalyzeHandler.
func NewAnalyzeHandler(aiClient ai.Client) *AnalyzeHandler {
	return &AnalyzeHandler{
		aiClient: aiClient,
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

	sessionID, ok := httputil.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httputil.BindJSON[analyzeHTTPRequest](w, r)
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
