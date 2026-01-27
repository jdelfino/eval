package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"testing"
	"time"
)

const testProjectID = "my-test-project"

// mockJWKSProvider returns a fixed key for a known kid.
type mockJWKSProvider struct {
	keys map[string]*rsa.PublicKey
}

func (m *mockJWKSProvider) GetKey(_ context.Context, kid string) (*rsa.PublicKey, error) {
	key, ok := m.keys[kid]
	if !ok {
		return nil, fmt.Errorf("auth: key ID %q not found in JWKS", kid)
	}
	return key, nil
}

// signJWT creates a signed JWT from header and payload maps using the given key.
func signJWT(t *testing.T, header, payload map[string]any, key *rsa.PrivateKey) string {
	t.Helper()
	headerJSON, err := json.Marshal(header)
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

	signed := headerB64 + "." + payloadB64
	hash := sha256.Sum256([]byte(signed))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func validHeader(kid string) map[string]any {
	return map[string]any{"alg": "RS256", "kid": kid}
}

func validPayload(now time.Time) map[string]any {
	return map[string]any{
		"iss":            "https://securetoken.google.com/" + testProjectID,
		"aud":            testProjectID,
		"sub":            "user-123",
		"email":          "test@example.com",
		"email_verified": true,
		"name":           "Test User",
		"iat":            now.Add(-5 * time.Minute).Unix(),
		"exp":            now.Add(55 * time.Minute).Unix(),
	}
}

func setup(t *testing.T) (*rsa.PrivateKey, *identityPlatformValidator) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	provider := &mockJWKSProvider{keys: map[string]*rsa.PublicKey{
		"test-kid": &key.PublicKey,
	}}
	now := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	v := &identityPlatformValidator{
		projectID:    testProjectID,
		jwksProvider: provider,
		logger:       slog.Default(),
		nowFunc:      func() time.Time { return now },
	}
	return key, v
}

func TestValidToken(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	token := signJWT(t, validHeader("test-kid"), validPayload(now), key)

	claims, err := v.Validate(context.Background(), token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Subject != "user-123" {
		t.Errorf("subject = %q, want %q", claims.Subject, "user-123")
	}
	if claims.Email != "test@example.com" {
		t.Errorf("email = %q, want %q", claims.Email, "test@example.com")
	}
	if !claims.EmailVerified {
		t.Error("email_verified = false, want true")
	}
	if claims.Name != "Test User" {
		t.Errorf("name = %q, want %q", claims.Name, "Test User")
	}
}

func TestExpiredToken(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	payload := validPayload(now)
	payload["exp"] = now.Add(-1 * time.Minute).Unix() // already expired

	token := signJWT(t, validHeader("test-kid"), payload, key)
	_, err := v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
	assertContains(t, err.Error(), "expired")
}

func TestWrongIssuer(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	payload := validPayload(now)
	payload["iss"] = "https://securetoken.google.com/wrong-project"

	token := signJWT(t, validHeader("test-kid"), payload, key)
	_, err := v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for wrong issuer")
	}
	assertContains(t, err.Error(), "invalid issuer")
}

func TestWrongAudience(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	payload := validPayload(now)
	payload["aud"] = "wrong-audience"

	token := signJWT(t, validHeader("test-kid"), payload, key)
	_, err := v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for wrong audience")
	}
	assertContains(t, err.Error(), "invalid audience")
}

func TestInvalidSignature(t *testing.T) {
	_, v := setup(t)
	now := v.nowFunc()

	// Sign with a different key.
	wrongKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate wrong key: %v", err)
	}
	token := signJWT(t, validHeader("test-kid"), validPayload(now), wrongKey)
	_, err = v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for invalid signature")
	}
	assertContains(t, err.Error(), "invalid signature")
}

func TestMissingKid(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	header := map[string]any{"alg": "RS256"} // no kid

	token := signJWT(t, header, validPayload(now), key)
	_, err := v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for missing kid")
	}
	assertContains(t, err.Error(), "missing kid")
}

func TestMalformedToken(t *testing.T) {
	_, v := setup(t)
	_, err := v.Validate(context.Background(), "not.a.valid.token.with.too.many.parts")
	if err == nil {
		t.Fatal("expected error for malformed token")
	}
	assertContains(t, err.Error(), "malformed")

	_, err = v.Validate(context.Background(), "onlyonepart")
	if err == nil {
		t.Fatal("expected error for malformed token")
	}
	assertContains(t, err.Error(), "malformed")
}

func TestFutureIat(t *testing.T) {
	key, v := setup(t)
	now := v.nowFunc()
	payload := validPayload(now)
	payload["iat"] = now.Add(10 * time.Minute).Unix() // future

	token := signJWT(t, validHeader("test-kid"), payload, key)
	_, err := v.Validate(context.Background(), token)
	if err == nil {
		t.Fatal("expected error for future iat")
	}
	assertContains(t, err.Error(), "future")
}

func assertContains(t *testing.T, s, substr string) {
	t.Helper()
	if len(s) == 0 || !contains(s, substr) {
		t.Errorf("expected %q to contain %q", s, substr)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
