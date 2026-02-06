package handler

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/internal/auth"
	"github.com/jdelfino/eval/internal/email"
	"github.com/jdelfino/eval/internal/httpbind"
	custommw "github.com/jdelfino/eval/internal/middleware"
	"github.com/jdelfino/eval/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// InvitationHandler handles invitation management routes.
type InvitationHandler struct {
	emailClient email.Client
	baseURL     string
}

// NewInvitationHandler creates a new InvitationHandler.
func NewInvitationHandler(emailClient email.Client, baseURL string) *InvitationHandler {
	return &InvitationHandler{
		emailClient: emailClient,
		baseURL:     baseURL,
	}
}

// Routes returns a chi.Router with namespace-scoped invitation routes.
// Mounted under /api/v1/namespaces/{id}/invitations
func (h *InvitationHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequirePermission(auth.PermUserManage))

	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/{invID}", h.Get)
	r.Delete("/{invID}", h.Revoke)
	r.Post("/{invID}/resend", h.Resend)

	return r
}

// SystemRoutes returns a chi.Router with system-level invitation routes.
// Mounted under /api/v1/system/invitations
func (h *InvitationHandler) SystemRoutes() chi.Router {
	r := chi.NewRouter()
	r.Use(custommw.RequirePermission(auth.PermSystemAdmin))

	r.Get("/", h.SystemList)
	r.Post("/", h.SystemCreate)
	r.Get("/{invID}", h.SystemGet)
	r.Delete("/{invID}", h.SystemRevoke)
	r.Post("/{invID}/resend", h.SystemResend)

	return r
}

