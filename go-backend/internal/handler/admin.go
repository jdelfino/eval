package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// AdminHandler handles admin-only routes.
type AdminHandler struct{}

// NewAdminHandler creates a new AdminHandler.
func NewAdminHandler() *AdminHandler {
	return &AdminHandler{}
}

// Routes returns a chi.Router with admin routes (system-admin only).
func (h *AdminHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequireRole(auth.RoleSystemAdmin))

	r.Get("/stats", h.Stats)
	r.Get("/audit", h.AuditLog)
	r.Post("/clear-data", h.ClearData)

	return r
}

// Stats handles GET /api/v1/admin/stats.
func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	repos := store.ReposFromContext(r.Context())
	stats, err := repos.AdminStats(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to retrieve stats")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, stats)
}

// AuditLog handles GET /api/v1/admin/audit.
func (h *AdminHandler) AuditLog(w http.ResponseWriter, r *http.Request) {
	filters := store.AuditLogFilters{
		Limit:  50,
		Offset: 0,
	}

	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			filters.Limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			filters.Offset = n
		}
	}
	if v := r.URL.Query().Get("action"); v != "" {
		filters.Action = &v
	}
	if v := r.URL.Query().Get("actor_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			filters.ActorID = &id
		}
	}

	repos := store.ReposFromContext(r.Context())
	logs, err := repos.ListAuditLogs(r.Context(), filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to retrieve audit logs")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, logs)
}

// ClearData handles POST /api/v1/admin/clear-data.
func (h *AdminHandler) ClearData(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	repos := store.ReposFromContext(r.Context())
	if err := repos.ClearData(r.Context(), user.ID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to clear data")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}
