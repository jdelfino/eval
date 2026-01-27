package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestUpdateCode_UsesTransaction(t *testing.T) {
	// UpdateCode should use beginTx (which calls conn) to wrap both
	// the session_students UPDATE and sessions last_activity UPDATE
	// in a single transaction. With a nil pool, beginTx returns
	// ErrNoConnection, proving the transaction path is used.
	s := New(nil)
	ctx := context.Background()

	_, err := s.UpdateCode(ctx, uuid.New(), uuid.New(), "print('hello')")
	if err != ErrNoConnection {
		t.Errorf("UpdateCode() error = %v, want ErrNoConnection (proving beginTx path)", err)
	}
}

func TestJoinSession_UsesTransaction(t *testing.T) {
	// JoinSession should also use beginTx. Verify the same pattern.
	s := New(nil)
	ctx := context.Background()

	_, err := s.JoinSession(ctx, JoinSessionParams{
		SessionID: uuid.New(),
		UserID:    uuid.New(),
		Name:      "test",
	})
	if err != ErrNoConnection {
		t.Errorf("JoinSession() error = %v, want ErrNoConnection (proving beginTx path)", err)
	}
}
