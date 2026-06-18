package realtime

import (
	"encoding/json"
	"time"
)

// EventType identifies the kind of real-time event.
type EventType string

const (
	EventStudentJoined           EventType = "student_joined"
	EventStudentCodeUpdated      EventType = "student_code_updated"
	EventSessionEnded            EventType = "session_ended"
	EventFeaturedStudentChanged  EventType = "featured_student_changed"
	EventProblemUpdated          EventType = "problem_updated"
	EventSessionStartedInSection EventType = "session_started_in_section"
	EventSessionEndedInSection   EventType = "session_ended_in_section"
	EventSectionCurrentChanged   EventType = "section_current_changed"
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
	UserID    string          `json:"user_id"`
	Code      string          `json:"code"`
	TestCases json.RawMessage `json:"test_cases,omitempty"`
}

// SessionEndedData is the payload for EventSessionEnded.
type SessionEndedData struct {
	SessionID string `json:"session_id"`
	Reason    string `json:"reason"`
}

// FeaturedStudentChangedData is the payload for EventFeaturedStudentChanged.
type FeaturedStudentChangedData struct {
	UserID    string          `json:"user_id"`
	Code      string          `json:"code"`
	TestCases json.RawMessage `json:"test_cases,omitempty"`
}

// ProblemUpdatedData is the payload for EventProblemUpdated.
type ProblemUpdatedData struct {
	ProblemID string `json:"problem_id"`
}

// SessionStartedInSectionData is the payload for EventSessionStartedInSection.
type SessionStartedInSectionData struct {
	SessionID string          `json:"session_id"`
	Problem   json.RawMessage `json:"problem"`
}

// SessionEndedInSectionData is the payload for EventSessionEndedInSection.
type SessionEndedInSectionData struct {
	SessionID string `json:"session_id"`
}

// SectionCurrentChangedData is the payload for EventSectionCurrentChanged.
// Published on the section channel when the section's current-session pointer
// changes (G4 section-pointer model): SessionID is the new current session id,
// or nil when the pointer was cleared. Problem carries the new session's
// problem snapshot for late join and is omitted when the pointer is cleared.
type SectionCurrentChangedData struct {
	SessionID *string         `json:"session_id"`
	Problem   json.RawMessage `json:"problem,omitempty"`
}
