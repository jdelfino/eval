package handler

import (
	"net/http"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// DashboardHandler handles the instructor dashboard endpoint.
type DashboardHandler struct{}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler() *DashboardHandler {
	return &DashboardHandler{}
}

// dashboardResponse wraps the classes array for the frontend.
type dashboardResponse struct {
	Classes []store.DashboardClass `json:"classes"`
}

// Dashboard handles GET /api/v1/instructor/dashboard — returns classes with sections
// (student counts, active session IDs) for the authenticated instructor.
func (h *DashboardHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	repos := store.ReposFromContext(r.Context())
	classes, err := repos.InstructorDashboard(r.Context(), user.ID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if classes == nil {
		classes = []store.DashboardClass{}
	}

	httputil.WriteJSON(w, http.StatusOK, dashboardResponse{Classes: classes})
}
