package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	firebaseauth "firebase.google.com/go/v4/auth"
)

// mockIDTokenVerifier is a test double for IDTokenVerifier.
type mockIDTokenVerifier struct {
	token *firebaseauth.Token
	err   error
}

func (m *mockIDTokenVerifier) VerifyIDToken(ctx context.Context, idToken string) (*firebaseauth.Token, error) {
	return m.token, m.err
}

func validFirebaseToken() *firebaseauth.Token {
	now := time.Now()
	return &firebaseauth.Token{
		Subject:  "firebase-uid-123",
		Issuer:   "https://securetoken.google.com/my-project",
		Audience: "my-project",
		IssuedAt: now.Add(-5 * time.Minute).Unix(),
		Expires:  now.Add(55 * time.Minute).Unix(),
		AuthTime: now.Add(-10 * time.Minute).Unix(),
		Claims: map[string]interface{}{
			"email":          "user@example.com",
			"email_verified": true,
			"name":           "Test User",
			"sub":            "firebase-uid-123",
			"iss":            "https://securetoken.google.com/my-project",
			"aud":            "my-project",
			"iat":            now.Add(-5 * time.Minute).Unix(),
			"exp":            now.Add(55 * time.Minute).Unix(),
			"auth_time":      now.Add(-10 * time.Minute).Unix(),
		},
	}
}

func TestFirebaseValidator_ValidToken(t *testing.T) {
	tok := validFirebaseToken()
	mock := &mockIDTokenVerifier{token: tok}
	v := NewFirebaseValidator(mock)

	claims, err := v.Validate(context.Background(), "some-valid-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Subject != "firebase-uid-123" {
		t.Errorf("Subject = %q, want %q", claims.Subject, "firebase-uid-123")
	}
	if claims.Email != "user@example.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "user@example.com")
	}
	if !claims.EmailVerified {
		t.Error("EmailVerified = false, want true")
	}
	if claims.Name != "Test User" {
		t.Errorf("Name = %q, want %q", claims.Name, "Test User")
	}
}

func TestFirebaseValidator_SDKError(t *testing.T) {
	mock := &mockIDTokenVerifier{err: errors.New("firebase: token expired")}
	v := NewFirebaseValidator(mock)

	_, err := v.Validate(context.Background(), "expired-token")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestFirebaseValidator_CustomClaims(t *testing.T) {
	tok := validFirebaseToken()
	tok.Claims["role"] = "system-admin"
	tok.Claims["org"] = "my-org"
	mock := &mockIDTokenVerifier{token: tok}
	v := NewFirebaseValidator(mock)

	claims, err := v.Validate(context.Background(), "some-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.CustomClaims == nil {
		t.Fatal("expected CustomClaims to be non-nil")
	}
	if claims.CustomClaims["role"] != "system-admin" {
		t.Errorf("CustomClaims[role] = %v, want %q", claims.CustomClaims["role"], "system-admin")
	}
	if claims.CustomClaims["org"] != "my-org" {
		t.Errorf("CustomClaims[org] = %v, want %q", claims.CustomClaims["org"], "my-org")
	}
}

func TestFirebaseValidator_NoCustomClaims(t *testing.T) {
	tok := validFirebaseToken()
	mock := &mockIDTokenVerifier{token: tok}
	v := NewFirebaseValidator(mock)

	claims, err := v.Validate(context.Background(), "some-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.CustomClaims != nil {
		t.Errorf("CustomClaims = %v, want nil", claims.CustomClaims)
	}
}

func TestFirebaseValidator_StandardClaimsNotInCustom(t *testing.T) {
	tok := validFirebaseToken()
	// Add a custom claim alongside standard ones
	tok.Claims["custom_field"] = "custom_value"
	mock := &mockIDTokenVerifier{token: tok}
	v := NewFirebaseValidator(mock)

	claims, err := v.Validate(context.Background(), "some-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Standard claims must NOT appear in CustomClaims
	for _, std := range []string{"email", "email_verified", "name", "sub", "iss", "aud", "iat", "exp", "auth_time", "firebase", "user_id", "picture"} {
		if _, ok := claims.CustomClaims[std]; ok {
			t.Errorf("standard claim %q should not be in CustomClaims", std)
		}
	}
	// Custom field should appear
	if claims.CustomClaims["custom_field"] != "custom_value" {
		t.Errorf("CustomClaims[custom_field] = %v, want %q", claims.CustomClaims["custom_field"], "custom_value")
	}
}

func TestFirebaseValidator_TimestampMapping(t *testing.T) {
	tok := validFirebaseToken()
	mock := &mockIDTokenVerifier{token: tok}
	v := NewFirebaseValidator(mock)

	claims, err := v.Validate(context.Background(), "some-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedIssuedAt := time.Unix(tok.IssuedAt, 0)
	expectedExpiresAt := time.Unix(tok.Expires, 0)

	if !claims.IssuedAt.Equal(expectedIssuedAt) {
		t.Errorf("IssuedAt = %v, want %v", claims.IssuedAt, expectedIssuedAt)
	}
	if !claims.ExpiresAt.Equal(expectedExpiresAt) {
		t.Errorf("ExpiresAt = %v, want %v", claims.ExpiresAt, expectedExpiresAt)
	}
}

func TestNewFirebaseAuthClient_EmptyProjectIDReturnsError(t *testing.T) {
	_, err := NewFirebaseAuthClient(context.Background(), "", "")
	if err == nil {
		t.Fatal("expected error for empty projectID, got nil")
	}
}

func TestNewFirebaseAuthClient_EmptyProjectIDWithTenantReturnsError(t *testing.T) {
	_, err := NewFirebaseAuthClient(context.Background(), "", "some-tenant-id")
	if err == nil {
		t.Fatal("expected error for empty projectID even with tenantID, got nil")
	}
}
