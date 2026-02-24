package store

import (
	"testing"
	"time"
)

func TestArgCounter_Next(t *testing.T) {
	ac := newArgCounter(1)

	got := ac.Next("value1")
	if got != "$1" {
		t.Errorf("first Next() = %q, want $1", got)
	}

	got = ac.Next("value2")
	if got != "$2" {
		t.Errorf("second Next() = %q, want $2", got)
	}

	got = ac.Next("value3")
	if got != "$3" {
		t.Errorf("third Next() = %q, want $3", got)
	}

	if len(ac.args) != 3 {
		t.Errorf("args length = %d, want 3", len(ac.args))
	}
	if ac.args[0] != "value1" {
		t.Errorf("args[0] = %v, want value1", ac.args[0])
	}
	if ac.args[1] != "value2" {
		t.Errorf("args[1] = %v, want value2", ac.args[1])
	}
	if ac.args[2] != "value3" {
		t.Errorf("args[2] = %v, want value3", ac.args[2])
	}
}

func TestArgCounter_StartIdx(t *testing.T) {
	// Simulate UPDATE pattern: $1 is already used for id
	ac := newArgCounter(2, "existing-id")

	got := ac.Next("email@test.com")
	if got != "$2" {
		t.Errorf("first Next() with startIdx=2 = %q, want $2", got)
	}

	got = ac.Next("display-name")
	if got != "$3" {
		t.Errorf("second Next() with startIdx=2 = %q, want $3", got)
	}

	if len(ac.args) != 3 {
		t.Errorf("args length = %d, want 3", len(ac.args))
	}
	if ac.args[0] != "existing-id" {
		t.Errorf("args[0] = %v, want existing-id", ac.args[0])
	}
	if ac.args[1] != "email@test.com" {
		t.Errorf("args[1] = %v, want email@test.com", ac.args[1])
	}
	if ac.args[2] != "display-name" {
		t.Errorf("args[2] = %v, want display-name", ac.args[2])
	}
}

func TestArgCounter_NoArgs(t *testing.T) {
	ac := newArgCounter(1)

	if len(ac.args) != 0 {
		t.Errorf("initial args length = %d, want 0", len(ac.args))
	}
}

func TestArgCounter_InitialArgs(t *testing.T) {
	ac := newArgCounter(3, "arg1", "arg2")

	if len(ac.args) != 2 {
		t.Errorf("initial args length = %d, want 2", len(ac.args))
	}

	got := ac.Next("arg3")
	if got != "$3" {
		t.Errorf("Next() = %q, want $3", got)
	}
	if len(ac.args) != 3 {
		t.Errorf("args length after Next = %d, want 3", len(ac.args))
	}
}

// TestParseTime_RFC3339 verifies parseTime handles RFC3339 format correctly.
func TestParseTime_RFC3339(t *testing.T) {
	ts := "2024-01-15T10:30:00Z"
	got, err := parseTime(ts)
	if err != nil {
		t.Fatalf("parseTime(%q): unexpected error: %v", ts, err)
	}
	want := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("parseTime(%q) = %v, want %v", ts, got, want)
	}
}

// TestParseTime_RFC3339WithOffset verifies parseTime handles RFC3339 with timezone offset.
func TestParseTime_RFC3339WithOffset(t *testing.T) {
	ts := "2024-01-15T10:30:00+00:00"
	got, err := parseTime(ts)
	if err != nil {
		t.Fatalf("parseTime(%q): unexpected error: %v", ts, err)
	}
	want := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("parseTime(%q) = %v, want %v", ts, got, want)
	}
}
