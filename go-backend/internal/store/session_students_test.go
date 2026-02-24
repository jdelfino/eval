package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// UpdateCode method was removed - this test is no longer needed

func TestJoinSession_RejectsNonTxQuerier(t *testing.T) {
	s := New(&mockQuerier{})
	ctx := context.Background()

	_, err := s.JoinSession(ctx, JoinSessionParams{
		SessionID: uuid.New(),
		UserID:    uuid.New(),
		Name:      "test",
	})
	if err == nil {
		t.Fatal("JoinSession() should fail when Querier does not support transactions")
	}
}
