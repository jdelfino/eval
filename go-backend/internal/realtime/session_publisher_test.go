package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

type mockPublisher struct {
	channel string
	data    any
	err     error
}

func (m *mockPublisher) Publish(_ context.Context, channel string, data any) error {
	m.channel = channel
	m.data = data
	return m.err
}

func fixedTime() time.Time {
	return time.Date(2025, 6, 15, 12, 0, 0, 0, time.UTC)
}

func newTestPublisher() (*mockPublisher, SessionPublisher) {
	mock := &mockPublisher{}
	sp := &sessionPublisher{
		publisher: mock,
		now:       fixedTime,
	}
	return mock, sp
}

func TestStudentJoined(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.StudentJoined(context.Background(), "sess-1", "user-1", "Alice")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:sess-1" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:sess-1")
	}
	event, ok := mock.data.(Event)
	if !ok {
		t.Fatalf("data is not Event")
	}
	if event.Type != EventStudentJoined {
		t.Errorf("type = %q, want %q", event.Type, EventStudentJoined)
	}
	if event.Timestamp != fixedTime() {
		t.Errorf("timestamp = %v, want %v", event.Timestamp, fixedTime())
	}
	data, ok := event.Data.(StudentJoinedData)
	if !ok {
		t.Fatalf("payload is not StudentJoinedData")
	}
	if data.UserID != "user-1" || data.DisplayName != "Alice" {
		t.Errorf("payload = %+v", data)
	}
}

func TestCodeUpdated(t *testing.T) {
	mock, sp := newTestPublisher()
	testCases := json.RawMessage(`[{"name":"Case 1","input":"world\n","match_type":"exact"}]`)
	err := sp.CodeUpdated(context.Background(), "sess-2", "user-2", "fmt.Println()", testCases)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:sess-2" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:sess-2")
	}
	event := mock.data.(Event)
	if event.Type != EventStudentCodeUpdated {
		t.Errorf("type = %q, want %q", event.Type, EventStudentCodeUpdated)
	}
	data := event.Data.(StudentCodeUpdatedData)
	if data.UserID != "user-2" || data.Code != "fmt.Println()" {
		t.Errorf("payload = %+v", data)
	}
	if string(data.TestCases) != `[{"name":"Case 1","input":"world\n","match_type":"exact"}]` {
		t.Errorf("test_cases = %q, want %q", string(data.TestCases), `[{"name":"Case 1","input":"world\n","match_type":"exact"}]`)
	}
}

func TestCodeUpdated_NilTestCases(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.CodeUpdated(context.Background(), "sess-2", "user-2", "fmt.Println()", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(StudentCodeUpdatedData)
	if data.TestCases != nil {
		t.Errorf("expected nil test_cases, got %q", string(data.TestCases))
	}
}

func TestSessionEnded(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.SessionEnded(context.Background(), "sess-3", "timeout")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:sess-3" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:sess-3")
	}
	event := mock.data.(Event)
	if event.Type != EventSessionEnded {
		t.Errorf("type = %q, want %q", event.Type, EventSessionEnded)
	}
	data := event.Data.(SessionEndedData)
	if data.SessionID != "sess-3" || data.Reason != "timeout" {
		t.Errorf("payload = %+v", data)
	}
}

func TestSessionReplaced(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.SessionReplaced(context.Background(), "old-sess", "new-sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:old-sess" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:old-sess")
	}
	event := mock.data.(Event)
	if event.Type != EventSessionReplaced {
		t.Errorf("type = %q, want %q", event.Type, EventSessionReplaced)
	}
	data := event.Data.(SessionReplacedData)
	if data.NewSessionID != "new-sess" {
		t.Errorf("payload = %+v", data)
	}
}

func TestFeaturedStudentChanged(t *testing.T) {
	mock, sp := newTestPublisher()
	testCases := json.RawMessage(`[{"name":"Case 1","input":"hello\n","match_type":"exact"}]`)
	err := sp.FeaturedStudentChanged(context.Background(), "sess-4", "user-4", "x := 1", testCases)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:sess-4" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:sess-4")
	}
	event := mock.data.(Event)
	if event.Type != EventFeaturedStudentChanged {
		t.Errorf("type = %q, want %q", event.Type, EventFeaturedStudentChanged)
	}
	data := event.Data.(FeaturedStudentChangedData)
	if data.UserID != "user-4" || data.Code != "x := 1" {
		t.Errorf("payload = %+v", data)
	}
	if string(data.TestCases) != `[{"name":"Case 1","input":"hello\n","match_type":"exact"}]` {
		t.Errorf("test_cases = %q, want %q", string(data.TestCases), `[{"name":"Case 1","input":"hello\n","match_type":"exact"}]`)
	}
}

