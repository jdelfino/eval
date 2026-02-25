# Problem Repository Specification

> Defines the structure, conventions, and tooling for assignment problem repositories.
> This is a Phase 2 design — Phase 1 in-class exercises use a separate JSONB-based model.

## Problem Repo Layout

A problem repo is a self-contained project. The repo root is the student view — what you see at the root is exactly what students get. The `.overlay/` directory contains everything students don't see: the reference solution, hidden tests, and grading configuration.

The filesystem encodes visibility. No manifest lists needed.

### Python Example

```
fibonacci/
├── problem.yaml
├── solution.py                 # STARTER code
├── tests/
│   └── test_basic.py           # visible test
├── conftest.py                 # shared fixtures
├── .overlay/
│   ├── solution.py             # reference solution (replaces starter)
│   └── tests/
│       └── test_edge.py        # hidden test (added)
└── .devcontainer/
    └── devcontainer.json
```

Student gets:
```
solution.py
tests/test_basic.py
conftest.py
.devcontainer/devcontainer.json
```

### Java Example (Maven)

```
recursion/
├── problem.yaml
├── pom.xml
├── src/
│   ├── main/java/edu/cs101/
│   │   └── Fibonacci.java          # starter code
│   └── test/java/edu/cs101/
│       └── FibonacciTest.java      # visible test
├── .overlay/
│   ├── src/
│   │   ├── main/java/edu/cs101/
│   │   │   └── Fibonacci.java      # solution
│   │   └── test/java/edu/cs101/
│   │       └── FibonacciEdgeTest.java  # hidden test
│   └── grading/
│       └── rubric.yaml
└── .devcontainer/
    └── devcontainer.json
```

Student gets:
```
pom.xml
src/main/java/edu/cs101/Fibonacci.java
src/test/java/edu/cs101/FibonacciTest.java
.devcontainer/devcontainer.json
```

Same overlay mechanism, just deeper nesting. The platform doesn't care about directory depth.

---

## Key Principles

- **Root = student view**: "What you see is what they get." The repo root is exactly the student's working directory.
- **`.overlay/` = additive only**: Adds files or replaces existing ones. Never removes. The student view (root) is the smaller set; the overlay adds the instructor's solution and hidden tests on top.
- **Filesystem IS the manifest**: A file in root = visible to students. A file in `.overlay/` = hidden from students. No visibility lists in problem.yaml.
- **Single branch**: Student view and instructor content coexist in every commit. No branch sync problems, no wrong-branch accidents.
- **Framework-agnostic**: The platform runs a configured command and reads JUnit XML. It never parses test code or knows about test frameworks.
- **Language-agnostic**: The platform manages files and runs commands. Language-specific concerns (build steps, package structure, dependency management) live in `test_command`, `.devcontainer/devcontainer.json`, and build files.

---

## problem.yaml Schema

Minimal — the filesystem encodes visibility, so no file lists needed.

```yaml
id: asgn3-recursion
title: "Assignment 3: Recursion Practice"
language: python                    # for templates/defaults, not platform logic

# Test execution
test_command: pytest tests/ -v --tb=short --junitxml=results.xml
result_file: results.xml
result_format: junit_xml            # only junit_xml for now; extensible later

# Execution limits
timeout_seconds: 60

# Hidden test result display (future: configurable per-problem)
# Options: none | aggregate | names_only
hidden_results_display: none
```

Java example:
```yaml
id: asgn3-recursion
title: "Assignment 3: Recursion Practice"
language: java

test_command: mvn test -q
result_file: target/surefire-reports/TEST-*.xml
result_format: junit_xml
timeout_seconds: 120
```

---

## Student Repo Generation

1. Copy all non-dot files/dirs from repo root (excludes `.overlay/`, `.git/`, etc.)
2. Copy `.devcontainer/` explicitly (the one dotdir students need)
3. Skip `problem.yaml`
4. Done

No filtering logic, no manifest lookups. The repo structure does the work.

---

## Overlay Mechanism

Uses git for state management. The `.overlay/` directory structure itself identifies what was added or replaced — no custom manifest files.

### Quick Validation (non-destructive)

```bash
$ problem test              # runs test_command as-is (student view, starter code)
$ problem test --all        # temp copy → apply overlay → run tests → clean up
```

### Interactive Development

```bash
$ problem overlay apply     # git stash (if dirty) → cp .overlay/* into tree
$ pytest tests/ -v          # full suite with solution code
$ problem overlay save      # sync modified files back to .overlay/
$ problem overlay undo      # git checkout . → rm overlay-added files → git stash pop
```

`undo` knows which files to remove by walking `.overlay/` — if `.overlay/tests/test_edge.py` exists and `tests/test_edge.py` is not in the committed tree, it was added by the overlay and gets removed. The `.overlay/` directory IS the manifest.

---

## Test Framework Support

### The Platform's Role

The platform is framework-agnostic. It:

1. Runs `test_command` (opaque string)
2. Reads `result_file` (JUnit XML)
3. Parses structured results (test name, pass/fail, time, failure message)
4. Applies visibility rules (root tests = visible, overlay tests = hidden)

It never imports, parses, or discovers test files itself.

### pytest (Python happy path)

```yaml
test_command: pytest tests/ -v --tb=short --junitxml=results.xml
```

