// Package activation provides a service for signaling executor demand to Redis
// so that KEDA can scale the executor from zero replicas.
package activation

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// DemandKey is the Redis list key used to signal executor demand.
// Exported so tests can verify and clean up the key.
const DemandKey = "executor:demand"

// Service signals executor demand by writing to a Redis list.
// KEDA monitors the list length (LLEN) to decide whether to scale from zero.
type Service struct {
	redis *redis.Client
	ttl   time.Duration
}

// NewService creates a new activation Service. If redisClient is nil, all
// calls to SignalDemand are no-ops (suitable for local dev without Redis).
func NewService(redisClient *redis.Client, ttl time.Duration) *Service {
	return &Service{
		redis: redisClient,
		ttl:   ttl,
	}
}

// SignalDemand pushes a demand signal to the Redis list and refreshes its TTL.
// The KEDA ScaledObject monitors LLEN(executor:demand) to detect activity and
// activate the executor from zero replicas. The TTL ensures the key expires
// automatically when there is no demand.
//
// If the Redis client is nil, this is a no-op.
func (s *Service) SignalDemand(ctx context.Context) error {
	if s.redis == nil {
		return nil
	}

	pipe := s.redis.Pipeline()
	pipe.LPush(ctx, DemandKey, "1")
	pipe.Expire(ctx, DemandKey, s.ttl)
	_, err := pipe.Exec(ctx)
	return err
}