// List handles GET /api/v1/namespaces/{nsID}/invitations
func (h *InvitationHandler) List(w http.ResponseWriter, r *http.Request) {
	nsID := chi.URLParam(r, "id")
	if !requireNamespaceAccess(w, r, nsID) {
		return
	}

	statusFilter := r.URL.Query().Get("status")
	filters := store.InvitationFilters{NamespaceID: &nsID}
	if statusFilter != "" {
		filters.Status = &statusFilter
	}

	repos := store.ReposFromContext(r.Context())
	invitations, err := repos.ListInvitations(r.Context(), filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if invitations == nil {
		invitations = []store.Invitation{}
	}
	httputil.WriteJSON(w, http.StatusOK, invitations)
}

type createInvitationRequest struct {
	Email      string `json:"email" validate:"required,email"`
	TargetRole string `json:"target_role" validate:"required,oneof=namespace-admin instructor"`
}

// Create handles POST /api/v1/namespaces/{nsID}/invitations
func (h *InvitationHandler) Create(w http.ResponseWriter, r *http.Request) {
	nsID := chi.URLParam(r, "id")
	if !requireNamespaceAccess(w, r, nsID) {
		return
	}

	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[createInvitationRequest](w, r)
	if err != nil {
		return
	}

	repos := store.ReposFromContext(r.Context())
	inv, err := repos.CreateInvitation(r.Context(), store.CreateInvitationParams{
		Email:       req.Email,
		TargetRole:  req.TargetRole,
		NamespaceID: nsID,
		CreatedBy:   authUser.ID,
		ExpiresAt:   time.Now().Add(7 * 24 * time.Hour),
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Send email (best-effort, don't fail the request)
	acceptURL := fmt.Sprintf("%s?token=%s", h.baseURL, inv.ID.String())
	_ = h.emailClient.SendInvitation(r.Context(), inv.Email, authUser.Email, nsID, acceptURL)

	httputil.WriteJSON(w, http.StatusCreated, inv)
}

// Get handles GET /api/v1/namespaces/{nsID}/invitations/{invID}
func (h *InvitationHandler) Get(w http.ResponseWriter, r *http.Request) {
	nsID := chi.URLParam(r, "id")
	if !requireNamespaceAccess(w, r, nsID) {
		return
	}

	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
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

	if inv.NamespaceID != nsID {
		httputil.WriteError(w, http.StatusNotFound, "invitation not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, inv)
}

// Revoke handles DELETE /api/v1/namespaces/{nsID}/invitations/{invID}
func (h *InvitationHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	nsID := chi.URLParam(r, "id")
	if !requireNamespaceAccess(w, r, nsID) {
		return
	}

	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
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

	if inv.NamespaceID != nsID {
		httputil.WriteError(w, http.StatusNotFound, "invitation not found")
		return
	}

	revoked, err := repos.RevokeInvitation(r.Context(), invID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invitation not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, revoked)
}

// Resend handles POST /api/v1/namespaces/{nsID}/invitations/{invID}/resend
func (h *InvitationHandler) Resend(w http.ResponseWriter, r *http.Request) {
	nsID := chi.URLParam(r, "id")
	if !requireNamespaceAccess(w, r, nsID) {
		return
	}

	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
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

	if inv.NamespaceID != nsID {
		httputil.WriteError(w, http.StatusNotFound, "invitation not found")
		return
	}

	if inv.Status != "pending" {
		httputil.WriteError(w, http.StatusConflict, "invitation is not pending")
		return
	}

	acceptURL := fmt.Sprintf("%s?token=%s", h.baseURL, inv.ID.String())
	if err := h.emailClient.SendInvitation(r.Context(), inv.Email, authUser.Email, nsID, acceptURL); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to send email")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, inv)
}

// SystemList handles GET /api/v1/system/invitations
func (h *InvitationHandler) SystemList(w http.ResponseWriter, r *http.Request) {
	statusFilter := r.URL.Query().Get("status")
	nsFilter := r.URL.Query().Get("namespace_id")

	filters := store.InvitationFilters{}
	if statusFilter != "" {
		filters.Status = &statusFilter
	}
	if nsFilter != "" {
		filters.NamespaceID = &nsFilter
	}

	repos := store.ReposFromContext(r.Context())
	invitations, err := repos.ListInvitations(r.Context(), filters)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if invitations == nil {
		invitations = []store.Invitation{}
	}
	httputil.WriteJSON(w, http.StatusOK, invitations)
}

type systemCreateInvitationRequest struct {
	Email       string `json:"email" validate:"required,email"`
	TargetRole  string `json:"target_role" validate:"required,oneof=namespace-admin instructor"`
	NamespaceID string `json:"namespace_id" validate:"required"`
}

// SystemCreate handles POST /api/v1/system/invitations
func (h *InvitationHandler) SystemCreate(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	req, err := httpbind.BindJSON[systemCreateInvitationRequest](w, r)
	if err != nil {
		return
	}

	repos := store.ReposFromContext(r.Context())
	inv, err := repos.CreateInvitation(r.Context(), store.CreateInvitationParams{
		Email:       req.Email,
		TargetRole:  req.TargetRole,
		NamespaceID: req.NamespaceID,
		CreatedBy:   authUser.ID,
		ExpiresAt:   time.Now().Add(7 * 24 * time.Hour),
	})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	acceptURL := fmt.Sprintf("%s?token=%s", h.baseURL, inv.ID.String())
	_ = h.emailClient.SendInvitation(r.Context(), inv.Email, authUser.Email, req.NamespaceID, acceptURL)

	httputil.WriteJSON(w, http.StatusCreated, inv)
}

// SystemGet handles GET /api/v1/system/invitations/{invID}
func (h *InvitationHandler) SystemGet(w http.ResponseWriter, r *http.Request) {
	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
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

	httputil.WriteJSON(w, http.StatusOK, inv)
}

// SystemRevoke handles DELETE /api/v1/system/invitations/{invID}
func (h *InvitationHandler) SystemRevoke(w http.ResponseWriter, r *http.Request) {
	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
		return
	}

	repos := store.ReposFromContext(r.Context())
	inv, err := repos.RevokeInvitation(r.Context(), invID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httputil.WriteError(w, http.StatusNotFound, "invitation not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, inv)
}

// SystemResend handles POST /api/v1/system/invitations/{invID}/resend
func (h *InvitationHandler) SystemResend(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	invID, err := uuid.Parse(chi.URLParam(r, "invID"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid invitation ID")
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
		httputil.WriteError(w, http.StatusConflict, "invitation is not pending")
		return
	}

	acceptURL := fmt.Sprintf("%s?token=%s", h.baseURL, inv.ID.String())
	if err := h.emailClient.SendInvitation(r.Context(), inv.Email, authUser.Email, inv.NamespaceID, acceptURL); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to send email")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, inv)
}
