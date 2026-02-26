package handler

import (
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// analyzeHTTPRequest is the request body for POST /sessions/{id}/analyze.
type analyzeHTTPRequest struct {
	ProblemDescription string `json:"problem_description"`
	Submissions        []struct {
		UserID string `json:"user_id" validate:"required"`
		Name   string `json:"name"`
		Code   string `json:"code"`
	} `json:"submissions" validate:"required"`
	Model        string `json:"model"`
	CustomPrompt string `json:"custom_prompt"`
}

// AnalyzeHandler handles AI analysis requests for session code.
type AnalyzeHandler struct {
	aiClient ai.Client
}

// NewAnalyzeHandler creates a new AnalyzeHandler.
// Rate limiting is applied at the middleware level via ForCategory.
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

	// Convert submissions and validate each student is a participant
	submissions := make([]ai.StudentSubmission, 0, len(req.Submissions))
	for _, s := range req.Submissions {
		studentID, parseErr := uuid.Parse(s.UserID)
		if parseErr != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid user_id in submissions")
			return
		}
		if !isCreatorOrParticipant(studentID, session) {
			httputil.WriteError(w, http.StatusBadRequest, "a submission user_id is not a participant in this session")
			return
		}
		submissions = append(submissions, ai.StudentSubmission{
			UserID: s.UserID,
			Name:   s.Name,
			Code:   s.Code,
		})
	}

	// Call AI client
	aiResp, err := h.aiClient.AnalyzeCode(r.Context(), ai.AnalyzeRequest{
		ProblemDescription: req.ProblemDescription,
		Submissions:        submissions,
		Model:              req.Model,
		CustomPrompt:       req.CustomPrompt,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "AI analysis failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, aiResp)
}
