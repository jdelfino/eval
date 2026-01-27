package executorapi

import (
	"encoding/json"
	"testing"
)

func TestExecuteRequest_JSON(t *testing.T) {
	seed := 42
	timeout := 5000
	req := ExecuteRequest{
		Code:       "print('hello')",
		Stdin:      "input",
		Files:      []File{{Name: "data.txt", Content: "hello"}},
		RandomSeed: &seed,
		TimeoutMs:  &timeout,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Code != req.Code {
		t.Errorf("code: got %q, want %q", decoded.Code, req.Code)
	}
	if decoded.Stdin != req.Stdin {
		t.Errorf("stdin: got %q, want %q", decoded.Stdin, req.Stdin)
	}
	if len(decoded.Files) != 1 || decoded.Files[0].Name != "data.txt" {
		t.Errorf("files: got %+v", decoded.Files)
	}
	if decoded.RandomSeed == nil || *decoded.RandomSeed != 42 {
		t.Errorf("random_seed: got %v", decoded.RandomSeed)
	}
	if decoded.TimeoutMs == nil || *decoded.TimeoutMs != 5000 {
		t.Errorf("timeout_ms: got %v", decoded.TimeoutMs)
	}
}

func TestExecuteRequest_OmitsEmptyFields(t *testing.T) {
	req := ExecuteRequest{Code: "x=1"}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"stdin", "files", "random_seed", "timeout_ms"} {
		if _, ok := raw[field]; ok {
			t.Errorf("expected field %q to be omitted, but it was present", field)
		}
	}
}

func TestExecuteResponse_JSON(t *testing.T) {
	resp := ExecuteResponse{
		Success:         true,
		Output:          "hello\n",
		Error:           "",
		ExecutionTimeMs: 42,
		Stdin:           "input",
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded ExecuteResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if decoded.Success != resp.Success {
		t.Errorf("success: got %v, want %v", decoded.Success, resp.Success)
	}
	if decoded.Output != resp.Output {
		t.Errorf("output: got %q, want %q", decoded.Output, resp.Output)
	}
	if decoded.ExecutionTimeMs != resp.ExecutionTimeMs {
		t.Errorf("execution_time_ms: got %d, want %d", decoded.ExecutionTimeMs, resp.ExecutionTimeMs)
	}
}
