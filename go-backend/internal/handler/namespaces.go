package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/internal/auth"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// NamespaceHandler handles namespace management routes.
type NamespaceHandler struct {
	namespaces store.NamespaceRepository
}

// NewNamespaceHandler creates a new NamespaceHandler with the given repository.
func NewNamespaceHandler(namespaces store.NamespaceRepository) *NamespaceHandler {
	return &NamespaceHandler{namespaces: namespaces}
}

// Routes returns a chi.Router with namespace routes mounted.
func (h *NamespaceHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.Get("/", h.List)
	r.Get("/{id}", h.Get)

	// System-admin only routes
	r.Group(func(r chi.Router) {
		r.Use(custommw.RequireRole(auth.RoleSystemAdmin))
		r.Post("/", h.Create)
		r.Patch("/{id}", h.Update)
	})

	return r
}

// List handles GET /api/v1/namespaces — returns all namespaces visible to the user.
func (h *NamespaceHandler) List(w http.ResponseWriter, r *http.Request) {
	namespaces, err := h.namespaces.ListNamespaces(r.Context())
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

	ns, err := h.namespaces.GetNamespace(r.Context(), id)
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

	req, err := httputil.BindJSON[createNamespaceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	ns, err := h.namespaces.CreateNamespace(r.Context(), store.CreateNamespaceParams{
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

	req, err := httputil.BindJSON[updateNamespaceRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	ns, err := h.namespaces.UpdateNamespace(r.Context(), id, store.UpdateNamespaceParams{
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
