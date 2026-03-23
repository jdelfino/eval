#!/usr/bin/env python3
"""
I/O test runner for the executor service.

Receives:
  argv[1]: path to student code file (solution.py or Main.java)
  argv[2]: path to JSON test definitions file
  argv[3]: language (optional, default "python")

Each test definition has the shape:
  {
    "name": "test name",
    "input": "stdin input",
    "expected_output": "expected stdout",  // optional; absent = run-only
    "match_type": "exact"
  }

Outputs a JSON array of TestResult objects to stdout:
  [
    {
      "name": "test name",
      "type": "io",
      "status": "passed" | "failed" | "error",
      "input": "...",
      "expected": "...",       // omitted when absent
      "actual": "...",         // omitted on error
      "stderr": "...",         // omitted when empty
      "time_ms": 42
    },
    ...
  ]
"""

import sys
import json
import re
import subprocess
import time
import os

# Per-test timeout: 10 seconds by default.
# The overall sandbox invocation also has a timeout, but we add a per-test
# safeguard to prevent a single test from consuming the whole budget.
PER_TEST_TIMEOUT_SEC = 10

# Maximum bytes of student output to include in a single test result.
# Output beyond this limit is truncated before JSON encoding so the runner's
# own stdout (a JSON array of results) stays well within the sandbox output cap.
MAX_CASE_OUTPUT_BYTES = 1024 * 1024  # 1 MB

# INPUT_ECHO_PREAMBLE overrides Python's input() to print each value after
# reading it — the same behavior a terminal provides. Without this, piped
# stdin is invisible in stdout, producing hard-to-read output like:
#
#   Enter name: Enter age: Hello Alice, you are 25
#
# With the preamble the output reads naturally:
#
#   Enter name: Alice
#   Enter age: 25
#   Hello Alice, you are 25
#
# This mirrors the Go-side inputEchoPreamble in sandbox.go. The Go preamble
# handles direct execution; this one handles subprocess execution via iotestrunner.
INPUT_ECHO_PREAMBLE = """_original_input = input
def input(prompt=''):
    value = _original_input(prompt)
    print(value)
    return value
"""


def matches(actual, expected, match_type):
    """Return True if actual matches expected according to match_type.

    match_type values:
      "exact"    — strip trailing newlines, compare strings (default)
      "contains" — check if expected appears as a substring of actual
      "regex"    — compile expected as a regular expression and search actual
    """
    if match_type == "contains":
        return expected in actual
    if match_type == "regex":
        try:
            return bool(re.search(expected, actual))
        except re.error:
            return False
    # Default: "exact" — strip trailing newlines and compare.
    return actual.rstrip("\n") == expected.rstrip("\n")


