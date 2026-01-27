// Package executorapi defines the shared request/response types for the executor service API.
package executorapi

// ExecuteRequest is the JSON request body for code execution.
type ExecuteRequest struct {
	Code       string `json:"code"`
	Stdin      string `json:"stdin,omitempty"`
	Files      []File `json:"files,omitempty"`
	RandomSeed *int   `json:"random_seed,omitempty"`
	TimeoutMs  *int   `json:"timeout_ms,omitempty"`
}

// File represents an auxiliary file provided to the execution environment.
type File struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ExecuteResponse is the JSON response for code execution.
type ExecuteResponse struct {
	Success         bool   `json:"success"`
	Output          string `json:"output"`
	Error           string `json:"error"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
	Stdin           string `json:"stdin,omitempty"`
}
