// Package executorapi defines the shared request/response types for the executor service API.
package executorapi

// ExecuteRequest is the JSON request body for code execution.
type ExecuteRequest struct {
	Code       string `json:"code"`
	Stdin      string `json:"stdin,omitempty"`
	Files      []File `json:"files,omitempty"`
	RandomSeed *int   `json:"random_seed,omitempty"`
	TimeoutMs  *int   `json:"timeout_ms,omitempty"`
	Language   string `json:"language,omitempty"`
}

// TestRequest is the JSON request body for running I/O test cases.
type TestRequest struct {
	Code      string      `json:"code"`
	Language  string      `json:"language"`
	IOTests   []IOTestDef `json:"io_tests,omitempty"`
	TimeoutMs *int        `json:"timeout_ms,omitempty"`
}

// IOTestDef defines a single I/O test case sent to the executor.
// ExpectedOutput is optional — when absent the test is "run-only" (no assertion on output).
type IOTestDef struct {
	Name           string `json:"name"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output,omitempty"`
	MatchType      string `json:"match_type"`
}

// TestResponse is the JSON response for running I/O test cases.
type TestResponse struct {
	Results []TestResult `json:"results"`
	Summary TestSummary  `json:"summary"`
}

// TestResult holds the outcome of a single test case execution.
// Status is one of "passed", "failed", or "error".
// Input, Expected, Actual, and Stderr are omitted when empty (e.g. for error-status tests
// where no output was produced).
type TestResult struct {
	Name     string `json:"name"`
	Type     string `json:"type"`    // always "io" for I/O tests
	Status   string `json:"status"`  // "passed" | "failed" | "error"
	Input    string `json:"input,omitempty"`
	Expected string `json:"expected,omitempty"`
	Actual   string `json:"actual,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	TimeMs   int64  `json:"time_ms"`
}

// TestSummary aggregates counts and total elapsed time across all test results.
type TestSummary struct {
	Total  int   `json:"total"`
	Passed int   `json:"passed"`
	Failed int   `json:"failed"`
	Errors int   `json:"errors"`
	TimeMs int64 `json:"time_ms"`
}

// File represents an auxiliary file provided to the execution environment.
type File struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ExecuteResponse is the JSON response for code execution.
type ExecuteResponse struct {
	Success         bool   `json:"success"`
	Output          string `json:"output,omitempty"`
	Error           string `json:"error,omitempty"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
	Stdin           string `json:"stdin,omitempty"`
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
