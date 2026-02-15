package ratelimit

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// fixedBucket tracks requests in a fixed time window.
type fixedBucket struct {
	count int
	start time.Time
}

// MemoryLimiter implements in-memory rate limiting with sliding and fixed window support.
type MemoryLimiter struct {
	mu         sync.Mutex
	categories map[string]Category
	sliding    map[string][]time.Time   // composite key -> timestamps
	fixed      map[string]*fixedBucket  // composite key -> bucket
	stopCh     chan struct{}
	done       chan struct{}
}

// NewMemoryLimiter creates a new in-memory rate limiter using the configured categories.
func NewMemoryLimiter(categories map[string]Category) *MemoryLimiter {
	return &MemoryLimiter{
		categories: categories,
		sliding:    make(map[string][]time.Time),
		fixed:      make(map[string]*fixedBucket),
		stopCh:     make(chan struct{}),
		done:       make(chan struct{}),
	}
}

// Start begins the background cleanup goroutine that removes expired entries
// every 5 minutes. Call Stop to terminate it.
func (m *MemoryLimiter) Start() {
	go m.cleanupLoop()
}

// Stop signals the background cleanup goroutine to stop and waits for it to finish.
func (m *MemoryLimiter) Stop() {
	close(m.stopCh)
	<-m.done
}

func (m *MemoryLimiter) cleanupLoop() {
	defer close(m.done)
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.cleanup()
		}
	}
}

func (m *MemoryLimiter) cleanup() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()

	for key, timestamps := range m.sliding {
		cat, ok := m.categoryForKey(key)
		if !ok {
			delete(m.sliding, key)
			continue
		}
		cutoff := now.Add(-cat.Window)
		valid := timestamps[:0]
		for _, t := range timestamps {
			if t.After(cutoff) {
				valid = append(valid, t)
			}
		}
		if len(valid) == 0 {
			delete(m.sliding, key)
		} else {
			m.sliding[key] = valid
		}
	}

	for key, bucket := range m.fixed {
		cat, ok := m.categoryForKey(key)
		if !ok {
			delete(m.fixed, key)
			continue
		}
		if now.Sub(bucket.start) >= cat.Window {
			delete(m.fixed, key)
		}
	}
}

// categoryForKey extracts the category name from a composite key (category:userkey).
func (m *MemoryLimiter) categoryForKey(compositeKey string) (Category, bool) {
	for name, cat := range m.categories {
		prefix := name + ":"
		if len(compositeKey) > len(prefix) && compositeKey[:len(prefix)] == prefix {
			return cat, true
		}
	}
	return Category{}, false
}

// Allow checks whether the request is within the rate limit.
func (m *MemoryLimiter) Allow(_ context.Context, category string, key string) (*Result, error) {
	cat, ok := m.categories[category]
	if !ok {
		return nil, fmt.Errorf("ratelimit: unknown category %q", category)
	}

	compositeKey := category + ":" + key

	m.mu.Lock()
	defer m.mu.Unlock()

	switch cat.Algorithm {
	case "sliding":
		return m.allowSliding(compositeKey, cat), nil
	case "fixed":
		return m.allowFixed(compositeKey, cat), nil
	default:
		return nil, fmt.Errorf("ratelimit: unknown algorithm %q", cat.Algorithm)
	}
}

func (m *MemoryLimiter) allowSliding(key string, cat Category) *Result {
	now := time.Now()
	cutoff := now.Add(-cat.Window)

	timestamps := m.sliding[key]
	valid := timestamps[:0]
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= cat.Limit {
		m.sliding[key] = valid
		resetAt := valid[0].Add(cat.Window)
		return &Result{
			Allowed:   false,
			Remaining: 0,
			ResetAt:   resetAt,
		}
	}

	valid = append(valid, now)
	m.sliding[key] = valid
	return &Result{
		Allowed:   true,
		Remaining: cat.Limit - len(valid),
		ResetAt:   now.Add(cat.Window),
	}
}

func (m *MemoryLimiter) allowFixed(key string, cat Category) *Result {
	now := time.Now()
	bucket := m.fixed[key]

	if bucket == nil || now.Sub(bucket.start) >= cat.Window {
		bucket = &fixedBucket{count: 0, start: now}
		m.fixed[key] = bucket
	}

	resetAt := bucket.start.Add(cat.Window)

	if bucket.count >= cat.Limit {
		return &Result{
			Allowed:   false,
			Remaining: 0,
			ResetAt:   resetAt,
		}
	}

	bucket.count++
	return &Result{
		Allowed:   true,
		Remaining: cat.Limit - bucket.count,
		ResetAt:   resetAt,
	}
}
