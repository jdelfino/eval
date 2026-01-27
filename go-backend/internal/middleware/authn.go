package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jdelfino/eval/internal/auth"
)

// UserRecord holds the user data returned by UserLookup.
// This mirrors store.User but avoids importing the store package (which would
// create an import cycle because store already imports middleware).
type UserRecord struct {
	ID          uuid.UUID
	Email       string
	Role        string
	NamespaceID *string
}

// UserLookup retrieves a user by their external identity provider ID.
// Implementations should return a non-nil error when the user is not found.
type UserLookup interface {
	GetUserByExternalID(ctx context.Context, externalID string) (*UserRecord, error)
}

// Authenticator is Chi middleware that validates Bearer JWT tokens and
// populates the authenticated user in the request context.
type Authenticator struct {
	validator auth.TokenValidator
	users     UserLookup
	logger    *slog.Logger
}

// NewAuthenticator creates an Authenticator middleware.
func NewAuthenticator(v auth.TokenValidator, u UserLookup, l *slog.Logger) *Authenticator {
	return &Authenticator{validator: v, users: u, logger: l}
}

// Authenticate returns a Chi middleware that validates Bearer tokens.
func (a *Authenticator) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			a.logger.Warn("missing authorization header")
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			a.logger.Warn("malformed authorization header")
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		claims, err := a.validator.Validate(r.Context(), token)
		if err != nil {
			a.logger.Warn("token validation failed", "error", err)
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		record, err := a.users.GetUserByExternalID(r.Context(), claims.Subject)
		if err != nil {
			a.logger.Warn("user lookup failed", "external_id", claims.Subject, "error", err)
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		user := auth.User{
			ID:    record.ID,
			Email: record.Email,
			Role:  auth.Role(record.Role),
		}
		if record.NamespaceID != nil {
			user.NamespaceID = *record.NamespaceID
		}

		ctx := auth.WithUser(r.Context(), &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