def run_test(code_path, test, language):
    """Run a single test case against the student code.

    Returns a result dict.
    """
    name = test.get("name", "")
    stdin_input = test.get("input", "")
    expected_output = test.get("expected_output", None)  # None = run-only
    match_type = test.get("match_type", "exact")
    random_seed = test.get("random_seed", None)

    start = time.monotonic()
    tmp_path = None
    try:
        if language == "java":
            # For Java: the code_path is the .java source file.
            # Use the JEP 330 single-file launcher (java <file>).
            java_bin = os.environ.get("JAVA_PATH", "/usr/bin/java")
            cmd = [java_bin, "-XX:TieredStopAtLevel=1", code_path]
            preamble_lines = 0
        else:
            # Python: run the file with python3.
            # Build a prefix consisting of:
            #   1. Echo preamble (when stdin is provided) so input() values appear in output.
            #   2. Random seed injection (when random_seed is provided).
            # If any prefix is needed, write a temp wrapper file so Python tracebacks
            # reference a consistent path that we can sanitize.
            import tempfile
            python_bin = os.environ.get("PYTHON_PATH", "/usr/bin/python3")
            prefix = ""
            if stdin_input != "":
                prefix += INPUT_ECHO_PREAMBLE
            if random_seed is not None:
                prefix += f"import random; random.seed({random_seed})\n"
            preamble_lines = prefix.count("\n")

            if prefix:
                with open(code_path, "r") as f:
                    student_code = f.read()
                combined_code = prefix + student_code
                tmp = tempfile.NamedTemporaryFile(
                    mode="w", suffix=".py", delete=False, dir=os.path.dirname(code_path) or "."
                )
                tmp.write(combined_code)
                tmp.close()
                cmd = [python_bin, tmp.name]
                tmp_path = tmp.name
            else:
                cmd = [python_bin, code_path]

        try:
            proc = subprocess.run(
                cmd,
                input=stdin_input,
                capture_output=True,
                text=True,
                timeout=PER_TEST_TIMEOUT_SEC,
            )
        finally:
            if tmp_path:
                os.unlink(tmp_path)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        actual_stdout = proc.stdout
        if len(actual_stdout) > MAX_CASE_OUTPUT_BYTES:
            actual_stdout = actual_stdout[:MAX_CASE_OUTPUT_BYTES] + "\n... [output truncated]"
        stderr_output = proc.stderr

        # Clean up stderr: replace temp file paths with "solution.py" and adjust
        # line numbers to be relative to the student's code (not the preamble).
        if stderr_output and tmp_path:
            # Replace the full temp file path with "solution.py" in tracebacks.
            # The full path replacement must come first so it takes precedence over
            # the basename replacement (which would leave a directory prefix behind).
            stderr_output = stderr_output.replace(tmp_path, "solution.py")
            # Also replace any remaining bare basename references (e.g. tmpXXXXXX.py).
            tmp_filename = os.path.basename(tmp_path)
            stderr_output = stderr_output.replace(tmp_filename, "solution.py")
            # Adjust line numbers in traceback lines: subtract preamble_lines.
            # Matches: File "solution.py", line N  (or File "/path/solution.py", line N)
            if preamble_lines > 0:
                def adjust_line(m):
                    prefix_str = m.group(1)
                    line_num = int(m.group(2))
                    adjusted = max(1, line_num - preamble_lines)
                    return f"{prefix_str}{adjusted}"
                stderr_output = re.sub(
                    r'(File ".*?solution\.py", line )(\d+)',
                    adjust_line,
                    stderr_output,
                )

        if proc.returncode != 0:
            # Student code crashed.
            result = {
                "name": name,
                "type": "io",
                "status": "error",
                "input": stdin_input,
                "time_ms": elapsed_ms,
            }
            if stderr_output:
                result["stderr"] = stderr_output
            return result

        result = {
            "name": name,
            "type": "io",
            "input": stdin_input,
            "actual": actual_stdout,
            "time_ms": elapsed_ms,
        }

        if expected_output is None:
            # Run-only: code ran without error => "run" (no assertion made).
            result["status"] = "run"
        else:
            # Normalize trailing newlines for comparison only; preserve originals in output.
            actual_normalized = actual_stdout.rstrip("\n")
            expected_normalized = expected_output.rstrip("\n")
            if matches(actual_normalized, expected_normalized, match_type):
                result["status"] = "passed"
                result["expected"] = expected_output
            else:
                result["status"] = "failed"
                result["expected"] = expected_output

        if stderr_output:
            result["stderr"] = stderr_output

        return result

    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "name": name,
            "type": "io",
            "status": "error",
            "input": stdin_input,
            "stderr": "execution timed out",
            "time_ms": elapsed_ms,
        }
    except Exception as e:  # noqa: BLE001
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "name": name,
            "type": "io",
            "status": "error",
            "input": stdin_input,
            "stderr": str(e),
            "time_ms": elapsed_ms,
        }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: io_test_runner.py <code_path> <tests_path> [<language>]"}))
        sys.exit(1)

    code_path = sys.argv[1]
    tests_path = sys.argv[2]
    language = sys.argv[3] if len(sys.argv) > 3 else "python"

    with open(tests_path) as f:
        tests = json.load(f)

    results = []
    for test in tests:
        result = run_test(code_path, test, language)
        results.append(result)

    print(json.dumps(results))


if __name__ == "__main__":
    main()
