package auth

import (
	"context"
	"fmt"
	"strings"
)

// testValidator is a TokenValidator for integration tests.
// It accepts tokens in the format "test:<external_id>:<email>".
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

	parts := strings.SplitN(rawToken, ":", 3)
	if len(parts) != 3 {
		return nil, fmt.Errorf("auth: malformed test token: expected format test:<external_id>:<email>")
	}

	externalID := parts[1]
	email := parts[2]

	if externalID == "" {
		return nil, fmt.Errorf("auth: test token external_id must not be empty")
	}
	if email == "" {
		return nil, fmt.Errorf("auth: test token email must not be empty")
	}

	return &Claims{
		Subject:       externalID,
		Email:         email,
		EmailVerified: true,
	}, nil
}
