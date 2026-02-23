package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestUpdateCode_RejectsNonTxQuerier(t *testing.T) {
	// A plain Querier (mockQuerier) does not implement TxQuerier,
	// so beginTx should return an error.
	s := New(&mockQuerier{})
	ctx := context.Background()

	_, err := s.UpdateCode(ctx, uuid.New(), uuid.New(), "print('hello')", nil)
	if err == nil {
		t.Fatal("UpdateCode() should fail when Querier does not support transactions")
	}
}

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
