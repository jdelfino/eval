package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/httpbind"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// AuthHandler handles authentication-related routes for the current user.
type AuthHandler struct{}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

// Routes returns a chi.Router with authenticated auth routes.
// These routes require both auth middleware and RLS middleware.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/me", h.GetMe)
	r.Put("/me", h.UpdateMe)
	return r
}

// RegistrationRoutes returns a chi.Router with registration routes.
// These routes do NOT require auth middleware; they use RegistrationStoreMiddleware
// which sets app.role = 'registration' for limited RLS access.
func (h *AuthHandler) RegistrationRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/accept-invite", h.GetAcceptInvite)
	r.Post("/accept-invite", h.PostAcceptInvite)
	r.Get("/register-student", h.GetRegisterStudent)
	r.Post("/register-student", h.PostRegisterStudent)
	r.Post("/bootstrap", h.PostBootstrap)
	return r
}

// GetMe returns the current authenticated user's profile.
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	repos := store.ReposFromContext(r.Context())
	user, err := repos.GetUserByID(r.Context(), authUser.ID)
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

	req, err := httpbind.BindJSON[updateMeRequest](w, r)
	if err != nil {
		return // BindJSON already wrote the error response
	}

	repos := store.ReposFromContext(r.Context())
	user, err := repos.UpdateUser(r.Context(), authUser.ID, store.UpdateUserParams{
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

// GetAcceptInvite returns invitation details for the given token.
func (h *AuthHandler) GetAcceptInvite(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		httputil.WriteError(w, http.StatusBadRequest, "token is required")
		return
	}

	invID, err := uuid.Parse(token)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid token format")
		return
	}

	repos := store.ReposFromContext(r.Context())
	inv, err := repos.GetInvitation(r.Context(), invID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invitation not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if inv.Status != "pending" {
		httputil.WriteError(w, http.StatusGone, "invitation is no longer pending")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, inv)
}

// acceptInviteRequest is the request body for POST /auth/accept-invite.
type acceptInviteRequest struct {
	Token       string  `json:"token" validate:"required,uuid"`
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
}

// PostAcceptInvite creates a user profile and consumes the invitation.
// The user's external_id comes from JWT claims (not request body) for security.
func (h *AuthHandler) PostAcceptInvite(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[acceptInviteRequest](w, r)
	if err != nil {
		return
	}

	invID, _ := uuid.Parse(req.Token) // validated by struct tag

	repos := store.ReposFromContext(r.Context())
	inv, err := repos.GetInvitation(r.Context(), invID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invitation not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if inv.Status != "pending" {
		httputil.WriteError(w, http.StatusGone, "invitation is no longer pending")
		return
	}

	// Use external_id from JWT claims (not request body) to prevent impersonation
	user, err := repos.CreateUser(r.Context(), store.CreateUserParams{
		ExternalID:  claims.Subject,
		Email:       inv.Email,
		Role:        inv.TargetRole,
		NamespaceID: &inv.NamespaceID,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if _, err := repos.ConsumeInvitation(r.Context(), invID, user.ID); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to consume invitation")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, user)
}

// registerStudentInfoResponse is the response for GET /auth/register-student.
type registerStudentInfoResponse struct {
	Section *store.Section `json:"section"`
	Class   *store.Class   `json:"class"`
}

// GetRegisterStudent validates a join code and returns section/class info.
func (h *AuthHandler) GetRegisterStudent(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		httputil.WriteError(w, http.StatusBadRequest, "code is required")
		return
	}

	repos := store.ReposFromContext(r.Context())
	section, err := repos.GetSectionByJoinCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invalid join code")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !section.Active {
		httputil.WriteError(w, http.StatusGone, "section is no longer active")
		return
	}

	class, err := repos.GetClass(r.Context(), section.ClassID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, registerStudentInfoResponse{
		Section: section,
		Class:   class,
	})
}

// registerStudentRequest is the request body for POST /auth/register-student.
type registerStudentRequest struct {
	JoinCode    string  `json:"join_code" validate:"required"`
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
}

// PostRegisterStudent creates a student user and enrolls them in a section.
// The user's external_id and email come from JWT claims (not request body) for security.
func (h *AuthHandler) PostRegisterStudent(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[registerStudentRequest](w, r)
	if err != nil {
		return
	}

	repos := store.ReposFromContext(r.Context())
	section, err := repos.GetSectionByJoinCode(r.Context(), req.JoinCode)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invalid join code")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !section.Active {
		httputil.WriteError(w, http.StatusGone, "section is no longer active")
		return
	}

	// Use external_id and email from JWT claims (not request body) to prevent impersonation
	user, err := repos.CreateUser(r.Context(), store.CreateUserParams{
		ExternalID:  claims.Subject,
		Email:       claims.Email,
		Role:        "student",
		NamespaceID: &section.NamespaceID,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if _, err := repos.CreateMembership(r.Context(), store.CreateMembershipParams{
		UserID:    user.ID,
		SectionID: section.ID,
		Role:      "student",
	}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create membership")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, user)
}

// PostBootstrap creates the initial system-admin user from a JWT with a
// custom "role" claim set by the bootstrap CLI via Firebase Admin SDK.
// This is a one-time setup endpoint for first deploy.
func (h *AuthHandler) PostBootstrap(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Verify the custom claim set by the bootstrap CLI.
	role, _ := claims.CustomClaims["role"].(string)
	if role != string(auth.RoleSystemAdmin) {
		httputil.WriteError(w, http.StatusForbidden, "missing system-admin custom claim")
		return
	}

	repos := store.ReposFromContext(r.Context())
	user, err := repos.CreateUser(r.Context(), store.CreateUserParams{
		ExternalID: claims.Subject,
		Email:      claims.Email,
		Role:       string(auth.RoleSystemAdmin),
	})
	if err != nil {
		if errors.Is(store.HandleDuplicate(err), store.ErrDuplicate) {
			httputil.WriteError(w, http.StatusConflict, "system admin already exists")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, user)
}
