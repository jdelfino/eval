package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/auth"
	"github.com/jdelfino/eval/go-backend/internal/realtime"
	"github.com/jdelfino/eval/go-backend/internal/store"
	"github.com/jdelfino/eval/pkg/httputil"
)

// defaultTokenExpiry is the fallback expiry when none is configured.
const defaultTokenExpiry = 15 * time.Minute

// CentrifugoHandler issues Centrifugo connection and subscription tokens.
type CentrifugoHandler struct {
	tokens      realtime.TokenGenerator
	tokenExpiry time.Duration
}

// NewCentrifugoHandler creates a new CentrifugoHandler.
func NewCentrifugoHandler(
	tokens realtime.TokenGenerator,
	tokenExpiry time.Duration,
) *CentrifugoHandler {
	if tokenExpiry <= 0 {
		tokenExpiry = defaultTokenExpiry
	}
	return &CentrifugoHandler{
		tokens:      tokens,
		tokenExpiry: tokenExpiry,
	}
}

// Routes returns a chi.Router with the centrifugo routes mounted.
func (h *CentrifugoHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/token", h.GetToken)
	return r
}

// tokenResponse is the JSON envelope for issued tokens.
type tokenResponse struct {
	Token string `json:"token"`
}

// GetToken handles GET /api/v1/auth/centrifugo-token.
// Without a channel query param it returns a connection token.
// With ?channel=session:{id} it returns a subscription token after
// verifying the authenticated user is a participant.
func (h *CentrifugoHandler) GetToken(w http.ResponseWriter, r *http.Request) {
	authUser := auth.UserFromContext(r.Context())
	if authUser == nil {
		httputil.WriteError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	channel := r.URL.Query().Get("channel")

	// Connection token: any authenticated user.
	if channel == "" {
		tok, err := h.tokens.ConnectionToken(authUser.ID.String(), h.tokenExpiry)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		httputil.WriteJSON(w, http.StatusOK, tokenResponse{Token: tok})
		return
	}

	// Subscription token: branch on channel prefix.
	switch {
	case strings.HasPrefix(channel, "session:"):
		sessionID, err := parseChannelUUID(channel, "session:")
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid channel format: expected session:{uuid}")
			return
		}
		if err := h.authorizeSubscription(r, authUser, sessionID); err != nil {
			if errors.Is(err, errForbidden) {
				httputil.WriteError(w, http.StatusForbidden, "not a participant of this session")
				return
			}
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}

	case strings.HasPrefix(channel, "section:"):
		sectionID, err := parseChannelUUID(channel, "section:")
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "invalid channel format: expected section:{uuid}")
			return
		}
		if err := h.authorizeSectionSubscription(r, sectionID); err != nil {
			if errors.Is(err, errForbidden) {
				httputil.WriteError(w, http.StatusForbidden, "not a member of this section")
				return
			}
			httputil.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}

	default:
		httputil.WriteError(w, http.StatusBadRequest, "invalid channel format: unknown prefix")
		return
	}

	tok, err := h.tokens.SubscriptionToken(authUser.ID.String(), channel, h.tokenExpiry)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, tokenResponse{Token: tok})
}

var errForbidden = errors.New("forbidden")

// authorizeSubscription checks that the user is either an instructor+ role
// (who can see the session via RLS) or a student participant in the session.
func (h *CentrifugoHandler) authorizeSubscription(r *http.Request, user *auth.User, sessionID uuid.UUID) error {
	ctx := r.Context()
	repos := store.ReposFromContext(ctx)

	// Instructors, namespace admins, and system admins are always allowed
	// if they can see the session (RLS enforced by the store query).
	switch user.Role {
	case auth.RoleInstructor, auth.RoleNamespaceAdmin, auth.RoleSystemAdmin:
		// Verify the session exists and is visible to this user via RLS.
		_, err := repos.GetSession(ctx, sessionID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return errForbidden
			}
			return err
		}
		return nil
	}

	// Students: must be a participant OR a section member (can see the session
	// via RLS). Section members need to subscribe before joining so they
	// receive real-time updates once their join request completes.
	_, err := repos.GetSessionStudent(ctx, sessionID, user.ID)
	if err == nil {
		return nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return err
	}

	// Not yet a participant — fall back to RLS-based visibility check.
	// GetSession uses RLS which ensures the student is a member of the
	// session's section (via is_section_member policy).
	_, sErr := repos.GetSession(ctx, sessionID)
	if sErr != nil {
		if errors.Is(sErr, store.ErrNotFound) {
			return errForbidden
		}
		return sErr
	}
	return nil
}

// parseChannelUUID extracts the UUID from a "{prefix}{uuid}" channel string.
// Returns an error if the channel does not start with prefix or the UUID portion is invalid.
func parseChannelUUID(channel, prefix string) (uuid.UUID, error) {
	if !strings.HasPrefix(channel, prefix) {
		return uuid.Nil, errors.New("invalid channel prefix")
	}
	return uuid.Parse(channel[len(prefix):])
}

// authorizeSectionSubscription checks that the user is a member of the section
// (or can see it via RLS). RLS ensures only members can retrieve the section.
func (h *CentrifugoHandler) authorizeSectionSubscription(r *http.Request, sectionID uuid.UUID) error {
	ctx := r.Context()
	repos := store.ReposFromContext(ctx)

	_, err := repos.GetSection(ctx, sectionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return errForbidden
		}
		return err
	}
	return nil
}
