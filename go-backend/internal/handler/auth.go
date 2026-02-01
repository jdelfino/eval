package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// AuthHandler handles authentication-related routes for the current user.
type AuthHandler struct {
	users       store.UserRepository
	invitations store.InvitationRepository
	memberships store.MembershipRepository
	classes     store.ClassRepository
}

// NewAuthHandler creates a new AuthHandler with the given repositories.
func NewAuthHandler(users store.UserRepository, invitations store.InvitationRepository, memberships store.MembershipRepository, classes store.ClassRepository) *AuthHandler {
	return &AuthHandler{
		users:       users,
		invitations: invitations,
		memberships: memberships,
		classes:     classes,
	}
}

// Routes returns a chi.Router with the auth routes mounted.
func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/me", h.GetMe)
	r.Put("/me", h.UpdateMe)
	r.Get("/accept-invite", h.GetAcceptInvite)
	r.Post("/accept-invite", h.PostAcceptInvite)
	r.Get("/register-student", h.GetRegisterStudent)
	r.Post("/register-student", h.PostRegisterStudent)
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

	inv, err := h.invitations.GetInvitation(r.Context(), invID)
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
	ExternalID  string  `json:"external_id" validate:"required"`
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
}

// PostAcceptInvite creates a user profile and consumes the invitation.
func (h *AuthHandler) PostAcceptInvite(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.BindJSON[acceptInviteRequest](w, r)
	if err != nil {
		return
	}

	invID, _ := uuid.Parse(req.Token) // validated by struct tag

	inv, err := h.invitations.GetInvitation(r.Context(), invID)
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

	user, err := h.users.CreateUser(r.Context(), store.CreateUserParams{
		ExternalID:  req.ExternalID,
		Email:       inv.Email,
		Role:        inv.TargetRole,
		NamespaceID: &inv.NamespaceID,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if _, err := h.invitations.ConsumeInvitation(r.Context(), invID, user.ID); err != nil {
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

	section, err := h.memberships.GetSectionByJoinCode(r.Context(), code)
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

	class, err := h.classes.GetClass(r.Context(), section.ClassID)
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
	ExternalID  string  `json:"external_id" validate:"required"`
	Email       string  `json:"email" validate:"required,email"`
	DisplayName *string `json:"display_name" validate:"omitempty,min=1,max=255"`
}

// PostRegisterStudent creates a student user and enrolls them in a section.
func (h *AuthHandler) PostRegisterStudent(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.BindJSON[registerStudentRequest](w, r)
	if err != nil {
		return
	}

	section, err := h.memberships.GetSectionByJoinCode(r.Context(), req.JoinCode)
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

	user, err := h.users.CreateUser(r.Context(), store.CreateUserParams{
		ExternalID:  req.ExternalID,
		Email:       req.Email,
		Role:        "student",
		NamespaceID: &section.NamespaceID,
		DisplayName: req.DisplayName,
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if _, err := h.memberships.CreateMembership(r.Context(), store.CreateMembershipParams{
		UserID:    user.ID,
		SectionID: section.ID,
		Role:      "student",
	}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create membership")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, user)
}
