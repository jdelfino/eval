# Epic: AI-Assisted Problem Creation Engine

## Overview

A Go library that powers AI-assisted creation of programming assignments. An instructor provides course context (PDF slides, textbook chapters) and iterates with an AI conversation engine to produce complete, validated assignments with comprehensive test suites.

**Key principle:** Conversation engine, not tool provider. The library manages the full LLM interaction internally. Hosts (CLI first, web later) just pipe user messages in and display responses + artifacts out. Low friction, high success rate.

## Architecture

### Engine API (what hosts see)

```go
package problemgen

// Engine manages an AI conversation for problem creation.
type Engine struct {
    client    LLMClient             // provider-agnostic interface
    messages  []Message             // conversation history
    artifacts *ProblemArtifacts     // current generated state
    config    EngineConfig
}

type EngineConfig struct {
    OutputDir       string            // where to write files (default: tempdir)
    TargetLanguage  string            // "python" initially
    ValidateOnGen   bool              // auto-run tests after generation
}

// LLMClient abstracts the LLM provider. Implementations for Anthropic,
// OpenAI, etc. handle serialization differences (tool_use vs function
// calling, message formats, etc.).
type LLMClient interface {
    Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
}

type ChatRequest struct {
    System   string
    Messages []Message
    Tools    []ToolDef
}

type ChatResponse struct {
    Text      string
    ToolCalls []ToolCall
    Usage     TokenUsage   // for cost tracking/logging
}

// Start begins a new problem creation session with structured intake.
// The intake questionnaire is plumbed directly to the LLM as context.
func (e *Engine) Start(ctx context.Context, intake ProblemIntake) (*Response, error)

// AddContext ingests course material (PDF bytes, text, etc.).
// Returns confirmation of what was understood.
func (e *Engine) AddContext(ctx context.Context, material CourseMaterial) (*Response, error)

// Chat sends an instructor message and returns the engine's response.
// The engine may generate/update artifacts as side effects.
func (e *Engine) Chat(ctx context.Context, message string) (*Response, error)

// Artifacts returns the current state of generated problem files.
func (e *Engine) Artifacts() *ProblemArtifacts

// Validate runs the solution against all tests, returns results.
func (e *Engine) Validate(ctx context.Context) (*ValidationResult, error)

// Write writes current artifacts to OutputDir.
func (e *Engine) Write() (string, error)
```

### Response (what the host displays)

```go
type Response struct {
    Text      string              // conversational text to show instructor
    Artifacts *ProblemArtifacts   // updated artifacts (nil if unchanged)
    Status    EngineStatus        // what phase we're in
}

type EngineStatus string
const (
    StatusGathering   EngineStatus = "gathering"    // collecting requirements
    StatusGenerating  EngineStatus = "generating"   // producing artifacts
    StatusRefining    EngineStatus = "refining"      // iterating on feedback
    StatusValidating  EngineStatus = "validating"    // running tests
    StatusComplete    EngineStatus = "complete"      // ready to export
)
```

### Problem Artifacts (what gets generated)

```go
type ProblemArtifacts struct {
    Spec         ProblemSpec       // metadata + description
    StarterCode  map[string]string // filename -> content (multi-file)
    Solution     map[string]string // filename -> content
    PublicTests  map[string]string // tests students can see
    HiddenTests  map[string]string // tests for grading/bug-hunting
    Config       ProblemConfig     // execution settings
}

type ProblemSpec struct {
    Title       string
    Description string   // markdown, becomes README.md
    Difficulty  string   // e.g. "beginner", "intermediate", "advanced"
    Topics      []string // e.g. ["recursion", "dynamic-programming"]
    Language    string   // e.g. "python"
}

type ProblemConfig struct {
    TestCommand    string // e.g. "pytest tests/ -v"
    TimeoutSeconds int
}
```

### Internal Tool Use (how the engine structures generation)

The engine defines Claude tools internally for structured output:

| Tool | Purpose |
|------|---------|
| `update_spec` | Set/update problem title, description, difficulty, topics |
| `write_starter_code` | Generate/update starter code file(s) |
| `write_solution` | Generate/update solution file(s) |
| `write_public_tests` | Generate/update student-visible tests |
| `write_hidden_tests` | Generate/update grading-only tests |
| `update_config` | Set test command, timeout, etc. |
| `run_validation` | Trigger solution-against-tests validation |

These tools give the LLM structured ways to produce artifacts during conversation. The engine intercepts tool calls, updates `ProblemArtifacts`, and continues the conversation.

### Intake Questionnaire

Before the conversation begins, the host collects structured intake via a short questionnaire. All fields are free-form text, plumbed directly to the LLM as the initial context. This avoids the blank-page problem and gets to a strong first proposal faster.

```go
type ProblemIntake struct {
    Topic    string // e.g. "recursive tree traversal with DFS"
    Size     string // e.g. "3 hours", "1 week", "short in-class exercise"
    Theme    string // optional, e.g. "zombie apocalypse survival game"
    Notes    string // optional, e.g. "students have seen linked lists but not trees yet"
}
```

The CLI collects these before entering the conversation loop:

```
$ problemgen new --language python

Topic: recursive tree traversal with DFS
Expected completion time: 3-4 hours
Theme (optional):
Other notes (optional): students have covered binary trees in lecture
  but have not implemented traversal yet. They know recursion basics.

Great — I'll design a 3-4 hour assignment on recursive DFS tree traversal.
Before I start generating, let me share course materials if you have any,
or I can propose a spec based on what you've described.

> /pdf ~/cs101/slides/week5-recursion.pdf
...
```

### PDF Ingestion

Simple approach: extract text from PDFs, include as context in the conversation.

