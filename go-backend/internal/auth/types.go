package auth

import (
	"context"
	"time"
)

// Claims holds the validated claims from a Firebase ID token.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	IssuedAt      time.Time
	ExpiresAt     time.Time
	// CustomClaims holds any additional claims set via Firebase Admin SDK
	// (e.g., {"role": "system-admin"} for bootstrap).
	CustomClaims map[string]any
}

// TokenValidator validates a raw JWT string and returns parsed claims.
type TokenValidator interface {
	Validate(ctx context.Context, rawToken string) (*Claims, error)
}

// standardClaims lists the JWT claim names that are part of the Identity Platform
// token spec and should NOT be included in CustomClaims.
var standardClaims = map[string]bool{
	"iss": true, "aud": true, "sub": true, "iat": true, "exp": true,
	"auth_time": true, "email": true, "email_verified": true, "name": true,
	"picture": true, "firebase": true, "user_id": true,
}
