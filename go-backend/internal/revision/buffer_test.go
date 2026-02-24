package revision

import (
	"context"
	"log/slog"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jdelfino/eval/go-backend/internal/store"
)

// --- mock revision repository ---

type mockRevisionRepo struct {
	mu        sync.Mutex
	revisions []store.CreateRevisionParams
	err       error
}

func (m *mockRevisionRepo) ListRevisions(_ context.Context, _ uuid.UUID, _ *uuid.UUID) ([]store.Revision, error) {
	return nil, nil
}

func (m *mockRevisionRepo) CreateRevision(_ context.Context, params store.CreateRevisionParams) (*store.Revision, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return nil, m.err
	}
	m.revisions = append(m.revisions, params)
	// SessionID is now *uuid.UUID in the Revision struct
	var sessionIDPtr *uuid.UUID
	if params.SessionID != nil {
		sid := *params.SessionID
		sessionIDPtr = &sid
	}
	return &store.Revision{
		ID:        uuid.New(),
		SessionID: sessionIDPtr,
		UserID:    params.UserID,
		IsDiff:    params.IsDiff,
		Diff:      params.Diff,
		FullCode:  params.FullCode,
	}, nil
}

func (m *mockRevisionRepo) getRevisions() []store.CreateRevisionParams {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]store.CreateRevisionParams, len(m.revisions))
	copy(cp, m.revisions)
	return cp
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// --- Tests ---

func TestRecord_FirstCallNoFlush(t *testing.T) {
	// First Record call should just store the entry, not create a revision
	// (there's no previous code to diff against).
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "print('hello')")

	revs := repo.getRevisions()
	if len(revs) != 0 {
		t.Fatalf("expected 0 revisions on first call, got %d", len(revs))
	}
}

func TestRecord_FlushOnIdleTimeout(t *testing.T) {
	// When enough time has passed since lastUpdate and code changed, should flush.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0 // immediately "idle"

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	// First call: sets previousCode
	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "v1")

	// Second call with different code: should flush because idle timeout is 0
	buf.nowFunc = func() time.Time { return fixedTime.Add(1 * time.Second) }
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "v2")

	revs := repo.getRevisions()
	if len(revs) != 1 {
		t.Fatalf("expected 1 revision after idle flush, got %d", len(revs))
	}
	if revs[0].SessionID == nil || *revs[0].SessionID != sessionID {
		t.Errorf("wrong session_id")
	}
	if revs[0].UserID != userID {
		t.Errorf("wrong user_id")
	}
}

func TestRecord_NoFlushWhenCodeUnchanged(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "same")
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "same")

	revs := repo.getRevisions()
	if len(revs) != 0 {
		t.Fatalf("expected 0 revisions when code unchanged, got %d", len(revs))
	}
}

func TestRecord_FullSnapshotEvery10th(t *testing.T) {
	// Every 10th revision should be a full snapshot (is_diff=false).
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0
	buf.snapshotEvery = 10

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	// Generate 10 revisions
	for i := 0; i < 11; i++ {
		buf.nowFunc = func() time.Time { return fixedTime.Add(time.Duration(i) * time.Second) }
		code := string(rune('a' + i))
		buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, code)
	}

	revs := repo.getRevisions()
	if len(revs) != 10 {
		t.Fatalf("expected 10 revisions, got %d", len(revs))
	}

	// The 10th (index 9, revisionNum 10) should be a full snapshot
	if revs[9].IsDiff {
		t.Errorf("expected 10th revision to be full snapshot (is_diff=false)")
	}
	if revs[9].FullCode == nil {
		t.Errorf("expected 10th revision to have full_code set")
	}

	// Others should be diffs (assuming small changes)
	if !revs[0].IsDiff {
		t.Errorf("expected 1st revision to be a diff")
	}
}

func TestRecord_LargeDiffStoresFullSnapshot(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0
	buf.maxDiffLen = 10 // very small threshold

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "short")

	// Large change
	buf.nowFunc = func() time.Time { return fixedTime.Add(time.Second) }
	longCode := "this is a very long piece of code that exceeds the max diff length threshold"
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, longCode)

	revs := repo.getRevisions()
	if len(revs) != 1 {
		t.Fatalf("expected 1 revision, got %d", len(revs))
	}
	if revs[0].IsDiff {
		t.Errorf("expected full snapshot when diff exceeds maxDiffLen")
	}
	if revs[0].FullCode == nil || *revs[0].FullCode != longCode {
		t.Errorf("expected full_code to be the new code")
	}
}

func TestRecord_FlushOnMaxBuffer(t *testing.T) {
	// When revisionNum hits maxBuffer, should flush.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 1 * time.Hour // won't trigger from idle
	buf.maxBuffer = 3

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	// Build up entries without flushing (idle timeout is huge)
	for i := 0; i < 5; i++ {
		buf.nowFunc = func() time.Time { return fixedTime }
		code := string(rune('a' + i))
		buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, code)
	}

	revs := repo.getRevisions()
	// Should have flushed at least once when buffer hit 3
	if len(revs) < 1 {
		t.Fatalf("expected at least 1 revision from buffer overflow, got %d", len(revs))
	}
}

