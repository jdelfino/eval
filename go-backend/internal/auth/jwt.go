package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Claims holds the validated claims from a GCP Identity Platform JWT.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
	Name          string
	IssuedAt      time.Time
	ExpiresAt     time.Time
}

// TokenValidator validates a raw JWT string and returns parsed claims.
type TokenValidator interface {
	Validate(ctx context.Context, rawToken string) (*Claims, error)
}

// identityPlatformValidator validates JWTs issued by GCP Identity Platform.
type identityPlatformValidator struct {
	projectID    string
	jwksProvider JWKSProvider
	logger       *slog.Logger
	nowFunc      func() time.Time // for testing; defaults to time.Now
}

// NewIdentityPlatformValidator creates a TokenValidator for GCP Identity Platform tokens.
func NewIdentityPlatformValidator(projectID string, jwksProvider JWKSProvider, logger *slog.Logger) TokenValidator {
	return &identityPlatformValidator{
		projectID:    projectID,
		jwksProvider: jwksProvider,
		logger:       logger,
		nowFunc:      time.Now,
	}
}

// jwtHeader is the decoded JWT header.
type jwtHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

// jwtPayload is the decoded JWT payload for Identity Platform tokens.
type jwtPayload struct {
	Iss           string `json:"iss"`
	Aud           string `json:"aud"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Iat           int64  `json:"iat"`
	Exp           int64  `json:"exp"`
}

// Validate parses and validates a raw JWT string.
func (v *identityPlatformValidator) Validate(ctx context.Context, rawToken string) (*Claims, error) {
	// Split into 3 parts.
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("auth: malformed token: expected 3 parts, got %d", len(parts))
	}

	headerB64, payloadB64, sigB64 := parts[0], parts[1], parts[2]

	// Decode and parse header.
	headerBytes, err := base64.RawURLEncoding.DecodeString(headerB64)
	if err != nil {
		return nil, fmt.Errorf("auth: decode header: %w", err)
	}

	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("auth: parse header: %w", err)
	}

	if header.Alg != "RS256" {
		return nil, fmt.Errorf("auth: unsupported algorithm %q, expected RS256", header.Alg)
	}

	if header.Kid == "" {
		return nil, fmt.Errorf("auth: missing kid in token header")
	}

	// Fetch public key.
	pubKey, err := v.jwksProvider.GetKey(ctx, header.Kid)
	if err != nil {
		return nil, fmt.Errorf("auth: get signing key: %w", err)
	}

	// Verify signature.
	signedContent := headerB64 + "." + payloadB64
	hash := sha256.Sum256([]byte(signedContent))

	sigBytes, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, fmt.Errorf("auth: decode signature: %w", err)
	}

	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], sigBytes); err != nil {
		return nil, fmt.Errorf("auth: invalid signature: %w", err)
	}

	// Decode and parse payload.
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, fmt.Errorf("auth: decode payload: %w", err)
	}

	var payload jwtPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("auth: parse payload: %w", err)
	}

	// Validate issuer.
	expectedIssuer := "https://securetoken.google.com/" + v.projectID
	if payload.Iss != expectedIssuer {
		return nil, fmt.Errorf("auth: invalid issuer %q, expected %q", payload.Iss, expectedIssuer)
	}

	// Validate audience.
	if payload.Aud != v.projectID {
		return nil, fmt.Errorf("auth: invalid audience %q, expected %q", payload.Aud, v.projectID)
	}

	// Validate timestamps.
	now := v.nowFunc()
	exp := time.Unix(payload.Exp, 0)
	iat := time.Unix(payload.Iat, 0)

	if now.After(exp) {
		return nil, fmt.Errorf("auth: token expired at %v", exp)
	}

	if iat.After(now) {
		return nil, fmt.Errorf("auth: token issued in the future at %v", iat)
	}

	return &Claims{
		Subject:       payload.Sub,
		Email:         payload.Email,
		EmailVerified: payload.EmailVerified,
		Name:          payload.Name,
		IssuedAt:      iat,
		ExpiresAt:     exp,
	}, nil
}
