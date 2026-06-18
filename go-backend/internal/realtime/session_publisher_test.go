package realtime

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
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
	testCases := json.RawMessage(`[{"name":"t1","input":"world","match_type":"exact"}]`)
	err := sp.CodeUpdated(context.Background(), "sess-2", "user-2", "fmt.Println()", testCases, nil)
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
	if string(data.TestCases) != string(testCases) {
		t.Errorf("test_cases = %q, want %q", string(data.TestCases), string(testCases))
	}
}

func TestCodeUpdated_NilTestCases(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.CodeUpdated(context.Background(), "sess-2", "user-2", "fmt.Println()", nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(StudentCodeUpdatedData)
	if data.TestCases != nil {
		t.Errorf("expected nil test_cases, got %q", string(data.TestCases))
	}
}

// TestCodeUpdated_RunSummary verifies the G4 F8 run_summary is forwarded into
// the StudentCodeUpdatedData payload and serializes under the "run_summary" key.
// What contract: a run-all summary supplied by the student must reach dashboard
// subscribers verbatim. Why it matters: roster glyphs/minimap/signals depend on
// it. What breaks if violated: instructors see no pass/fail state for students.
func TestCodeUpdated_RunSummary(t *testing.T) {
	mock, sp := newTestPublisher()
	summary := json.RawMessage(`{"passed":2,"failed":1,"errors":0,"total":3,"at":"2026-06-18T00:00:00Z"}`)
	if err := sp.CodeUpdated(context.Background(), "sess-9", "user-9", "code", nil, summary); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(StudentCodeUpdatedData)
	if string(data.RunSummary) != string(summary) {
		t.Errorf("run_summary = %q, want %q", string(data.RunSummary), string(summary))
	}
	// run_summary must be present in the wire JSON.
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !bytes.Contains(raw, []byte(`"run_summary"`)) {
		t.Errorf("expected run_summary key in wire JSON, got %s", raw)
	}
}

// TestCodeUpdated_RunSummary_OmittedWhenNil verifies run_summary is omitted from
// the wire JSON when no summary is supplied (plain autosaves), so dashboards do
// not misread a missing summary as an empty one.
func TestCodeUpdated_RunSummary_OmittedWhenNil(t *testing.T) {
	mock, sp := newTestPublisher()
	if err := sp.CodeUpdated(context.Background(), "sess-9", "user-9", "code", nil, nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(StudentCodeUpdatedData)
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if bytes.Contains(raw, []byte(`"run_summary"`)) {
		t.Errorf("expected run_summary omitted when nil, got %s", raw)
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

func TestFeaturedStudentChanged(t *testing.T) {
	mock, sp := newTestPublisher()
	testCases := json.RawMessage(`[{"name":"t1","input":"hello","match_type":"exact"}]`)
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
	if string(data.TestCases) != string(testCases) {
		t.Errorf("test_cases = %q, want %q", string(data.TestCases), string(testCases))
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

// TestSectionCurrentChanged_Set verifies the section-pointer event is published
// to the section channel with session_id as a string when the pointer is set,
// carrying the problem snapshot for late join (G4 section-pointer contract).
func TestSectionCurrentChanged_Set(t *testing.T) {
	mock, sp := newTestPublisher()
	sessID := uuid.MustParse("11111111-2222-3333-4444-555555555555")
	problemJSON := json.RawMessage(`{"id":"prob-1","title":"Two Sum"}`)
	err := sp.SectionCurrentChanged(context.Background(), "sect-1", &sessID, problemJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mock.channel != "section:sect-1" {
		t.Errorf("channel = %q, want %q", mock.channel, "section:sect-1")
	}
	event := mock.data.(Event)
	if event.Type != EventSectionCurrentChanged {
		t.Errorf("type = %q, want %q", event.Type, EventSectionCurrentChanged)
	}
	data := event.Data.(SectionCurrentChangedData)
	if data.SessionID == nil || *data.SessionID != sessID.String() {
		t.Errorf("session_id = %v, want %q", data.SessionID, sessID.String())
	}
	if string(data.Problem) != string(problemJSON) {
		t.Errorf("problem = %q, want %q", string(data.Problem), string(problemJSON))
	}

	// Verify JSON shape: session_id present as string, problem present.
	b, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m struct {
		Data struct {
			SessionID *string         `json:"session_id"`
			Problem   json.RawMessage `json:"problem"`
		} `json:"data"`
	}
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if m.Data.SessionID == nil || *m.Data.SessionID != sessID.String() {
		t.Errorf("marshaled session_id = %v, want %q", m.Data.SessionID, sessID.String())
	}
	if len(m.Data.Problem) == 0 {
		t.Error("expected problem present in marshaled payload")
	}
}

// TestSectionCurrentChanged_Cleared verifies that clearing the pointer publishes
// session_id: null and omits the problem field (omitempty), so late joiners
// know the section has no current session.
func TestSectionCurrentChanged_Cleared(t *testing.T) {
	mock, sp := newTestPublisher()
	err := sp.SectionCurrentChanged(context.Background(), "sect-2", nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	event := mock.data.(Event)
	data := event.Data.(SectionCurrentChangedData)
	if data.SessionID != nil {
		t.Errorf("expected nil session_id, got %v", *data.SessionID)
	}

	b, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	dataMap := m["data"].(map[string]any)
	if v, ok := dataMap["session_id"]; !ok || v != nil {
		t.Errorf("expected session_id present and null, got ok=%v v=%v", ok, v)
	}
	if _, ok := dataMap["problem"]; ok {
		t.Error("expected problem field omitted when empty")
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
