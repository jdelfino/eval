package ratelimit

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func getRedisClient(t *testing.T) *redis.Client {
	t.Helper()
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}
	client := redis.NewClient(&redis.Options{Addr: addr})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Skipf("skipping redis test: %v", err)
	}
	return client
}

func TestRedisLimiter_SlidingWindow(t *testing.T) {
	client := getRedisClient(t)
	defer client.Close()

	ctx := context.Background()
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "sliding", Limit: 3, Window: time.Minute},
	}
	rl := NewRedisLimiter(client, cats)

	client.Del(ctx, "rl:test:redis-user1")

	for i := range 3 {
		res, err := rl.Allow(ctx, "test", "redis-user1")
		if err != nil {
			t.Fatalf("unexpected error on request %d: %v", i+1, err)
		}
		if !res.Allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	res, err := rl.Allow(ctx, "test", "redis-user1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Allowed {
		t.Fatal("request should be rejected after limit exceeded")
	}

	client.Del(ctx, "rl:test:redis-user1")
}

func TestRedisLimiter_FixedWindow(t *testing.T) {
	client := getRedisClient(t)
	defer client.Close()

	ctx := context.Background()
	cats := map[string]Category{
		"test": {Name: "test", Algorithm: "fixed", Limit: 2, Window: time.Minute},
	}
	rl := NewRedisLimiter(client, cats)

	keys, _ := client.Keys(ctx, "rl:test:redis-user2:*").Result()
	for _, k := range keys {
		client.Del(ctx, k)
	}

	for i := range 2 {
		res, err := rl.Allow(ctx, "test", "redis-user2")
		if err != nil {
			t.Fatalf("unexpected error on request %d: %v", i+1, err)
		}
		if !res.Allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	res, err := rl.Allow(ctx, "test", "redis-user2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Allowed {
		t.Fatal("request should be rejected after limit exceeded")
	}

	keys, _ = client.Keys(ctx, "rl:test:redis-user2:*").Result()
	for _, k := range keys {
		client.Del(ctx, k)
	}
}

func TestRedisLimiter_UnknownCategory(t *testing.T) {
	client := getRedisClient(t)
	defer client.Close()

	rl := NewRedisLimiter(client, map[string]Category{})

	_, err := rl.Allow(context.Background(), "nonexistent", "user1")
	if err == nil {
		t.Fatal("expected error for unknown category")
	}
}