Go PDF libraries (e.g., `pdfcpu`, `unipdf`, or `go-fitz`) for text extraction. No layout analysis needed — slides and textbook text is sufficient context for the LLM.

Extracted text is added to the conversation as a user message with clear framing: "Here are the course slides for [topic]. Use this as context for the assignment."

### Validation

Shell out to run tests locally:

```go
type Validator struct {
    language string
}

func (v *Validator) Run(ctx context.Context, artifacts *ProblemArtifacts) (*ValidationResult, error) {
    // 1. Write solution + all tests to temp dir
    // 2. exec.CommandContext("pytest", "tests/", "-v", "--tb=short")
    // 3. Parse output (pass/fail per test, stderr)
    // 4. Return structured results
}

type ValidationResult struct {
    Passed     bool
    TestResults []TestResult  // per-test pass/fail + output
    Stderr     string
    Duration   time.Duration
}
```

Requirements: Python + pytest installed locally. Fine for dev containers and instructor machines. Containerized validation is a future concern (Coder integration).

### System Prompt Design

The system prompt encodes expertise about:

1. **Assignment design** — clear problem statements, appropriate difficulty, good starter code that guides without giving away the solution
2. **Test philosophy** — tests as bug-hunting tools, not point-assignment machines:
   - **Structural tests**: code compiles, correct class/function names, expected signatures, proper imports — catch the "silly" mistakes students always make
   - **Public tests**: basic correctness, help students validate during development
   - **Hidden tests**: edge cases, boundary conditions, performance, style deviations
   - Tests should be *focused* (one concept per test), *named descriptively* (test name explains the bug it catches), *robust* (not brittle to valid alternative implementations)
3. **Workflow** — gather context first, propose spec, get approval, then generate code. Don't dump everything at once.
4. **Multi-file support** — for Java: package structure, class-per-file conventions, build commands

### CLI Host

Minimal REPL wrapping the engine:

```
$ problemgen new --language python

Topic: recursive tree traversal — pre-order, in-order, post-order
Expected completion time: 3-4 hours
Theme (optional):
Other notes (optional): students know recursion basics and have seen
  binary tree diagrams in lecture, but haven't implemented traversal

> /pdf ~/cs101/slides/week5-recursion.pdf
Ingested 24 slides on recursion (fibonacci, tree traversal, memoization).

Based on the slides and your description, here's what I'm thinking:

**Assignment: Binary Tree Traversal**
Students implement three recursive DFS traversals (pre-order, in-order,
post-order) on a binary tree. Starter code provides the TreeNode class
and function signatures...

[spec details]

Does this look right? Should I adjust the scope or difficulty?

> looks good, generate it

Generating starter code, solution, and tests...

[shows generated artifacts]

> the hidden tests should also check that the solution handles None nodes

Added 3 hidden tests for None/empty node handling. Running validation...

  12/12 public tests pass
  18/18 hidden tests pass
Solution validated in 0.3s.

> /write
Wrote problem to /tmp/problemgen-tree-traversal/
  problem.yaml
  README.md
  starter/tree_traversal.py
  solutions/tree_traversal.py
  tests/public/test_traversal.py
  tests/hidden/test_edge_cases.py
```

## Subtask Breakdown

### 1. Module scaffolding + LLM client interface + Anthropic implementation
Set up the Go module, package structure, LLMClient interface, and Anthropic implementation. Interface abstracts provider so we can swap in OpenAI/Gemini/cheaper models later.

### 2. Engine core — conversation loop with tool use
The heart: Engine struct, conversation history management, system prompt, internal tool definitions, tool call handling. Instructor messages go in, structured responses come out.

### 3. Problem artifacts model + file writer
Define the ProblemArtifacts structs and Write() to produce the directory structure on disk.

### 4. PDF text extraction
Ingest PDFs, extract text, add to conversation context.

### 5. Test generation system prompt + hidden/public test tools
The crown jewel. System prompt engineering for comprehensive, robust, focused test generation. Both public (student-visible) and hidden (grading) test suites.

### 6. Validation — run solution against tests
Shell out to pytest, parse results, feed back into conversation for iteration.

### 7. CLI host (REPL)
Minimal CLI wrapping the engine. /pdf, /write commands, chat loop.

### 8. Makefile + CI integration
Build, test, lint targets. Integration with existing Makefile.

## Scope Boundaries

**In scope:**
- Go library with conversation engine API
- PDF ingestion (text extraction)
- Python test generation (pytest)
- Local validation (shell out to pytest)
- CLI host
- Multi-file problem support
- Public + hidden test split

**Out of scope (future work):**
- Java support (second language)
- Web UI integration
- Platform DB integration
- Git/Gitea integration
- Containerized validation
- Property-based test generation (consider for v2)
- Mutation testing for test quality verification

## Cost Estimates

Per-assignment costs depend heavily on conversation length. With ~25 turns:

| Model | Per assignment | 10 assignments/semester |
|-------|---------------|------------------------|
| Haiku | ~$0.50 | ~$5 |
| Sonnet (default) | ~$2-3 | ~$20-30 |
| Opus | ~$10-15 | ~$100-150 |

Default to Sonnet for balance of quality and cost. Configurable per-session.
History summarization (trimming old turns) is a future optimization to control cost on long sessions.

## Open Questions

1. **Anthropic Go SDK** — is there an official one, or do we use the REST API directly? (Need to check current state — task 1 will resolve this)
2. **PDF library choice** — several Go options with different tradeoffs (pdfcpu, unipdf, go-fitz). Need to evaluate during task 4.
3. **Model experimentation** — LLMClient interface enables testing cheaper models (GPT-4o-mini, Gemini Flash, Haiku) for the conversational loop vs. using a stronger model only for final generation. System prompt may need per-provider tuning.