func TestFlushSession_FlushesPendingRevisions(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 1 * time.Hour // won't auto-flush

	sessionID := uuid.New()
	userID := uuid.New()
	userID2 := uuid.New()
	studentWorkID := uuid.New()
	studentWorkID2 := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }

	// Record some code changes (won't auto-flush due to high idle timeout)
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code1")
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code2")
	buf.Record(context.Background(), "ns", studentWorkID2, &sessionID, userID2, "other1")
	buf.Record(context.Background(), "ns", studentWorkID2, &sessionID, userID2, "other2")

	// No revisions yet
	if len(repo.getRevisions()) != 0 {
		t.Fatalf("expected 0 revisions before flush")
	}

	// Flush the session
	buf.FlushSession(context.Background(), sessionID)

	revs := repo.getRevisions()
	if len(revs) != 2 {
		t.Fatalf("expected 2 revisions (one per user), got %d", len(revs))
	}
}

func TestFlushSession_RemovesEntries(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 1 * time.Hour

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }

	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code1")
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code2")
	buf.FlushSession(context.Background(), sessionID)

	// After flush, entries should have sessionID cleared (for practice mode continuation)
	buf.mu.Lock()
	for _, entry := range buf.entries {
		if entry.sessionID != nil {
			t.Errorf("expected sessionID to be nil after flush, got %v", entry.sessionID)
		}
	}
	buf.mu.Unlock()
}

func TestBackgroundFlush(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 10 * time.Millisecond
	buf.backgroundFlush = 50 * time.Millisecond

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	var clockMu sync.Mutex
	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return fixedTime
	}

	buf.Start()
	defer buf.Stop()

	// First call: sets previous
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "v1")

	// Second call: code differs, but idleTimeout hasn't passed (same timestamp)
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "v2")

	// Now advance the clock so background flush sees it as idle
	clockMu.Lock()
	fixedTime = fixedTime.Add(1 * time.Second)
	clockMu.Unlock()

	// Wait for background flush
	time.Sleep(200 * time.Millisecond)

	revs := repo.getRevisions()
	if len(revs) < 1 {
		t.Fatalf("expected background flush to create at least 1 revision, got %d", len(revs))
	}
}

func TestRecord_NamespaceIDPropagated(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }
	buf.Record(context.Background(), "test-ns", studentWorkID, &sessionID, userID, "v1")

	buf.nowFunc = func() time.Time { return fixedTime.Add(time.Second) }
	buf.Record(context.Background(), "test-ns", studentWorkID, &sessionID, userID, "v2")

	revs := repo.getRevisions()
	if len(revs) != 1 {
		t.Fatalf("expected 1 revision, got %d", len(revs))
	}
	if revs[0].NamespaceID != "test-ns" {
		t.Errorf("expected namespace_id 'test-ns', got %q", revs[0].NamespaceID)
	}
}

func TestRecord_DiffContent(t *testing.T) {
	// When a diff is created, it should contain actual diff content.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 0

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "hello")

	buf.nowFunc = func() time.Time { return fixedTime.Add(time.Second) }
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "hello world")

	revs := repo.getRevisions()
	if len(revs) != 1 {
		t.Fatalf("expected 1 revision, got %d", len(revs))
	}
	if !revs[0].IsDiff {
		t.Errorf("expected is_diff=true for small change")
	}
	if revs[0].Diff == nil || *revs[0].Diff == "" {
		t.Errorf("expected non-empty diff content")
	}
}

func TestFlushSession_NoPendingChanges(t *testing.T) {
	// FlushSession with no pending changes should be a no-op.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())

	buf.FlushSession(context.Background(), uuid.New())

	if len(repo.getRevisions()) != 0 {
		t.Fatalf("expected 0 revisions for no-op flush")
	}
}

func TestFlushSession_NoDirtyEntryNoRevision(t *testing.T) {
	// If only one Record call was made, entry is not dirty (previousCode == currentCode).
	// FlushSession should not create a revision.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 1 * time.Hour

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }

	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code1")

	buf.FlushSession(context.Background(), sessionID)

	revs := repo.getRevisions()
	if len(revs) != 0 {
		t.Fatalf("expected 0 revisions when entry is not dirty, got %d", len(revs))
	}
}

func TestFlushSession_DirtyEntryCreatesRevision(t *testing.T) {
	// Two Records with different code, no auto-flush. FlushSession should flush.
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.idleTimeout = 1 * time.Hour

	sessionID := uuid.New()
	userID := uuid.New()
	studentWorkID := uuid.New()

	fixedTime := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	buf.nowFunc = func() time.Time { return fixedTime }

	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code1")
	buf.Record(context.Background(), "ns", studentWorkID, &sessionID, userID, "code2")

	buf.FlushSession(context.Background(), sessionID)

	revs := repo.getRevisions()
	if len(revs) != 1 {
		t.Fatalf("expected 1 revision, got %d", len(revs))
	}
}

func TestStopIsIdempotent(t *testing.T) {
	repo := &mockRevisionRepo{}
	buf := NewRevisionBuffer(repo, testLogger())
	buf.Start()
	buf.Stop()
	// Calling Stop again should not panic
	buf.Stop()
}
