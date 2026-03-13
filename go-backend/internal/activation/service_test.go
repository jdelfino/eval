package activation_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/jdelfino/eval/go-backend/internal/activation"
)

// fakeRedisClient wraps a real redis.Client but lets tests inject behavior.
// We use a simple in-memory implementation via a test Redis client that skips
// on connection failure, plus a mock for the nil-client case.

// --- Nil client (no-op) ---

func TestSignalDemand_NilClient_NoOp(t *testing.T) {
	svc := activation.NewService(nil, time.Hour)
	// Must not panic or return error.
	if err := svc.SignalDemand(context.Background()); err != nil {
		t.Fatalf("SignalDemand with nil client returned error: %v", err)
	}
}

// --- Real Redis (skipped when Redis not available) ---

func getRedisClient(t *testing.T) *redis.Client {
	t.Helper()
	client := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Skipf("skipping: Redis not available: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return client
}

func TestSignalDemand_WritesToList(t *testing.T) {
	client := getRedisClient(t)
	ctx := context.Background()

	// Clean up the key before and after.
	client.Del(ctx, activation.DemandKey)
	t.Cleanup(func() { client.Del(ctx, activation.DemandKey) })

	svc := activation.NewService(client, time.Hour)
	if err := svc.SignalDemand(ctx); err != nil {
		t.Fatalf("SignalDemand error: %v", err)
	}

	// Verify the key exists and has at least 1 item.
	length, err := client.LLen(ctx, activation.DemandKey).Result()
	if err != nil {
		t.Fatalf("LLen error: %v", err)
	}
	if length < 1 {
		t.Fatalf("expected list length >= 1, got %d", length)
	}
}

func TestSignalDemand_SetsTTL(t *testing.T) {
	client := getRedisClient(t)
	ctx := context.Background()

	client.Del(ctx, activation.DemandKey)
	t.Cleanup(func() { client.Del(ctx, activation.DemandKey) })

	ttl := 2 * time.Hour
	svc := activation.NewService(client, ttl)
	if err := svc.SignalDemand(ctx); err != nil {
		t.Fatalf("SignalDemand error: %v", err)
	}

	// Verify TTL is set and roughly matches.
	remaining, err := client.TTL(ctx, activation.DemandKey).Result()
	if err != nil {
		t.Fatalf("TTL error: %v", err)
	}
	if remaining <= 0 {
		t.Fatalf("expected positive TTL, got %v", remaining)
	}
	// TTL should be close to 2 hours (within a few seconds).
	if remaining > ttl || remaining < ttl-10*time.Second {
		t.Fatalf("TTL %v is not close to expected %v", remaining, ttl)
	}
}

func TestSignalDemand_ConcurrentCallsDontInterfere(t *testing.T) {
	client := getRedisClient(t)
	ctx := context.Background()

	client.Del(ctx, activation.DemandKey)
	t.Cleanup(func() { client.Del(ctx, activation.DemandKey) })

	svc := activation.NewService(client, time.Hour)

	const n = 10
	errs := make(chan error, n)
	for range n {
		go func() {
			errs <- svc.SignalDemand(ctx)
		}()
	}
	for range n {
		if err := <-errs; err != nil {
			t.Errorf("SignalDemand concurrent error: %v", err)
		}
	}

	length, err := client.LLen(ctx, activation.DemandKey).Result()
	if err != nil {
		t.Fatalf("LLen error: %v", err)
	}
	if length < n {
		t.Fatalf("expected at least %d items in list, got %d", n, length)
	}

	// TTL must still be positive.
	remaining, err := client.TTL(ctx, activation.DemandKey).Result()
	if err != nil {
		t.Fatalf("TTL error: %v", err)
	}
	if remaining <= 0 {
		t.Fatalf("expected positive TTL after concurrent calls, got %v", remaining)
	}
}

func TestSignalDemand_AppendNotReplace(t *testing.T) {
	client := getRedisClient(t)
	ctx := context.Background()

	client.Del(ctx, activation.DemandKey)
	t.Cleanup(func() { client.Del(ctx, activation.DemandKey) })

	svc := activation.NewService(client, time.Hour)

	// Call twice; the list should grow, not be replaced.
	if err := svc.SignalDemand(ctx); err != nil {
		t.Fatalf("first SignalDemand error: %v", err)
	}
	if err := svc.SignalDemand(ctx); err != nil {
		t.Fatalf("second SignalDemand error: %v", err)
	}

	length, err := client.LLen(ctx, activation.DemandKey).Result()
	if err != nil {
		t.Fatalf("LLen error: %v", err)
	}
	if length < 2 {
		t.Fatalf("expected list length >= 2 after two calls, got %d (must append, not replace)", length)
	}
}

// Compile-time check: errors package available (used by service implementation).
var _ = errors.New
