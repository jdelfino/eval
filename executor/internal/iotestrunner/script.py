#!/usr/bin/env python3
"""
I/O test runner for the executor service.

Receives:
  argv[1]: path to student code file (solution.py or Main.java)
  argv[2]: path to JSON test definitions file

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
    try:
        if language == "java":
            # For Java: the code_path is the .java source file.
            # Use the JEP 330 single-file launcher (java <file>).
            java_bin = os.environ.get("JAVA_PATH", "/usr/bin/java")
            cmd = [java_bin, "-XX:TieredStopAtLevel=1", code_path]
        else:
            # Python: run the file with python3.
            # If random_seed is provided, build a temporary wrapper file that
            # seeds the RNG before executing the student code.
            python_bin = os.environ.get("PYTHON_PATH", "/usr/bin/python3")
            if random_seed is not None:
                import tempfile
                seed_prefix = f"import random; random.seed({random_seed})\n"
                with open(code_path, "r") as f:
                    student_code = f.read()
                seeded_code = seed_prefix + student_code
                tmp = tempfile.NamedTemporaryFile(
                    mode="w", suffix=".py", delete=False, dir=os.path.dirname(code_path) or "."
                )
                tmp.write(seeded_code)
                tmp.close()
                cmd = [python_bin, tmp.name]
            else:
                cmd = [python_bin, code_path]

        proc = subprocess.run(
            cmd,
            input=stdin_input,
            capture_output=True,
            text=True,
            timeout=PER_TEST_TIMEOUT_SEC,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        actual_stdout = proc.stdout
        if len(actual_stdout) > MAX_CASE_OUTPUT_BYTES:
            actual_stdout = actual_stdout[:MAX_CASE_OUTPUT_BYTES] + "\n... [output truncated]"
        stderr_output = proc.stderr

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

        # Normalize: strip trailing whitespace from each line for comparison,
        # and strip trailing newlines from the overall output.
        actual_normalized = actual_stdout.rstrip("\n")

        result = {
            "name": name,
            "type": "io",
            "input": stdin_input,
            "actual": actual_normalized,
            "time_ms": elapsed_ms,
        }

        if expected_output is None:
            # Run-only: code ran without error => "run" (no assertion made).
            result["status"] = "run"
        else:
            expected_normalized = expected_output.rstrip("\n")
            if matches(actual_normalized, expected_normalized, match_type):
                result["status"] = "passed"
                result["expected"] = expected_normalized
            else:
                result["status"] = "failed"
                result["expected"] = expected_normalized

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
        print(json.dumps({"error": "usage: io_test_runner.py <code_path> <tests_path>"}))
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
