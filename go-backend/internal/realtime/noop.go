package realtime

import "context"

// NoOpSessionPublisher is a SessionPublisher that does nothing.
// Used when Centrifugo is not configured (e.g. tests, local dev).
type NoOpSessionPublisher struct{}

func (NoOpSessionPublisher) StudentJoined(_ context.Context, _, _, _ string) error    { return nil }
func (NoOpSessionPublisher) CodeUpdated(_ context.Context, _, _, _ string) error      { return nil }
func (NoOpSessionPublisher) SessionEnded(_ context.Context, _, _ string) error        { return nil }
func (NoOpSessionPublisher) FeaturedStudentChanged(_ context.Context, _, _, _ string) error {
	return nil
}
func (NoOpSessionPublisher) ProblemUpdated(_ context.Context, _, _ string) error { return nil }
