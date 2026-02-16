package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Lua script for sliding window rate limiting using a sorted set.
var slidingWindowScript = redis.NewScript(`
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local member = ARGV[3]
local limit = tonumber(ARGV[4])
local window_sec = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
local count = redis.call('ZCARD', key)

if count >= limit then
    return {count, 0}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, window_sec)

return {count + 1, 1}
`)

// Lua script for fixed window rate limiting using INCR.
var fixedWindowScript = redis.NewScript(`
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_sec = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window_sec)
end

if count > limit then
    return {count, 0}
end

return {count, 1}
`)

// RedisLimiter implements rate limiting backed by Redis.
type RedisLimiter struct {
	client     redis.Cmdable
	categories map[string]Category
}

// NewRedisLimiter creates a new Redis-backed rate limiter.
func NewRedisLimiter(client redis.Cmdable, categories map[string]Category) *RedisLimiter {
	return &RedisLimiter{
		client:     client,
		categories: categories,
	}
}

// Allow checks whether the request is allowed under the configured rate limit.
func (r *RedisLimiter) Allow(ctx context.Context, category string, key string) (*Result, error) {
	cat, ok := r.categories[category]
	if !ok {
		return nil, fmt.Errorf("ratelimit: unknown category %q", category)
	}

	switch cat.Algorithm {
	case "sliding":
		return r.allowSliding(ctx, cat, key)
	case "fixed":
		return r.allowFixed(ctx, cat, key)
	default:
		return nil, fmt.Errorf("ratelimit: unknown algorithm %q", cat.Algorithm)
	}
}

func (r *RedisLimiter) allowSliding(ctx context.Context, cat Category, key string) (*Result, error) {
	now := time.Now()
	redisKey := fmt.Sprintf("rl:%s:%s", cat.Name, key)
	windowStart := now.Add(-cat.Window)
	windowSec := int(cat.Window.Seconds())
	member := fmt.Sprintf("%d", now.UnixNano())

	result, err := slidingWindowScript.Run(ctx, r.client, []string{redisKey},
		fmt.Sprintf("%f", float64(windowStart.UnixNano())/1e9),
		fmt.Sprintf("%f", float64(now.UnixNano())/1e9),
		member,
		cat.Limit,
		windowSec,
	).Int64Slice()
	if err != nil {
		return nil, fmt.Errorf("ratelimit: redis sliding window error: %w", err)
	}

	count := int(result[0])
	allowed := result[1] == 1
	remaining := cat.Limit - count
	if remaining < 0 {
		remaining = 0
	}

	return &Result{
		Allowed:   allowed,
		Remaining: remaining,
		ResetAt:   now.Add(cat.Window),
	}, nil
}

func (r *RedisLimiter) allowFixed(ctx context.Context, cat Category, key string) (*Result, error) {
	now := time.Now()
	windowSec := int(cat.Window.Seconds())
	windowStart := now.Truncate(cat.Window)
	redisKey := fmt.Sprintf("rl:%s:%s:%d", cat.Name, key, windowStart.Unix())

	result, err := fixedWindowScript.Run(ctx, r.client, []string{redisKey},
		cat.Limit,
		windowSec,
	).Int64Slice()
	if err != nil {
		return nil, fmt.Errorf("ratelimit: redis fixed window error: %w", err)
	}

	count := int(result[0])
	allowed := result[1] == 1
	remaining := cat.Limit - count
	if remaining < 0 {
		remaining = 0
	}

	return &Result{
		Allowed:   allowed,
		Remaining: remaining,
		ResetAt:   windowStart.Add(cat.Window),
	}, nil
}
