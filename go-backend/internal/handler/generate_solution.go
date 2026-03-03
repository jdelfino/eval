package handler

import (
	"net/http"

	"github.com/jdelfino/eval/go-backend/internal/ai"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/pkg/httputil"
)

// GenerateSolutionHandler handles the AI solution generation route.
type GenerateSolutionHandler struct {
	aiClient ai.Client
}

// NewGenerateSolutionHandler creates a new GenerateSolutionHandler.
func NewGenerateSolutionHandler(aiClient ai.Client) *GenerateSolutionHandler {
	return &GenerateSolutionHandler{aiClient: aiClient}
}

// generateSolutionRequest is the request body for POST /problems/generate-solution.
type generateSolutionRequest struct {
	Description        string `json:"description" validate:"required,min=1"`
	StarterCode        string `json:"starter_code"`
	CustomInstructions string `json:"custom_instructions"`
}

// generateSolutionResponse is the response body for POST /problems/generate-solution.
type generateSolutionResponse struct {
	Solution string `json:"solution"`
}

// GenerateSolution handles POST /api/v1/problems/generate-solution — generates a solution using AI.
// Authentication and authorization (instructor+) are enforced by the RequirePermission middleware
// applied at the route level in server.go.
func (h *GenerateSolutionHandler) GenerateSolution(w http.ResponseWriter, r *http.Request) {
	req, err := httpbind.BindJSON[generateSolutionRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	aiResp, err := h.aiClient.GenerateSolution(r.Context(), ai.GenerateSolutionRequest{
		ProblemDescription: req.Description,
		StarterCode:        req.StarterCode,
		CustomInstructions: req.CustomInstructions,
	})
	if err != nil {
		httputil.WriteInternalError(w, r, err, "AI solution generation failed")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, generateSolutionResponse{Solution: aiResp.Solution})
}
