package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// analyzeHTTPRequest is the request body for POST /sessions/{id}/analyze.
// Only model and custom_prompt are accepted; submissions are fetched server-side.
type analyzeHTTPRequest struct {
	Model        string `json:"model"`
	CustomPrompt string `json:"custom_prompt"`
}

// analyzeScript is the WalkthroughScript-shaped envelope returned by the handler.
type analyzeScript struct {
	SessionID          string             `json:"session_id"`
	Issues             []ai.AnalysisIssue `json:"issues"`
	Summary            ai.AnalysisSummary `json:"summary"`
	OverallNote        string             `json:"overall_note,omitempty"`
	FinishedStudentIDs []string           `json:"finished_student_ids"`
	GeneratedAt        time.Time          `json:"generated_at"`
}

// analyzeHTTPResponse is the JSON envelope wrapping the script.
type analyzeHTTPResponse struct {
	Script analyzeScript `json:"script"`
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
		httputil.WriteInternalError(w, r, err, "internal error")
		return
	}

	// Check user is creator or participant
	if !isCreatorOrParticipant(authUser.ID, session) {
		httputil.WriteError(w, http.StatusForbidden, "you are not a participant in this session")
		return
	}

	// Fetch students server-side
	students, err := repos.ListSessionStudents(r.Context(), sessionID)
	if err != nil {
		httputil.WriteInternalError(w, r, err, "failed to list session students")
		return
	}

	// Convert students to AI submissions
	submissions := make([]ai.StudentSubmission, len(students))
	for i, s := range students {
		submissions[i] = ai.StudentSubmission{
			UserID: s.UserID.String(),
			Name:   s.Name,
			Code:   s.Code,
		}
	}

	// Extract problem description from session.Problem JSON
	problemDescription := extractProblemDescription(session.Problem)

	// Call AI client
	aiResp, err := h.aiClient.AnalyzeCode(r.Context(), ai.AnalyzeRequest{
		ProblemDescription: problemDescription,
		Submissions:        submissions,
		Model:              req.Model,
		CustomPrompt:       req.CustomPrompt,
	})
	if err != nil {
		httputil.WriteInternalError(w, r, err, "AI analysis failed")
		return
	}

	// Build wrapped response
	resp := analyzeHTTPResponse{
		Script: analyzeScript{
			SessionID:          sessionID.String(),
			Issues:             aiResp.Issues,
			Summary:            aiResp.Summary,
			OverallNote:        aiResp.OverallNote,
			FinishedStudentIDs: aiResp.FinishedStudentIDs,
			GeneratedAt:        time.Now().UTC(),
		},
	}

	httputil.WriteJSON(w, http.StatusOK, resp)
}

// extractProblemDescription parses the problem JSON and extracts the "description" field.
// Returns empty string if the field is missing or the JSON is invalid.
func extractProblemDescription(problemJSON json.RawMessage) string {
	if len(problemJSON) == 0 {
		return ""
	}
	var problem struct {
		Description string `json:"description"`
	}
	if err := json.Unmarshal(problemJSON, &problem); err != nil {
		return ""
	}
	return problem.Description
}
