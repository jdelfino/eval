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

// JWTValidator is Chi middleware that validates Bearer JWT tokens and
// populates the claims in the request context.
//
// This middleware only validates the token — it does NOT require the user
// to exist in the database. Use UserLoader middleware after this to
// require an existing user profile.
type JWTValidator struct {
	validator auth.TokenValidator
	logger    *slog.Logger
}

// NewJWTValidator creates a JWT validation middleware.
func NewJWTValidator(v auth.TokenValidator, l *slog.Logger) *JWTValidator {
	return &JWTValidator{validator: v, logger: l}
}

// Validate returns a Chi middleware that validates Bearer tokens and adds claims to context.
func (j *JWTValidator) Validate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			j.logger.Warn("missing authorization header")
			writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
			return
		}

		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			j.logger.Warn("malformed authorization header")
			writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
			return
		}

		claims, err := j.validator.Validate(r.Context(), token)
		if err != nil {
			j.logger.Warn("token validation failed", "error", err)
			writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
			return
		}

		ctx := auth.WithClaims(r.Context(), claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserLoader is Chi middleware that loads the user profile from the database
// based on JWT claims. It requires JWTValidator middleware to run first.
type UserLoader struct {
	users  UserLookup
	logger *slog.Logger
}

// NewUserLoader creates a user loading middleware.
func NewUserLoader(u UserLookup, l *slog.Logger) *UserLoader {
	return &UserLoader{users: u, logger: l}
}

// Load returns a Chi middleware that loads the user and adds it to context.
// Returns 401 if the user doesn't exist in the database.
func (u *UserLoader) Load(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := auth.ClaimsFromContext(r.Context())
		if claims == nil {
			u.logger.Warn("user loader called without claims in context")
			writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
			return
		}

		record, err := u.users.GetUserByExternalID(r.Context(), claims.Subject)
		if err != nil {
			u.logger.Warn("user lookup failed", "external_id", claims.Subject, "error", err)
			writeJSONError(w, r, http.StatusUnauthorized, "authentication required")
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

// Authenticator is Chi middleware that validates Bearer JWT tokens and
// populates the authenticated user in the request context.
//
// Deprecated: Use JWTValidator + UserLoader separately for finer control.
// This combined middleware is kept for backward compatibility.
type Authenticator struct {
	validator auth.TokenValidator
	users     UserLookup
	logger    *slog.Logger
}

// NewAuthenticator creates an Authenticator middleware.
//
// Deprecated: Use NewJWTValidator and NewUserLoader separately.
func NewAuthenticator(v auth.TokenValidator, u UserLookup, l *slog.Logger) *Authenticator {
	return &Authenticator{validator: v, users: u, logger: l}
}

// Authenticate returns a Chi middleware that validates Bearer tokens.
//
// Deprecated: Use JWTValidator.Validate and UserLoader.Load separately.
func (a *Authenticator) Authenticate(next http.Handler) http.Handler {
	jwtValidator := NewJWTValidator(a.validator, a.logger)
	userLoader := NewUserLoader(a.users, a.logger)

	// Chain: JWT validation -> User loading -> next handler
	return jwtValidator.Validate(userLoader.Load(next))
}
