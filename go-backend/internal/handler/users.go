package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/httpbind"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// UserHandler handles user management routes.
type UserHandler struct{}

// NewUserHandler creates a new UserHandler.
func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

// SystemRoutes returns a chi.Router with system-level user routes (system-admin only).
func (h *UserHandler) SystemRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequirePermission(auth.PermSystemAdmin))

	r.Get("/", h.ListSystem)
	r.Put("/{id}", h.UpdateAdmin)
	r.Delete("/{id}", h.Delete)

	return r
}

// NamespaceRoutes returns a chi.Router with namespace-level user routes (namespace-admin+).
func (h *UserHandler) NamespaceRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequirePermission(auth.PermUserManage))

	r.Get("/", h.ListNamespace)
	r.Delete("/{id}", h.DeleteNamespaceScoped)
	r.Put("/{id}/role", h.UpdateRole)

	return r
}

// ListSystem handles GET /api/v1/system/users — list all users (system-admin only).
func (h *UserHandler) ListSystem(w http.ResponseWriter, r *http.Request) {
	filters := store.UserFilters{}
	if role := r.URL.Query().Get("role"); role != "" {
		filters.Role = &role
	}
	if ns := r.URL.Query().Get("namespace_id"); ns != "" {
		filters.NamespaceID = &ns
	}

	repos := store.ReposFromContext(r.Context())
	users, err := repos.ListUsers(r.Context(), filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if users == nil {
		users = []store.User{}
	}

	httputil.WriteJSON(w, http.StatusOK, users)
}

// ListNamespace handles GET /api/v1/admin/users — list users in caller's namespace.
func (h *UserHandler) ListNamespace(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	repos := store.ReposFromContext(r.Context())
	nsID := authUser.NamespaceID
	users, err := repos.ListUsers(r.Context(), store.UserFilters{NamespaceID: &nsID})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if users == nil {
		users = []store.User{}
	}

	httputil.WriteJSON(w, http.StatusOK, users)
}

// updateUserAdminRequest is the request body for PUT /system/users/{id}.
type updateUserAdminRequest struct {
	Email       *string `json:"email" validate:"omitempty,email"`
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
	Role        *string `json:"role" validate:"omitempty,oneof=system-admin namespace-admin instructor student"`
	NamespaceID *string `json:"namespace_id" validate:"omitempty"`
}

// UpdateAdmin handles PUT /api/v1/system/users/{id} — admin update user (system-admin only).
func (h *UserHandler) UpdateAdmin(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	req, err := httpbind.BindJSON[updateUserAdminRequest](w, r)
	if err != nil {
		return
	}

	repos := store.ReposFromContext(r.Context())
	user, err := repos.UpdateUserAdmin(r.Context(), id, store.UpdateUserAdminParams{
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Role:        req.Role,
		NamespaceID: req.NamespaceID,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, user)
}

// Delete handles DELETE /api/v1/{system,admin}/users/{id} — delete a user.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())
	err := repos.DeleteUser(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// DeleteNamespaceScoped handles DELETE /api/v1/admin/users/{id} — delete a user within caller's namespace.
func (h *UserHandler) DeleteNamespaceScoped(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())

	// Verify target user is in the caller's namespace
	target, err := repos.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if target.NamespaceID == nil || *target.NamespaceID != authUser.NamespaceID {
		httputil.WriteError(w, http.StatusForbidden, "user is not in your namespace")
		return
	}

	err = repos.DeleteUser(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// updateRoleRequest is the request body for PUT /admin/users/{id}/role.
type updateRoleRequest struct {
	Role string `json:"role" validate:"required,oneof=namespace-admin instructor student"`
}

// UpdateRole handles PUT /api/v1/admin/users/{id}/role — change user role (namespace-admin+).
func (h *UserHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id, ok := httpbind.ParseUUIDParam(w, r, "id")
	if !ok {
		return
	}

	repos := store.ReposFromContext(r.Context())

	// Verify target user is in the caller's namespace
	target, err := repos.GetUserByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if target.NamespaceID == nil || *target.NamespaceID != authUser.NamespaceID {
		httputil.WriteError(w, http.StatusForbidden, "user is not in your namespace")
		return
	}

	req, err := httpbind.BindJSON[updateRoleRequest](w, r)
	if err != nil {
		return
	}

	user, err := repos.UpdateUserAdmin(r.Context(), id, store.UpdateUserAdminParams{
		Role: &req.Role,
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "user not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, user)
}
