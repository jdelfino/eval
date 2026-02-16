package ratelimit

import (
	"testing"
	"time"
)

func TestCategories_AllPresent(t *testing.T) {
	cats := Categories()

	expected := []struct {
		name      string
		algorithm string
		limit     int
		window    time.Duration
	}{
		{"auth", "fixed", 20, time.Minute},
		{"join", "sliding", 10, time.Minute},
		{"execute", "sliding", 30, time.Minute},
		{"practice", "sliding", 15, time.Minute},
		{"trace", "sliding", 10, time.Minute},
		{"analyze", "sliding", 5, time.Minute},
		{"analyzeDaily", "fixed", 100, 24 * time.Hour},
		{"analyzeGlobal", "fixed", 750, 24 * time.Hour},
		{"sessionCreate", "sliding", 10, time.Hour},
		{"write", "sliding", 30, time.Minute},
		{"read", "sliding", 100, time.Minute},
		{"executorGlobal", "sliding", 1000, time.Minute},
	}

	if len(cats) != len(expected) {
		t.Fatalf("expected %d categories, got %d", len(expected), len(cats))
	}

	for _, e := range expected {
		cat, ok := cats[e.name]
		if !ok {
			t.Fatalf("missing category %q", e.name)
		}
		if cat.Algorithm != e.algorithm {
			t.Errorf("category %q: expected algorithm %q, got %q", e.name, e.algorithm, cat.Algorithm)
		}
		if cat.Limit != e.limit {
			t.Errorf("category %q: expected limit %d, got %d", e.name, e.limit, cat.Limit)
		}
		if cat.Window != e.window {
			t.Errorf("category %q: expected window %v, got %v", e.name, e.window, cat.Window)
		}
	}
}
