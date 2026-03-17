// Package executorapi defines the shared request/response types for the executor service API.
package executorapi

// CaseDef defines a single test case sent to the executor.
// Type is "io" for I/O test cases (the only supported type currently).
// ExpectedOutput is optional — when absent the case is "run-only" (no assertion).
type CaseDef struct {
	Name           string `json:"name"`
	Type           string `json:"type"`                    // "io"
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output,omitempty"`
	MatchType      string `json:"match_type,omitempty"`
	RandomSeed     *int   `json:"random_seed,omitempty"`
	Files          []File `json:"files,omitempty"`
}

// CaseResult holds the outcome of a single case execution.
// Status is one of "passed", "failed", "error", or "run" (run-only, no assertion).
type CaseResult struct {
	Name     string `json:"name"`
	Type     string `json:"type"`              // "io"
	Status   string `json:"status"`            // "passed" | "failed" | "error" | "run"
	Input    string `json:"input,omitempty"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	TimeMs   int64  `json:"time_ms"`
}

// CaseSummary aggregates counts and total elapsed time across all case results.
type CaseSummary struct {
	Total  int   `json:"total"`
	Passed int   `json:"passed"`
	Failed int   `json:"failed"`
	Errors int   `json:"errors"`
	Run    int   `json:"run"`
	TimeMs int64 `json:"time_ms"`
}

// ExecuteRequest is the JSON request body for code execution.
// Cases is a required list of test cases to run against the code.
type ExecuteRequest struct {
	Code      string    `json:"code"`
	Language  string    `json:"language,omitempty"`
	TimeoutMs *int      `json:"timeout_ms,omitempty"`
	Cases     []CaseDef `json:"cases,omitempty"`
}

// ExecuteResponse is the JSON response for code execution.
// Always returns Results and Summary regardless of whether cases have expected output.
type ExecuteResponse struct {
	Results []CaseResult `json:"results"`
	Summary CaseSummary  `json:"summary"`
}

// File represents an auxiliary file provided to the execution environment.
type File struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// TraceRequest is the JSON request body for step-through debugger tracing.
type TraceRequest struct {
	Code       string `json:"code"`
	Stdin      string `json:"stdin,omitempty"`
	Files      []File `json:"files,omitempty"`
	RandomSeed *int   `json:"random_seed,omitempty"`
	MaxSteps   *int   `json:"max_steps,omitempty"`
	Language   string `json:"language,omitempty"`
}

// TraceResponse is the JSON response for debugger tracing.
type TraceResponse struct {
	Steps      []TraceStep `json:"steps"`
	TotalSteps int         `json:"total_steps"`
	ExitCode   int         `json:"exit_code"`
	Error      string      `json:"error,omitempty"`
	Truncated  bool        `json:"truncated,omitempty"`
}

// TraceStep represents a single step in a debugger trace.
type TraceStep struct {
	Line      int                    `json:"line"`
	Event     string                 `json:"event"`
	Locals    map[string]interface{} `json:"locals"`
	Globals   map[string]interface{} `json:"globals"`
	CallStack []CallFrame            `json:"call_stack"`
	Stdout    string                 `json:"stdout"`
}

// CallFrame represents a single frame in the call stack.
type CallFrame struct {
	FunctionName string `json:"function_name"`
	Filename     string `json:"filename"`
	Line         int    `json:"line"`
}
