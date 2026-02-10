package auth

import (
	"context"
	"fmt"
	"strings"
)

// testValidator is a TokenValidator for integration tests.
// It accepts tokens in the format "test:<external_id>:<email>" or
// "test:<external_id>:<email>:<key>=<value>" for custom claims.
type testValidator struct{}

// NewTestValidator creates a TokenValidator that accepts test tokens.
// DO NOT USE IN PRODUCTION.
func NewTestValidator() TokenValidator {
	return &testValidator{}
}

func (v *testValidator) Validate(_ context.Context, rawToken string) (*Claims, error) {
	if !strings.HasPrefix(rawToken, "test:") {
		return nil, fmt.Errorf("auth: test token must start with \"test:\"")
	}

	parts := strings.SplitN(rawToken, ":", 4)
	if len(parts) < 3 {
		return nil, fmt.Errorf("auth: malformed test token: expected format test:<external_id>:<email>[:<key>=<value>]")
	}

	externalID := parts[1]
	email := parts[2]

	if externalID == "" {
		return nil, fmt.Errorf("auth: test token external_id must not be empty")
	}
	if email == "" {
		return nil, fmt.Errorf("auth: test token email must not be empty")
	}

	claims := &Claims{
		Subject:       externalID,
		Email:         email,
		EmailVerified: true,
	}

	// Parse optional custom claims (format: key=value)
	if len(parts) == 4 && parts[3] != "" {
		claims.CustomClaims = make(map[string]any)
		for _, kv := range strings.Split(parts[3], ",") {
			if k, v, ok := strings.Cut(kv, "="); ok && k != "" {
				claims.CustomClaims[k] = v
			}
		}
	}

	return claims, nil
}
