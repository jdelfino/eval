package realtime

import (
	"context"
	"fmt"
	"time"
)

// SessionPublisher provides typed methods for publishing session events.
type SessionPublisher interface {
	StudentJoined(ctx context.Context, sessionID, userID, displayName string) error
	CodeUpdated(ctx context.Context, sessionID, userID, code string) error
	SessionEnded(ctx context.Context, sessionID, reason string) error
	FeaturedStudentChanged(ctx context.Context, sessionID, userID, code string) error
	ProblemUpdated(ctx context.Context, sessionID, problemID string) error
}

type sessionPublisher struct {
	publisher Publisher
	now       func() time.Time
}

// NewSessionPublisher creates a SessionPublisher that wraps the given Publisher.
func NewSessionPublisher(publisher Publisher) SessionPublisher {
	return &sessionPublisher{
		publisher: publisher,
		now:       time.Now,
	}
}

func sessionChannel(sessionID string) string {
	return fmt.Sprintf("session:%s", sessionID)
}

func (s *sessionPublisher) publish(ctx context.Context, sessionID string, eventType EventType, data any) error {
	event := Event{
		Type:      eventType,
		Data:      data,
		Timestamp: s.now(),
	}
	return s.publisher.Publish(ctx, sessionChannel(sessionID), event)
}

func (s *sessionPublisher) StudentJoined(ctx context.Context, sessionID, userID, displayName string) error {
	return s.publish(ctx, sessionID, EventStudentJoined, StudentJoinedData{
		UserID:      userID,
		DisplayName: displayName,
	})
}

func (s *sessionPublisher) CodeUpdated(ctx context.Context, sessionID, userID, code string) error {
	return s.publish(ctx, sessionID, EventStudentCodeUpdated, StudentCodeUpdatedData{
		UserID: userID,
		Code:   code,
	})
}

func (s *sessionPublisher) SessionEnded(ctx context.Context, sessionID, reason string) error {
	return s.publish(ctx, sessionID, EventSessionEnded, SessionEndedData{
		SessionID: sessionID,
		Reason:    reason,
	})
}

func (s *sessionPublisher) FeaturedStudentChanged(ctx context.Context, sessionID, userID, code string) error {
	return s.publish(ctx, sessionID, EventFeaturedStudentChanged, FeaturedStudentChangedData{
		UserID: userID,
		Code:   code,
	})
}

func (s *sessionPublisher) ProblemUpdated(ctx context.Context, sessionID, problemID string) error {
	return s.publish(ctx, sessionID, EventProblemUpdated, ProblemUpdatedData{
		ProblemID: problemID,
	})
}
