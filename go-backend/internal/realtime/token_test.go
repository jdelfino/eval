package realtime

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-key-for-centrifugo"

func TestNewHMACTokenGenerator_EmptySecret(t *testing.T) {
	_, err := NewHMACTokenGenerator("")
	if err == nil {
		t.Fatal("expected error for empty secret")
	}
}

func TestConnectionToken_ValidJWT(t *testing.T) {
	gen, err := NewHMACTokenGenerator(testSecret)
	if err != nil {
		t.Fatal(err)
	}

	userID := "user-123"
	tokenStr, err := gen.ConnectionToken(userID, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	// Parse and validate
	token, err := jwt.ParseWithClaims(tokenStr, &jwt.RegisteredClaims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			t.Fatalf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse token: %v", err)
	}

	claims, ok := token.Claims.(*jwt.RegisteredClaims)
	if !ok || !token.Valid {
		t.Fatal("invalid token claims")
	}

	if claims.Subject != userID {
		t.Errorf("subject = %q, want %q", claims.Subject, userID)
	}

	if claims.ExpiresAt == nil {
		t.Fatal("expected expiry to be set")
	}

	// Expiry should be roughly 15 minutes from now
	diff := time.Until(claims.ExpiresAt.Time)
	if diff < 14*time.Minute || diff > 16*time.Minute {
		t.Errorf("expiry diff = %v, want ~15m", diff)
	}
}

func TestSubscriptionToken_ValidJWT(t *testing.T) {
	gen, err := NewHMACTokenGenerator(testSecret)
	if err != nil {
		t.Fatal(err)
	}

	userID := "user-456"
	channel := "session:abc-def"
	tokenStr, err := gen.SubscriptionToken(userID, channel, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	// Parse and validate
	token, err := jwt.ParseWithClaims(tokenStr, &subscriptionClaims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			t.Fatalf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("failed to parse token: %v", err)
	}

	claims, ok := token.Claims.(*subscriptionClaims)
	if !ok || !token.Valid {
		t.Fatal("invalid token claims")
	}

	if claims.Subject != userID {
		t.Errorf("subject = %q, want %q", claims.Subject, userID)
	}
	if claims.Channel != channel {
		t.Errorf("channel = %q, want %q", claims.Channel, channel)
	}
	if claims.ExpiresAt == nil {
		t.Fatal("expected expiry to be set")
	}
}

func TestConnectionToken_WrongSecret(t *testing.T) {
	gen, err := NewHMACTokenGenerator(testSecret)
	if err != nil {
		t.Fatal(err)
	}

	tokenStr, err := gen.ConnectionToken("user-1", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	// Parse with wrong secret should fail
	_, err = jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) {
		return []byte("wrong-secret"), nil
	})
	if err == nil {
		t.Fatal("expected error when parsing with wrong secret")
	}
}
