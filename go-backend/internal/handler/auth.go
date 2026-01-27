package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// AuthHandler handles authentication-related routes for the current user.
type AuthHandler struct {
	users store.UserRepository
}

// NewAuthHandler creates a new AuthHandler with the given user repository.
func NewAuthHandler(users store.UserRepository) *AuthHandler {
	return &AuthHandler{users: users}
}

// Routes returns a chi.Router with the auth routes mounted.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/me", h.GetMe)
	r.Put("/me", h.UpdateMe)
	return r
}

// GetMe returns the current authenticated user's profile.
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	user, err := h.users.GetUserByID(r.Context(), authUser.ID)
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

// updateMeRequest is the request body for PUT /auth/me.
type updateMeRequest struct {
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
}

// UpdateMe updates the current authenticated user's profile.
func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httputil.BindJSON[updateMeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	user, err := h.users.UpdateUser(r.Context(), authUser.ID, store.UpdateUserParams{
		DisplayName: req.DisplayName,
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
