// Package revision provides an in-memory revision buffer that auto-creates
// code revisions on save, batching writes to the database.
package revision

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sergi/go-diff/diffmatchpatch"

	"github.com/jdelfino/eval/internal/store"
)

// RevisionBuffer tracks in-flight code changes and periodically flushes them
// as revisions to the store.
type RevisionBuffer struct {
	mu      sync.Mutex
	entries map[string]*bufferEntry // key: "sessionID:userID"
	store   store.RevisionRepository
	logger  *slog.Logger
	stopCh  chan struct{}
	stopped bool

	// Configurable for testing.
	idleTimeout     time.Duration
	backgroundFlush time.Duration
	maxBuffer       int
	snapshotEvery   int
	maxDiffLen      int

	nowFunc func() time.Time // injectable clock
}

type bufferEntry struct {
	previousCode string
	currentCode  string
	revisionNum  int
	pendingCount int // number of Record calls since last flush
	lastUpdate   time.Time
	namespaceID  string
	dirty        bool // true when currentCode != previousCode
}

// NewRevisionBuffer creates a new RevisionBuffer.
func NewRevisionBuffer(s store.RevisionRepository, logger *slog.Logger) *RevisionBuffer {
	return &RevisionBuffer{
		entries:         make(map[string]*bufferEntry),
		store:           s,
		logger:          logger,
		stopCh:          make(chan struct{}),
		idleTimeout:     5 * time.Second,
		backgroundFlush: 30 * time.Second,
		maxBuffer:       100,
		snapshotEvery:   10,
		maxDiffLen:      1000,
		nowFunc:         time.Now,
	}
}

func bufferKey(sessionID, userID uuid.UUID) string {
	return sessionID.String() + ":" + userID.String()
}

// Record records a code change. If conditions are met, it flushes a revision.
func (b *RevisionBuffer) Record(ctx context.Context, namespaceID string, sessionID, userID uuid.UUID, code string) {
	b.mu.Lock()
	key := bufferKey(sessionID, userID)
	entry, exists := b.entries[key]

	if !exists {
		// First call: just store the entry, no revision yet.
		b.entries[key] = &bufferEntry{
			previousCode: code,
			currentCode:  code,
			revisionNum:  0,
			lastUpdate:   b.nowFunc(),
			namespaceID:  namespaceID,
			dirty:        false,
		}
		b.mu.Unlock()
		return
	}

	// Update current code
	entry.currentCode = code
	entry.namespaceID = namespaceID

	if entry.currentCode == entry.previousCode {
		// No change
		b.mu.Unlock()
		return
	}

	entry.dirty = true
	entry.pendingCount++
	now := b.nowFunc()
	shouldFlush := now.Sub(entry.lastUpdate) >= b.idleTimeout || entry.pendingCount >= b.maxBuffer

	if shouldFlush {
		// Copy what we need and flush outside the lock
		e := *entry
		entry.revisionNum++
		entry.previousCode = entry.currentCode
		entry.lastUpdate = now
		entry.dirty = false
		entry.pendingCount = 0
		revNum := entry.revisionNum
		b.mu.Unlock()
		b.createRevision(ctx, sessionID, userID, e.namespaceID, e.previousCode, e.currentCode, revNum)
		return
	}

	entry.lastUpdate = now
	b.mu.Unlock()
}

// FlushSession flushes all pending revisions for a session.
func (b *RevisionBuffer) FlushSession(ctx context.Context, sessionID uuid.UUID) {
	prefix := sessionID.String() + ":"
	b.mu.Lock()
	var toFlush []struct {
		key   string
		entry bufferEntry
		userID uuid.UUID
	}
	for key, entry := range b.entries {
		if strings.HasPrefix(key, prefix) && entry.dirty {
			e := *entry
			entry.revisionNum++
			userIDStr := key[len(prefix):]
			uid, err := uuid.Parse(userIDStr)
			if err != nil {
				continue
			}
			toFlush = append(toFlush, struct {
				key   string
				entry bufferEntry
				userID uuid.UUID
			}{key, e, uid})
		}
	}
	// Remove all entries for this session
	for key := range b.entries {
		if strings.HasPrefix(key, prefix) {
			delete(b.entries, key)
		}
	}
	b.mu.Unlock()

	for _, f := range toFlush {
		b.createRevision(ctx, sessionID, f.userID, f.entry.namespaceID, f.entry.previousCode, f.entry.currentCode, f.entry.revisionNum+1)
	}
}

// Start starts the background flush goroutine.
func (b *RevisionBuffer) Start() {
	go b.backgroundLoop()
}

// Stop stops the background flush goroutine.
func (b *RevisionBuffer) Stop() {
	b.mu.Lock()
	if b.stopped {
		b.mu.Unlock()
		return
	}
	b.stopped = true
	b.mu.Unlock()
	close(b.stopCh)
}

func (b *RevisionBuffer) backgroundLoop() {
	ticker := time.NewTicker(b.backgroundFlush)
	defer ticker.Stop()
	for {
		select {
		case <-b.stopCh:
			return
		case <-ticker.C:
			b.flushIdle(context.Background())
		}
	}
}

func (b *RevisionBuffer) flushIdle(ctx context.Context) {
	b.mu.Lock()
	now := b.nowFunc()
	var toFlush []struct {
		sessionID uuid.UUID
		userID    uuid.UUID
		entry     bufferEntry
		revNum    int
	}
	for key, entry := range b.entries {
		if !entry.dirty {
			continue
		}
		if now.Sub(entry.lastUpdate) >= b.idleTimeout {
			parts := strings.SplitN(key, ":", 2)
			sid, err1 := uuid.Parse(parts[0])
			uid, err2 := uuid.Parse(parts[1])
			if err1 != nil || err2 != nil {
				continue
			}
			e := *entry
			entry.revisionNum++
			entry.previousCode = entry.currentCode
			entry.dirty = false
			toFlush = append(toFlush, struct {
				sessionID uuid.UUID
				userID    uuid.UUID
				entry     bufferEntry
				revNum    int
			}{sid, uid, e, entry.revisionNum})
		}
	}
	b.mu.Unlock()

	for _, f := range toFlush {
		b.createRevision(ctx, f.sessionID, f.userID, f.entry.namespaceID, f.entry.previousCode, f.entry.currentCode, f.revNum)
	}
}

func (b *RevisionBuffer) createRevision(ctx context.Context, sessionID, userID uuid.UUID, namespaceID, oldCode, newCode string, revNum int) {
	isSnapshot := revNum%b.snapshotEvery == 0

	params := store.CreateRevisionParams{
		NamespaceID: namespaceID,
		SessionID:   sessionID,
		UserID:      userID,
	}

	if isSnapshot {
		params.IsDiff = false
		params.FullCode = &newCode
	} else {
		// Compute diff
		dmp := diffmatchpatch.New()
		diffs := dmp.DiffMain(oldCode, newCode, true)
		diffText := dmp.DiffToDelta(diffs)

		if len(diffText) < b.maxDiffLen {
			params.IsDiff = true
			params.Diff = &diffText
		} else {
			params.IsDiff = false
			params.FullCode = &newCode
		}
	}

	if _, err := b.store.CreateRevision(ctx, params); err != nil {
		b.logger.Error("failed to create revision", "error", err, "session_id", sessionID, "user_id", userID)
	}
}
