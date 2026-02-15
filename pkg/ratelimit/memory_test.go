package ratelimit

import (
	"context"
	"testing"
	"time"
)

func TestMemoryLimiter_SlidingWindow_AllowUpToLimit(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 3, Window: time.Minute},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for i := range 3 {
		res, err := m.Allow(ctx, "test", "user1")
		if err != nil {
			t.Fatalf("unexpected error on request %d: %v", i+1, err)
		}
		if !res.Allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
		if res.Remaining != 2-i {
			t.Fatalf("request %d: expected remaining %d, got %d", i+1, 2-i, res.Remaining)
		}
	}
}

func TestMemoryLimiter_SlidingWindow_RejectAfterLimit(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 3, Window: time.Minute},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for range 3 {
		_, _ = m.Allow(ctx, "test", "user1")
	}

	res, err := m.Allow(ctx, "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Allowed {
		t.Fatal("request should be rejected after limit exceeded")
	}
	if res.Remaining != 0 {
		t.Fatalf("expected remaining 0, got %d", res.Remaining)
	}
}

func TestMemoryLimiter_SlidingWindow_AllowAfterWindowExpires(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 2, Window: 50 * time.Millisecond},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for range 2 {
		_, _ = m.Allow(ctx, "test", "user1")
	}

	res, _ := m.Allow(ctx, "test", "user1")
	if res.Allowed {
		t.Fatal("should be rejected")
	}

	time.Sleep(60 * time.Millisecond)

	res, err := m.Allow(ctx, "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Fatal("request should be allowed after window expires")
	}
}

func TestMemoryLimiter_SlidingWindow_DifferentKeysIndependent(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 1, Window: time.Minute},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	res, _ := m.Allow(ctx, "test", "user1")
	if !res.Allowed {
		t.Fatal("user1 first request should be allowed")
	}

	res, _ = m.Allow(ctx, "test", "user2")
	if !res.Allowed {
		t.Fatal("user2 first request should be allowed (independent of user1)")
	}

	res, _ = m.Allow(ctx, "test", "user1")
	if res.Allowed {
		t.Fatal("user1 second request should be rejected")
	}
}

func TestMemoryLimiter_FixedWindow_Basic(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "fixed", Limit: 3, Window: time.Minute},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for i := range 3 {
		res, err := m.Allow(ctx, "test", "user1")
		if err != nil {
			t.Fatalf("unexpected error on request %d: %v", i+1, err)
		}
		if !res.Allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	res, err := m.Allow(ctx, "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Allowed {
		t.Fatal("request should be rejected after limit exceeded")
	}
}

func TestMemoryLimiter_FixedWindow_ResetAfterExpiry(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "fixed", Limit: 2, Window: 50 * time.Millisecond},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for range 2 {
		_, _ = m.Allow(ctx, "test", "user1")
	}

	res, _ := m.Allow(ctx, "test", "user1")
	if res.Allowed {
		t.Fatal("should be rejected")
	}

	time.Sleep(60 * time.Millisecond)

	res, err := m.Allow(ctx, "test", "user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Allowed {
		t.Fatal("request should be allowed after window expires")
	}
}

func TestMemoryLimiter_UnknownCategory(t *testing.T) {
	m := NewMemoryLimiter(map[string]Category{})

	_, err := m.Allow(context.Background(), "nonexistent", "user1")
	if err == nil {
		t.Fatal("expected error for unknown category")
	}
}

func TestMemoryLimiter_Cleanup_RemovesSlidingEntries(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 10, Window: 50 * time.Millisecond},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	for range 3 {
		_, _ = m.Allow(ctx, "test", "user1")
	}

	m.mu.Lock()
	if len(m.sliding["test:user1"]) != 3 {
		t.Fatalf("expected 3 sliding entries, got %d", len(m.sliding["test:user1"]))
	}
	m.mu.Unlock()

	time.Sleep(60 * time.Millisecond)
	m.cleanup()

	m.mu.Lock()
	if _, ok := m.sliding["test:user1"]; ok {
		t.Fatal("expected sliding entries to be cleaned up")
	}
	m.mu.Unlock()
}

func TestMemoryLimiter_Cleanup_RemovesFixedEntries(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "fixed", Limit: 10, Window: 50 * time.Millisecond},
	}
	m := NewMemoryLimiter(cats)
	ctx := context.Background()

	_, _ = m.Allow(ctx, "test", "user1")

	m.mu.Lock()
	if _, ok := m.fixed["test:user1"]; !ok {
		t.Fatal("expected fixed entry to exist")
	}
	m.mu.Unlock()

	time.Sleep(60 * time.Millisecond)
	m.cleanup()

	m.mu.Lock()
	if _, ok := m.fixed["test:user1"]; ok {
		t.Fatal("expected fixed entry to be cleaned up")
	}
	m.mu.Unlock()
}

func TestMemoryLimiter_StartStop(t *testing.T) {
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 10, Window: time.Minute},
	}
	m := NewMemoryLimiter(cats)
	m.Start()
	m.Stop()
}
