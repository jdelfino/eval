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

func TestStore_QuerierAccess(t *testing.T) {
	// Verify the querier is stored correctly.
	store := New(nil)
	if store.q != nil {
		t.Error("Store did not store the querier reference correctly")
	}
}

func TestStore_InterfaceCompliance(t *testing.T) {
	var _ UserRepository = (*Store)(nil)
	var _ Repos = (*Store)(nil)
	t.Log("Store implements required interfaces")
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
