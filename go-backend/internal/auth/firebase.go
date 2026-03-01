package auth

import (
	"context"
	"fmt"
	"time"

	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
)

// IDTokenVerifier is the interface for verifying Firebase ID tokens.
// It is implemented by *firebaseauth.Client and can be mocked in tests.
type IDTokenVerifier interface {
	VerifyIDToken(ctx context.Context, idToken string) (*firebaseauth.Token, error)
}

// firebaseValidator validates JWTs using the Firebase Admin Go SDK.
type firebaseValidator struct {
	verifier IDTokenVerifier
}

// NewFirebaseValidator creates a TokenValidator backed by the given IDTokenVerifier.
// In production, pass *firebaseauth.Client obtained via firebase.App.Auth(ctx).
// In tests, pass a mock that implements IDTokenVerifier.
func NewFirebaseValidator(verifier IDTokenVerifier) TokenValidator {
	return &firebaseValidator{verifier: verifier}
}

// NewFirebaseAuthClient initializes a Firebase App and returns the auth client.
// This is the production entrypoint. It uses Application Default Credentials
// (ADC) via the ambient GCP service account on GKE, or GOOGLE_APPLICATION_CREDENTIALS
// for local dev.
func NewFirebaseAuthClient(ctx context.Context, projectID string) (*firebaseauth.Client, error) {
	if projectID == "" {
		return nil, fmt.Errorf("auth: GCP project ID must not be empty")
	}
	app, err := firebase.NewApp(ctx, &firebase.Config{
		ProjectID: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("auth: initialize Firebase app: %w", err)
	}
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("auth: get Firebase auth client: %w", err)
	}
	return client, nil
}

// Validate verifies the raw JWT using the Firebase Admin SDK and maps the
// resulting token to our Claims type.
func (v *firebaseValidator) Validate(ctx context.Context, rawToken string) (*Claims, error) {
	tok, err := v.verifier.VerifyIDToken(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("auth: verify token: %w", err)
	}

	email, _ := tok.Claims["email"].(string)
	emailVerified, _ := tok.Claims["email_verified"].(bool)
	name, _ := tok.Claims["name"].(string)

	customClaims := extractFirebaseCustomClaims(tok.Claims)

	return &Claims{
		Subject:       tok.Subject,
		Email:         email,
		EmailVerified: emailVerified,
		Name:          name,
		IssuedAt:      time.Unix(tok.IssuedAt, 0),
		ExpiresAt:     time.Unix(tok.Expires, 0),
		CustomClaims:  customClaims,
	}, nil
}

// extractFirebaseCustomClaims filters out standard JWT/Firebase claims from the
// token's Claims map and returns only application-defined custom claims.
func extractFirebaseCustomClaims(claims map[string]interface{}) map[string]any {
	custom := make(map[string]any)
	for k, val := range claims {
		if !standardClaims[k] {
			custom[k] = val
		}
	}
	if len(custom) == 0 {
		return nil
	}
	return custom
}
