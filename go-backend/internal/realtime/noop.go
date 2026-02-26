package realtime

import (
	"context"
	"encoding/json"
)

// Compile-time interface compliance check.
var _ SessionPublisher = NoOpSessionPublisher{}

// NoOpSessionPublisher is a SessionPublisher that does nothing.
// Used when Centrifugo is not configured (e.g. tests, local dev).
type NoOpSessionPublisher struct{}

func (NoOpSessionPublisher) StudentJoined(_ context.Context, _, _, _ string) error    { return nil }
func (NoOpSessionPublisher) CodeUpdated(_ context.Context, _, _, _ string, _ json.RawMessage) error {
	return nil
}
func (NoOpSessionPublisher) SessionEnded(_ context.Context, _, _ string) error        { return nil }
func (NoOpSessionPublisher) SessionReplaced(_ context.Context, _, _ string) error     { return nil }
func (NoOpSessionPublisher) FeaturedStudentChanged(_ context.Context, _, _, _ string, _ json.RawMessage) error {
	return nil
}
func (NoOpSessionPublisher) ProblemUpdated(_ context.Context, _, _ string) error { return nil }
func (NoOpSessionPublisher) SessionStartedInSection(_ context.Context, _, _ string, _ json.RawMessage) error {
	return nil
}
func (NoOpSessionPublisher) SessionEndedInSection(_ context.Context, _, _ string) error { return nil }