func TestFeaturedStudentChanged_NilTestCases(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.FeaturedStudentChanged(context.Background(), "sess-4", "user-4", "x := 1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(FeaturedStudentChangedData)
	if data.TestCases != nil {
		t.Errorf("expected nil test_cases, got %q", string(data.TestCases))
	}
}

func TestProblemUpdated(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.ProblemUpdated(context.Background(), "sess-5", "prob-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "session:sess-5" {
		t.Errorf("channel = %q, want %q", mock.channel, "session:sess-5")
	}
	event := mock.data.(Event)
	if event.Type != EventProblemUpdated {
		t.Errorf("type = %q, want %q", event.Type, EventProblemUpdated)
	}
	data := event.Data.(ProblemUpdatedData)
	if data.ProblemID != "prob-1" {
		t.Errorf("payload = %+v", data)
	}
}

func TestPublisherError(t *testing.T) {
	mock, sp := newTestPublisher()
	mock.err = &APIError{StatusCode: 500, Body: "fail"}
	err := sp.StudentJoined(context.Background(), "sess-1", "user-1", "Alice")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestSessionStartedInSection(t *testing.T) {
	mock, sp := newTestPublisher()
	problemJSON := json.RawMessage(`{"id":"prob-1","title":"Two Sum"}`)
	err := sp.SessionStartedInSection(context.Background(), "sect-1", "sess-10", problemJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "section:sect-1" {
		t.Errorf("channel = %q, want %q", mock.channel, "section:sect-1")
	}
	event, ok := mock.data.(Event)
	if !ok {
		t.Fatalf("data is not Event")
	}
	if event.Type != EventSessionStartedInSection {
		t.Errorf("type = %q, want %q", event.Type, EventSessionStartedInSection)
	}
	if event.Timestamp != fixedTime() {
		t.Errorf("timestamp = %v, want %v", event.Timestamp, fixedTime())
	}
	data, ok := event.Data.(SessionStartedInSectionData)
	if !ok {
		t.Fatalf("payload is not SessionStartedInSectionData")
	}
	if data.SessionID != "sess-10" {
		t.Errorf("session_id = %q, want %q", data.SessionID, "sess-10")
	}
	if string(data.Problem) != `{"id":"prob-1","title":"Two Sum"}` {
		t.Errorf("problem = %q, want %q", string(data.Problem), `{"id":"prob-1","title":"Two Sum"}`)
	}
}

func TestSessionEndedInSection(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.SessionEndedInSection(context.Background(), "sect-2", "sess-11")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "section:sect-2" {
		t.Errorf("channel = %q, want %q", mock.channel, "section:sect-2")
	}
	event, ok := mock.data.(Event)
	if !ok {
		t.Fatalf("data is not Event")
	}
	if event.Type != EventSessionEndedInSection {
		t.Errorf("type = %q, want %q", event.Type, EventSessionEndedInSection)
	}
	if event.Timestamp != fixedTime() {
		t.Errorf("timestamp = %v, want %v", event.Timestamp, fixedTime())
	}
	data, ok := event.Data.(SessionEndedInSectionData)
	if !ok {
		t.Fatalf("payload is not SessionEndedInSectionData")
	}
	if data.SessionID != "sess-11" {
		t.Errorf("session_id = %q, want %q", data.SessionID, "sess-11")
	}
}

func TestEventJSONMarshaling(t *testing.T) {
	event := Event{
		Type:      EventStudentJoined,
		Data:      StudentJoinedData{UserID: "u1", DisplayName: "Bob"},
		Timestamp: fixedTime(),
	}
	b, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if m["type"] != "student_joined" {
		t.Errorf("type = %v", m["type"])
	}
	if _, ok := m["timestamp"]; !ok {
		t.Error("missing timestamp")
	}
	data, ok := m["data"].(map[string]any)
	if !ok {
		t.Fatal("data is not object")
	}
	if data["user_id"] != "u1" || data["display_name"] != "Bob" {
		t.Errorf("data = %v", data)
	}
}
