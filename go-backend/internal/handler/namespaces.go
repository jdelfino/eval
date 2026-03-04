package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	custommw "github.com/jdelfino/eval/go-backend/internal/middleware"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// NamespaceHandler handles namespace management routes.
type NamespaceHandler struct{}

// NewNamespaceHandler creates a new NamespaceHandler.
func NewNamespaceHandler() *NamespaceHandler {
	return &NamespaceHandler{}
}

// Routes returns a chi.Router with namespace routes mounted.
func (h *NamespaceHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)

	r.Route("/{id}", func(r chi.Router) {
		r.Get("/", h.Get)

		// Namespace sub-resources (namespace-admin+)
		r.Group(func(r chi.Router) {
			r.Use(custommw.RequirePermission(auth.PermNamespaceManage))
			r.Get("/users", h.ListUsers)
			r.Get("/capacity", h.GetCapacity)
		})

		// System-admin only
		r.Group(func(r chi.Router) {
			r.Use(custommw.RequirePermission(auth.PermSystemAdmin))
			r.Patch("/", h.Update)
			r.Delete("/", h.Delete)
			r.Put("/capacity", h.UpdateCapacity)
		})
	})

	// System-admin only: create
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequirePermission(auth.PermSystemAdmin))
		r.Post("/", h.Create)
	})

	return r
}

// List handles GET /api/v1/namespaces — returns all namespaces visible to the user.
func (h *NamespaceHandler) List(w http.ResponseWriter, r *http.Request) {
	repos := store.ReposFromContext(r.Context())
	namespaces, err := repos.ListNamespaces(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if namespaces == nil {
		namespaces = []store.Namespace{}
	}

	httputil.WriteJSON(w, http.StatusOK, namespaces)
}

// Get handles GET /api/v1/namespaces/{id} — returns a single namespace.
func (h *NamespaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	repos := store.ReposFromContext(r.Context())
	ns, err := repos.GetNamespace(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "namespace not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, ns)
}

// createNamespaceRequest is the request body for POST /namespaces.
type createNamespaceRequest struct {
	ID             string `json:"id" validate:"required,min=1,max=63"`
	DisplayName    string `json:"display_name" validate:"required,min=1,max=255"`
	MaxInstructors *int   `json:"max_instructors" validate:"omitempty,gte=0"`
	MaxStudents    *int   `json:"max_students" validate:"omitempty,gte=0"`
}

// Create handles POST /api/v1/namespaces — creates a new namespace (system-admin only).
func (h *NamespaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[createNamespaceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	ns, err := repos.CreateNamespace(r.Context(), store.CreateNamespaceParams{
		ID:             req.ID,
		DisplayName:    req.DisplayName,
		MaxInstructors: req.MaxInstructors,
		MaxStudents:    req.MaxStudents,
		CreatedBy:      &authUser.ID,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, ns)
}

// updateNamespaceRequest is the request body for PATCH /namespaces/{id}.
type updateNamespaceRequest struct {
	DisplayName    *string `json:"display_name" validate:"omitempty,min=1,max=255"`
	Active         *bool   `json:"active"`
	MaxInstructors *int    `json:"max_instructors" validate:"omitempty,gte=0"`
	MaxStudents    *int    `json:"max_students" validate:"omitempty,gte=0"`
}

// Update handles PATCH /api/v1/namespaces/{id} — updates a namespace (system-admin only).
func (h *NamespaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	req, err := httpbind.BindJSON[updateNamespaceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	ns, err := repos.UpdateNamespace(r.Context(), id, store.UpdateNamespaceParams{
		DisplayName:    req.DisplayName,
		Active:         req.Active,
		MaxInstructors: req.MaxInstructors,
		MaxStudents:    req.MaxStudents,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "namespace not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, ns)
}

// Delete handles DELETE /api/v1/namespaces/{id} — permanently deletes a namespace (system-admin only).
// FK CASCADE removes all related records (users, classes, sections, etc.).
func (h *NamespaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	repos := store.ReposFromContext(r.Context())
	err := repos.DeleteNamespace(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "namespace not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// requireNamespaceAccess checks that non-system-admin callers belong to the given namespace.
// Returns true if access is allowed, false if a 403 was written.
func requireNamespaceAccess(w http.ResponseWriter, r *http.Request, namespaceID string) bool {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return false
	}
	if authUser.Role != auth.RoleSystemAdmin && authUser.NamespaceID != namespaceID {
		httputil.WriteError(w, http.StatusForbidden, "access denied: namespace mismatch")
		return false
	}
	return true
}

// ListUsers handles GET /api/v1/namespaces/{id}/users — list users in a namespace (namespace-admin+).
func (h *NamespaceHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if !requireNamespaceAccess(w, r, id) {
		return
	}

	repos := store.ReposFromContext(r.Context())
	users, err := repos.ListUsers(r.Context(), store.UserFilters{NamespaceID: &id})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if users == nil {
		users = []store.User{}
	}

	httputil.WriteJSON(w, http.StatusOK, users)
}

// capacityResponse is the response for GET /namespaces/{id}/capacity.
type capacityResponse struct {
	MaxInstructors *int           `json:"max_instructors"`
	MaxStudents    *int           `json:"max_students"`
	CurrentCounts  map[string]int `json:"current_counts"`
}

// GetCapacity handles GET /api/v1/namespaces/{id}/capacity — namespace limits + current counts (namespace-admin+).
func (h *NamespaceHandler) GetCapacity(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if !requireNamespaceAccess(w, r, id) {
		return
	}

	repos := store.ReposFromContext(r.Context())
	ns, err := repos.GetNamespace(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "namespace not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	counts, err := repos.CountUsersByRole(r.Context(), id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, capacityResponse{
		MaxInstructors: ns.MaxInstructors,
		MaxStudents:    ns.MaxStudents,
		CurrentCounts:  counts,
	})
}

// updateCapacityRequest is the request body for PUT /namespaces/{id}/capacity.
type updateCapacityRequest struct {
	MaxInstructors *int `json:"max_instructors" validate:"omitempty,gte=0"`
	MaxStudents    *int `json:"max_students" validate:"omitempty,gte=0"`
}

// UpdateCapacity handles PUT /api/v1/namespaces/{id}/capacity — update capacity limits (system-admin only).
func (h *NamespaceHandler) UpdateCapacity(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if !requireNamespaceAccess(w, r, id) {
		return
	}

	req, err := httpbind.BindJSON[updateCapacityRequest](w, r)
	if err != nil {
		return
	}

	repos := store.ReposFromContext(r.Context())
	ns, err := repos.UpdateNamespace(r.Context(), id, store.UpdateNamespaceParams{
		MaxInstructors: req.MaxInstructors,
		MaxStudents:    req.MaxStudents,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "namespace not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, ns)
}
