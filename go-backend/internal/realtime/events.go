package realtime

import "time"

// EventType identifies the kind of real-time event.
type EventType string

const (
	EventStudentJoined          EventType = "student_joined"
	EventStudentCodeUpdated     EventType = "student_code_updated"
	EventSessionEnded           EventType = "session_ended"
	EventFeaturedStudentChanged EventType = "featured_student_changed"
	EventProblemUpdated         EventType = "problem_updated"
)

// Event is the envelope sent over Centrifugo channels.
type Event struct {
	Type      EventType `json:"type"`
	Data      any       `json:"data"`
	Timestamp time.Time `json:"timestamp"`
}

// StudentJoinedData is the payload for EventStudentJoined.
type StudentJoinedData struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
}

// StudentCodeUpdatedData is the payload for EventStudentCodeUpdated.
type StudentCodeUpdatedData struct {
	UserID string `json:"user_id"`
	Code   string `json:"code"`
}

// SessionEndedData is the payload for EventSessionEnded.
type SessionEndedData struct {
	SessionID string `json:"session_id"`
	Reason    string `json:"reason"`
}

// FeaturedStudentChangedData is the payload for EventFeaturedStudentChanged.
type FeaturedStudentChangedData struct {
	UserID string `json:"user_id"`
	Code   string `json:"code"`
}

// ProblemUpdatedData is the payload for EventProblemUpdated.
type ProblemUpdatedData struct {
	ProblemID string `json:"problem_id"`
}
