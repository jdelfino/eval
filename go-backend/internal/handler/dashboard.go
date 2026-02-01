package handler

import (
	"net/http"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// DashboardHandler handles the instructor dashboard endpoint.
type DashboardHandler struct {
	dashboard store.DashboardRepository
}

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(dashboard store.DashboardRepository) *DashboardHandler {
	return &DashboardHandler{dashboard: dashboard}
}

// Dashboard handles GET /api/v1/instructor/dashboard — returns classes with sections
// (student counts, active session IDs) for the authenticated instructor.
func (h *DashboardHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	classes, err := h.dashboard.InstructorDashboard(r.Context(), user.ID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if classes == nil {
		classes = []store.DashboardClass{}
	}

	httputil.WriteJSON(w, http.StatusOK, classes)
}