pytest discovers `test_*.py` by glob. Adding overlay tests = adding files = automatic discovery.

### unittest (Python, zero friction)

pytest natively discovers and runs `unittest.TestCase` classes. Same `test_command`, no config change:

```python
import unittest
from solution import fibonacci

class TestFibonacci(unittest.TestCase):
    def test_base_cases(self):
        self.assertEqual(fibonacci(0), 0)
        self.assertEqual(fibonacci(1), 1)
```

### JUnit (Java)

Maven Surefire discovers `*Test.java` and `Test*.java` by convention. Overlay-added test classes are automatically found:

```yaml
test_command: mvn test -q
result_file: target/surefire-reports/TEST-*.xml
```

### Other Frameworks

| Framework | test_command | result_file |
|-----------|-------------|-------------|
| Google Test (C++) | `cmake --build build && cd build && ctest --output-junit results.xml` | `build/results.xml` |
| Jest (TypeScript) | `npx jest --ci --reporters=jest-junit` | `junit.xml` |
| Vitest (TypeScript) | `npx vitest run --reporter=junit` | `junit.xml` |
| Go testing | `go test -v ./... 2>&1 \| go-junit-report > results.xml` | `results.xml` |

### JUnit XML as Universal Format

Every major test framework supports JUnit XML output. The platform parses it to extract: test name, class/suite, pass/fail/skip/error, execution time, failure message, stdout/stderr.

---

## Cross-Language Considerations

### Glob-Based Test Discovery Required

The overlay works because test frameworks discover tests by file pattern. Frameworks that glob for test files (pytest, JUnit/Surefire, CTest, Jest) automatically pick up overlay-added files.

**If a build system uses explicit file lists** (e.g., a hand-written Makefile listing test sources), the overlay must include a modified build file. Recommendation: always use glob-based test discovery in build configurations.

### Build Steps

Compiled languages need a build step before testing. This is the instructor's responsibility in `test_command`:

```yaml
# C++: build then test
test_command: cmake --build build && cd build && ctest --output-junit results.xml

# Java: Maven handles build + test
test_command: mvn test -q
```

### API Visibility and Hidden Tests

If hidden tests need access to functions not in the student-visible API (e.g., testing a private helper in C++ or Java), the overlay can include modified headers, interfaces, or access modifiers. The instructor manages this — the platform doesn't enforce API constraints.

### DevContainer Handles Runtime

Language-specific toolchains (Python + pytest, JDK + Maven, GCC + CMake, Node.js + npm) are specified in `.devcontainer/devcontainer.json`. The platform has no language-specific installation logic.

---

## Grading Workflow

1. Grading workspace starts from student's submission (their code + visible tests)
2. Platform copies `.overlay/` content into workspace (adds hidden tests, solution for reference)
3. Grader (AI or human) runs `test_command` — discovers all tests
4. Hidden test failures reveal bugs the student didn't catch

### Result Visibility

- **Visible tests** (source file exists in root): full results shown to students (test name, pass/fail, error output)
- **Hidden tests** (source file came from `.overlay/`): controlled by `hidden_results_display`:
  - `none` (default, short-term): completely invisible to students
  - `aggregate` (future): "3 of 5 hidden tests passing"
  - `names_only` (future): test names + pass/fail, no error details

The platform determines test visibility by checking whether the test's source file exists in the committed root tree or only in `.overlay/`.

---

## Validation Tool

```
$ problem validate
✓ Solution passes all tests (14/14)         # overlay applied in temp dir
✓ Starter fails at least one hidden test    # root code + overlay tests
✓ test_command executes successfully
✓ JUnit XML produced at result_file path
✓ .overlay/ paths are well-formed
✓ DevContainer config valid
```

Rules:

1. **Solution passes all tests**: with overlay applied (solution code + all tests), every test passes.
2. **Starter fails hidden tests**: with root code (starter) but all tests present, at least one hidden test fails. This proves the hidden tests are meaningful.
3. **JUnit XML produced**: `test_command` produces parseable output at `result_file`.
4. **Overlay well-formed**: every file in `.overlay/` either replaces a root file or adds to an existing directory.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo root | Student view (starter + visible tests) | "What you see is what they get." Trivial student copy generation. |
| Hidden content | `.overlay/` directory | All instructor-only content in one place. Additive only (add/replace, never remove). |
| Visibility | Filesystem structure | Root = visible, `.overlay/` = hidden. No manifest lists. |
| Overlay apply/undo | git stash + `.overlay/` dir walk | Git handles tracked files; `.overlay/` structure identifies added files. No custom manifest. |
| Single branch | Yes | Avoids branch sync problems and wrong-branch accidents. |
| Test command | Fully configurable | Framework and language agnostic. |
| Result format | JUnit XML | Universal across all major test frameworks and languages. |
| pytest + unittest | Same command | pytest discovers `unittest.TestCase` natively. |
| Build steps | Instructor's responsibility in `test_command` | Platform doesn't know about compilation. |
| API visibility for hidden tests | Instructor manages | Overlay can include modified headers/interfaces. |
| Hidden results | Not shown short-term, configurable long-term | Start with `none`, add `aggregate`/`names_only` later. |
| Phase 1 | Unchanged | JSONB model stays for in-class exercises. |
| Glob-based test discovery | Recommended, documented | Required for overlay to work seamlessly with build systems. |
