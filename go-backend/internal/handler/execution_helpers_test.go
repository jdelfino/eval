package handler

import (
	"testing"

	"github.com/jdelfino/eval/pkg/executorapi"
)

// Tests for the shared buildExecutorRequest helper.
// These exercise the logic that was previously duplicated in execute.go (inline)
// and student_work.go (buildStudentWorkExecutorRequest).

func TestBuildExecutorRequest_CodeOnly(t *testing.T) {
	settings := executionSettingsJSON{}
	req := buildExecutorRequest("print('hi')", settings)

	if req.Code != "print('hi')" {
		t.Errorf("expected code 'print(hi)', got %q", req.Code)
	}
	if req.Stdin != "" {
		t.Errorf("expected empty stdin, got %q", req.Stdin)
	}
	if req.RandomSeed != nil {
		t.Errorf("expected nil RandomSeed, got %v", req.RandomSeed)
	}
	if len(req.Files) != 0 {
		t.Errorf("expected no files, got %v", req.Files)
	}
}

func TestBuildExecutorRequest_WithStdin(t *testing.T) {
	stdin := "hello stdin"
	settings := executionSettingsJSON{Stdin: &stdin}
	req := buildExecutorRequest("code", settings)

	if req.Stdin != "hello stdin" {
		t.Errorf("expected stdin 'hello stdin', got %q", req.Stdin)
	}
}

func TestBuildExecutorRequest_WithRandomSeed(t *testing.T) {
	seed := 42
	settings := executionSettingsJSON{RandomSeed: &seed}
	req := buildExecutorRequest("code", settings)

	if req.RandomSeed == nil || *req.RandomSeed != 42 {
		t.Errorf("expected random_seed 42, got %v", req.RandomSeed)
	}
}

func TestBuildExecutorRequest_WithFiles(t *testing.T) {
	settings := executionSettingsJSON{
		Files: []executorapi.File{
			{Name: "data.csv", Content: "a,b,c"},
		},
	}
	req := buildExecutorRequest("code", settings)

	if len(req.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(req.Files))
	}
	if req.Files[0].Name != "data.csv" {
		t.Errorf("expected file 'data.csv', got %q", req.Files[0].Name)
	}
	if req.Files[0].Content != "a,b,c" {
		t.Errorf("expected content 'a,b,c', got %q", req.Files[0].Content)
	}
}

func TestBuildExecutorRequest_AllSettings(t *testing.T) {
	stdin := "input"
	seed := 7
	settings := executionSettingsJSON{
		Stdin:      &stdin,
		RandomSeed: &seed,
		Files:      []executorapi.File{{Name: "f.txt", Content: "data"}},
	}
	req := buildExecutorRequest("mycode", settings)

	if req.Code != "mycode" {
		t.Errorf("code: got %q", req.Code)
	}
	if req.Stdin != "input" {
		t.Errorf("stdin: got %q", req.Stdin)
	}
	if req.RandomSeed == nil || *req.RandomSeed != 7 {
		t.Errorf("random_seed: got %v", req.RandomSeed)
	}
	if len(req.Files) != 1 || req.Files[0].Name != "f.txt" {
		t.Errorf("files: got %v", req.Files)
	}
}

func TestBuildExecutorRequest_NilStdinNotForwarded(t *testing.T) {
	// Nil Stdin should not be dereferenced — executor.ExecuteRequest.Stdin should be empty string.
	settings := executionSettingsJSON{Stdin: nil}
	req := buildExecutorRequest("code", settings)

	if req.Stdin != "" {
		t.Errorf("expected empty stdin when Stdin is nil, got %q", req.Stdin)
	}
}
