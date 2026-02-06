package realtime

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// recordingPublisher tracks all calls to SessionPublisher methods.
type recordingPublisher struct {
	mu    sync.Mutex
	calls []string
	err   error
	done  chan struct{}
}

func newRecordingPublisher() *recordingPublisher {
	return &recordingPublisher{done: make(chan struct{}, 10)}
}

func (r *recordingPublisher) record(name string) error {
	r.mu.Lock()
	r.calls = append(r.calls, name)
	r.mu.Unlock()
	r.done <- struct{}{}
	return r.err
}

func (r *recordingPublisher) waitForCalls(t *testing.T, n int) {
	t.Helper()
	for range n {
		select {
		case <-r.done:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for async publish call")
		}
	}
}

func (r *recordingPublisher) StudentJoined(_ context.Context, _, _, _ string) error {
	return r.record("StudentJoined")
}
func (r *recordingPublisher) CodeUpdated(_ context.Context, _, _, _ string) error {
	return r.record("CodeUpdated")
}
func (r *recordingPublisher) SessionEnded(_ context.Context, _, _ string) error {
	return r.record("SessionEnded")
}
func (r *recordingPublisher) FeaturedStudentChanged(_ context.Context, _, _, _ string) error {
	return r.record("FeaturedStudentChanged")
}
func (r *recordingPublisher) ProblemUpdated(_ context.Context, _, _ string) error {
	return r.record("ProblemUpdated")
}

// Compile-time check that AsyncSessionPublisher implements SessionPublisher.
var _ SessionPublisher = (*AsyncSessionPublisher)(nil)

func TestAsyncSessionPublisher_StudentJoined(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	err := ap.StudentJoined(context.Background(), "sess-1", "user-1", "Alice")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 || rec.calls[0] != "StudentJoined" {
		t.Errorf("expected [StudentJoined], got %v", rec.calls)
	}
}

func TestAsyncSessionPublisher_CodeUpdated(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	err := ap.CodeUpdated(context.Background(), "sess-1", "user-1", "code")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 || rec.calls[0] != "CodeUpdated" {
		t.Errorf("expected [CodeUpdated], got %v", rec.calls)
	}
}

func TestAsyncSessionPublisher_SessionEnded(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	err := ap.SessionEnded(context.Background(), "sess-1", "completed")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 || rec.calls[0] != "SessionEnded" {
		t.Errorf("expected [SessionEnded], got %v", rec.calls)
	}
}

func TestAsyncSessionPublisher_FeaturedStudentChanged(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	err := ap.FeaturedStudentChanged(context.Background(), "sess-1", "user-1", "code")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 || rec.calls[0] != "FeaturedStudentChanged" {
		t.Errorf("expected [FeaturedStudentChanged], got %v", rec.calls)
	}
}

func TestAsyncSessionPublisher_ProblemUpdated(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	err := ap.ProblemUpdated(context.Background(), "sess-1", "prob-1")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 || rec.calls[0] != "ProblemUpdated" {
		t.Errorf("expected [ProblemUpdated], got %v", rec.calls)
	}
}

func TestAsyncSessionPublisher_ErrorsAreSwallowed(t *testing.T) {
	rec := newRecordingPublisher()
	rec.err = errors.New("publish failed")
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	// The async call should return nil even when the underlying publisher fails.
	err := ap.StudentJoined(context.Background(), "sess-1", "user-1", "Alice")
	if err != nil {
		t.Fatalf("expected nil error from async call, got %v", err)
	}

	rec.waitForCalls(t, 1)
	// The goroutine ran; the error was logged but not returned.
	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 {
		t.Errorf("expected underlying publisher to be called once, got %d", len(rec.calls))
	}
}

func TestAsyncSessionPublisher_MultipleCalls(t *testing.T) {
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	_ = ap.StudentJoined(context.Background(), "s1", "u1", "Alice")
	_ = ap.CodeUpdated(context.Background(), "s1", "u1", "code")
	_ = ap.SessionEnded(context.Background(), "s1", "done")

	rec.waitForCalls(t, 3)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 3 {
		t.Errorf("expected 3 calls, got %d: %v", len(rec.calls), rec.calls)
	}
}

func TestAsyncSessionPublisher_DetachesContext(t *testing.T) {
	// Verify that canceling the parent context does NOT cancel the async operation.
	rec := newRecordingPublisher()
	ap := NewAsyncSessionPublisher(rec, discardLogger())

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before calling

	err := ap.StudentJoined(ctx, "sess-1", "user-1", "Alice")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	rec.waitForCalls(t, 1)

	rec.mu.Lock()
	defer rec.mu.Unlock()
	if len(rec.calls) != 1 {
		t.Errorf("expected 1 call even with cancelled context, got %d", len(rec.calls))
	}
}
