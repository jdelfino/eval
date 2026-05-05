// Package executorapi defines the shared request/response types for the executor service API.
package executorapi

// CaseDef defines a single test case sent to the executor.
// Kind discriminates between case types: "io" (default) or "pytest".
// For io cases: Input, ExpectedOutput, MatchType, RandomSeed, and Files are used.
// For pytest cases: TestCode and TargetPath are used.
// ExpectedOutput is optional for io cases — when absent the case is "run-only" (no assertion).
type CaseDef struct {
	Name           string `json:"name"`
	Kind           string `json:"kind,omitempty"`          // "io" | "pytest"; defaults to "io"
	Type           string `json:"type,omitempty"`          // legacy alias for Kind; "io" only
	Input          string `json:"input,omitempty"`
	ExpectedOutput string `json:"expected_output,omitempty"`
	MatchType      string `json:"match_type,omitempty"`
	RandomSeed     *int   `json:"random_seed,omitempty"`
	Files          []File `json:"files,omitempty"`
	// Pytest-specific fields.
	TestCode   string `json:"test_code,omitempty"`   // Content of the pytest test file.
	TargetPath string `json:"target_path,omitempty"` // Relative path for the test file (e.g. "tests/test_foo.py").
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

// PytestAssertion represents the outcome of a single pytest test function (or
// a single parametrize combination) within a pytest case.
type PytestAssertion struct {
	Name           string `json:"name"`
	Passed         bool   `json:"passed"`
	FailureMessage string `json:"failure_message,omitempty"`
	Traceback      string `json:"traceback,omitempty"`
}

// PytestCaseResult holds the outcome of a single pytest case execution.
// Assertions contains one entry per test function (or parametrize combination).
// Stderr is populated when pytest itself errors (collection error, import error).
type PytestCaseResult struct {
	Kind       string            `json:"kind"`       // always "pytest"
	Name       string            `json:"name"`
	Passed     bool              `json:"passed"`     // true iff all assertions passed
	DurationMs int               `json:"duration_ms"`
	Assertions []PytestAssertion `json:"assertions"`
	Stderr     string            `json:"stderr,omitempty"`
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
// Results contains io (kind="io") case results.
// PytestResults contains pytest (kind="pytest") case results.
// F2.3 will unify these into a single discriminated union slice.
// Always returns Results and Summary regardless of whether cases have expected output.
type ExecuteResponse struct {
	Results       []CaseResult       `json:"results"`
	PytestResults []PytestCaseResult `json:"pytest_results,omitempty"`
	Summary       CaseSummary        `json:"summary"`
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
