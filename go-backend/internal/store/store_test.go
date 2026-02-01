package store

import (
	"context"
	"testing"
)

func TestNew(t *testing.T) {
	store := New(nil)
	if store == nil {
		t.Fatal("New() returned nil")
	}
}

func TestStore_InterfaceCompliance(t *testing.T) {
	var _ Repos = (*Store)(nil)
	t.Log("Store implements Repos interface")
}

func TestReposFromContext_Panics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("ReposFromContext did not panic on empty context")
		}
	}()
	ReposFromContext(context.Background())
}

func TestWithRepos_RoundTrip(t *testing.T) {
	s := New(nil)
	ctx := WithRepos(context.Background(), s)
	got := ReposFromContext(ctx)
	if got != s {
		t.Error("ReposFromContext did not return the stored Repos")
	}
}
