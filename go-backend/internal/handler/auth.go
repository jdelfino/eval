package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/httpbind"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// AuthHandler handles authentication-related routes for the current user.
type AuthHandler struct {
	bootstrapAdminEmail string
}

// NewAuthHandler creates a new AuthHandler.
// bootstrapAdminEmail is the email address authorized to bootstrap the first system admin.
// If empty, bootstrap is disabled.
func NewAuthHandler(bootstrapAdminEmail string) *AuthHandler {
	return &AuthHandler{bootstrapAdminEmail: bootstrapAdminEmail}
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
// GET routes are public (no JWT) — users hit these before creating an account.
// POST routes require JWT via the provided authMiddleware — users hit these
// after creating a Firebase account but before having a DB profile.
// The rateLimitMiddleware is applied to POST routes for IP-based rate limiting.
// Both use RegistrationStoreMiddleware (applied by the caller) for limited RLS access.
func (h *AuthHandler) RegistrationRoutes(authMiddleware func(http.Handler) http.Handler, rateLimitMiddleware ...func(http.Handler) http.Handler) chi.Router {
	r := chi.NewRouter()
	r.Get("/accept-invite", h.GetAcceptInvite)
	r.Get("/register-student", h.GetRegisterStudent)

	// Combine auth and optional rate limit middleware for POST routes
	postMiddleware := []func(http.Handler) http.Handler{authMiddleware}
	postMiddleware = append(postMiddleware, rateLimitMiddleware...)

	r.With(postMiddleware...).Post("/accept-invite", h.PostAcceptInvite)
	r.With(postMiddleware...).Post("/register-student", h.PostRegisterStudent)
	r.With(postMiddleware...).Post("/bootstrap", h.PostBootstrap)
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
		code := "INVITATION_EXPIRED"
		if inv.Status == "consumed" {
			code = "INVITATION_CONSUMED"
		}
		httputil.WriteErrorWithCode(w, http.StatusGone, code, "invitation is no longer pending")
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
		code := "INVITATION_EXPIRED"
		if inv.Status == "consumed" {
			code = "INVITATION_CONSUMED"
		}
		httputil.WriteErrorWithCode(w, http.StatusGone, code, "invitation is no longer pending")
		return
	}

	// No email_verified check here — the invite token is a one-time-use secret
	// sent to the intended recipient, so possessing it is sufficient authorization.
	// This allows email/password sign-in (where Firebase sets email_verified=false)
	// as well as OAuth sign-in with a different email than the invitation.

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
			httputil.WriteErrorWithCode(w, http.StatusNotFound, "INVALID_CODE", "invalid join code")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !section.Active {
		httputil.WriteErrorWithCode(w, http.StatusGone, "SECTION_INACTIVE", "section is no longer active")
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

	if !claims.EmailVerified {
		httputil.WriteError(w, http.StatusForbidden, "email address must be verified by your sign-in provider")
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
			httputil.WriteErrorWithCode(w, http.StatusNotFound, "INVALID_CODE", "invalid join code")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !section.Active {
		httputil.WriteErrorWithCode(w, http.StatusGone, "SECTION_INACTIVE", "section is no longer active")
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

// PostBootstrap creates the initial system-admin user for the first deploy.
// The caller must be signed in with the email matching BOOTSTRAP_ADMIN_EMAIL
// and that email must be verified by the sign-in provider.
func (h *AuthHandler) PostBootstrap(w http.ResponseWriter, r *http.Request) {
	claims := auth.ClaimsFromContext(r.Context())
	if claims == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Bootstrap is disabled if no admin email is configured.
	if h.bootstrapAdminEmail == "" || claims.Email != h.bootstrapAdminEmail {
		httputil.WriteError(w, http.StatusForbidden, "not authorized to bootstrap")
		return
	}

	if !claims.EmailVerified {
		httputil.WriteError(w, http.StatusForbidden, "email address must be verified by your sign-in provider")
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
