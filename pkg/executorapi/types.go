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
	Output          string `json:"output,omitempty"`
	Error           string `json:"error,omitempty"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
	Stdin           string `json:"stdin,omitempty"`
}

// TraceRequest is the JSON request body for step-through debugger tracing.
type TraceRequest struct {
	Code     string `json:"code"`
	Stdin    string `json:"stdin,omitempty"`
	MaxSteps *int   `json:"max_steps,omitempty"`
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
