// Package realtime provides Centrifugo real-time messaging integration.
package realtime

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenGenerator creates signed JWTs for Centrifugo client auth.
type TokenGenerator interface {
	ConnectionToken(userID string, expiry time.Duration) (string, error)
	SubscriptionToken(userID, channel string, expiry time.Duration) (string, error)
}

// HMACTokenGenerator signs tokens using HMAC-SHA256.
type HMACTokenGenerator struct {
	secret []byte
}

// NewHMACTokenGenerator creates a TokenGenerator that signs with the given secret.
func NewHMACTokenGenerator(secret string) (*HMACTokenGenerator, error) {
	if secret == "" {
		return nil, fmt.Errorf("centrifugo token secret must not be empty")
	}
	return &HMACTokenGenerator{secret: []byte(secret)}, nil
}

// ConnectionToken produces a Centrifugo connection JWT with sub and exp claims.
func (g *HMACTokenGenerator) ConnectionToken(userID string, expiry time.Duration) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(g.secret)
}

// subscriptionClaims extends RegisteredClaims with the channel field Centrifugo expects.
type subscriptionClaims struct {
	jwt.RegisteredClaims
	Channel string `json:"channel"`
}

// SubscriptionToken produces a Centrifugo subscription JWT with sub, channel, and exp claims.
func (g *HMACTokenGenerator) SubscriptionToken(userID, channel string, expiry time.Duration) (string, error) {
	claims := subscriptionClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
		},
		Channel: channel,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(g.secret)
}
