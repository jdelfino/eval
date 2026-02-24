// Package revision provides an in-memory revision buffer that auto-creates
// code revisions on save, batching writes to the database.
package revision

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/sergi/go-diff/diffmatchpatch"

	"github.com/jdelfino/eval/go-backend/internal/store"
)

// RevisionBuffer tracks in-flight code changes and periodically flushes them
// as revisions to the store.
type RevisionBuffer struct {
	mu      sync.Mutex
	entries map[string]*bufferEntry // key: studentWorkID (unique per user+problem+section)
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
	previousCode  string
	currentCode   string
	revisionNum   int
	pendingCount  int // number of Record calls since last flush
	lastUpdate    time.Time
	namespaceID   string
	userID        uuid.UUID
	sessionID     *uuid.UUID // optional (nil for practice mode)
	studentWorkID uuid.UUID
	dirty         bool // true when currentCode != previousCode
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

func bufferKey(studentWorkID uuid.UUID) string {
	return studentWorkID.String()
}

// Record records a code change. If conditions are met, it flushes a revision.
// studentWorkID is required; sessionID is optional (set during live sessions, nil for practice).
func (b *RevisionBuffer) Record(ctx context.Context, namespaceID string, studentWorkID uuid.UUID, sessionID *uuid.UUID, userID uuid.UUID, code string) {
	b.mu.Lock()
	key := bufferKey(studentWorkID)
	entry, exists := b.entries[key]

	if !exists {
		// First call: just store the entry, no revision yet.
		b.entries[key] = &bufferEntry{
			previousCode:  code,
			currentCode:   code,
			revisionNum:   0,
			lastUpdate:    b.nowFunc(),
			namespaceID:   namespaceID,
			userID:        userID,
			sessionID:     sessionID,
			studentWorkID: studentWorkID,
			dirty:         false,
		}
		b.mu.Unlock()
		return
	}

	// Update current code and session context
	entry.currentCode = code
	entry.namespaceID = namespaceID
	entry.sessionID = sessionID // may change if student joins a session later

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
		b.createRevision(ctx, e.studentWorkID, e.sessionID, e.userID, e.namespaceID, e.previousCode, e.currentCode, revNum)
		return
	}

	entry.lastUpdate = now
	b.mu.Unlock()
}

// FlushSession flushes all pending revisions for a session.
// This is called when a session ends to create final snapshot revisions for all participants.
func (b *RevisionBuffer) FlushSession(ctx context.Context, sessionID uuid.UUID) {
	b.mu.Lock()
	var toFlush []bufferEntry
	for _, entry := range b.entries {
		// Match entries that belong to this session
		if entry.sessionID != nil && *entry.sessionID == sessionID && entry.dirty {
			e := *entry
			entry.revisionNum++
			entry.previousCode = entry.currentCode
			entry.dirty = false
			toFlush = append(toFlush, e)
		}
	}
	// Clear session context for flushed entries (students may continue in practice mode)
	for key, entry := range b.entries {
		if entry.sessionID != nil && *entry.sessionID == sessionID {
			entry.sessionID = nil
			b.entries[key] = entry
		}
	}
	b.mu.Unlock()

	for _, e := range toFlush {
		b.createRevision(ctx, e.studentWorkID, &sessionID, e.userID, e.namespaceID, e.previousCode, e.currentCode, e.revisionNum+1)
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
	var toFlush []bufferEntry
	for _, entry := range b.entries {
		if !entry.dirty {
			continue
		}
		if now.Sub(entry.lastUpdate) >= b.idleTimeout {
			e := *entry
			entry.revisionNum++
			entry.previousCode = entry.currentCode
			entry.dirty = false
			toFlush = append(toFlush, e)
		}
	}
	b.mu.Unlock()

	for _, e := range toFlush {
		b.createRevision(ctx, e.studentWorkID, e.sessionID, e.userID, e.namespaceID, e.previousCode, e.currentCode, e.revisionNum+1)
	}
}

func (b *RevisionBuffer) createRevision(ctx context.Context, studentWorkID uuid.UUID, sessionID *uuid.UUID, userID uuid.UUID, namespaceID, oldCode, newCode string, revNum int) {
	isSnapshot := revNum%b.snapshotEvery == 0

	params := store.CreateRevisionParams{
		NamespaceID:   namespaceID,
		SessionID:     sessionID,
		UserID:        userID,
		StudentWorkID: &studentWorkID,
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
		b.logger.Error("failed to create revision", "error", err, "student_work_id", studentWorkID, "session_id", sessionID, "user_id", userID)
	}
}
