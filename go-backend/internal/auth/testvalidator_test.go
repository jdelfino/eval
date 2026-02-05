package auth

import (
	"context"
	"testing"
)

func TestTestValidator_ValidToken(t *testing.T) {
	v := NewTestValidator()
	claims, err := v.Validate(context.Background(), "test:ext123:user@example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims.Subject != "ext123" {
		t.Errorf("Subject = %q, want %q", claims.Subject, "ext123")
	}
	if claims.Email != "user@example.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "user@example.com")
	}
	if !claims.EmailVerified {
		t.Error("EmailVerified = false, want true")
	}
}

func TestTestValidator_MalformedTokens(t *testing.T) {
	v := NewTestValidator()
	cases := []string{
		"",
		"nottest:a:b",
		"test:",
		"test:only_one_part",
		"test::missing_id",
	}
	for _, tok := range cases {
		t.Run(tok, func(t *testing.T) {
			_, err := v.Validate(context.Background(), tok)
			if err == nil {
				t.Errorf("expected error for token %q", tok)
			}
		})
	}
}
