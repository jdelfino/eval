#!/usr/bin/env python3
"""
Pytest runner for the executor service.

Receives:
  argv[1]: path to student code file (solution.py / student_module.py)
  argv[2]: JSON-encoded array of pytest case definitions

Each case definition has the shape:
  {
    "kind": "pytest",
    "name": "...",
    "target_path": "tests/test_foo.py",   // relative path for the test file
    "test_code": "...",                    // content of the test file
    "timeout_ms": 10000                   // optional per-case timeout (ms)
  }

Outputs a JSON array of PytestCaseResult objects to stdout:
  [
    {
      "kind": "pytest",
      "name": "...",
      "passed": bool,       // true iff all assertions passed
      "duration_ms": int,
      "assertions": [
        {
          "name": "test_foo",
          "passed": bool,
          "failure_message": "...",   // empty on pass
          "traceback": "..."          // empty on pass
        }
      ],
      "stderr": "..."       // populated on collection/import errors
    },
    ...
  ]
"""

import sys
import os
import json
import subprocess
import tempfile
import time
import shutil

# Default per-case timeout in milliseconds.
DEFAULT_TIMEOUT_MS = 10000

# Name used for the student module file inside the working directory.
STUDENT_MODULE_NAME = "student_module.py"


def run_pytest_case(student_code_path, case, work_dir):
    """Run a single pytest case.

    Returns a dict matching the PytestCaseResult shape.
    """
    name = case.get("name", "")
    target_path = case.get("target_path", "test_case.py")
    test_code = case.get("test_code", "")
    timeout_ms = case.get("timeout_ms", DEFAULT_TIMEOUT_MS)
    timeout_sec = max(1, int(timeout_ms / 1000))

    # Set up a temporary working directory for this case so each case is isolated.
    case_dir = tempfile.mkdtemp(dir=work_dir, prefix="case_")
    try:
        return _run_pytest_in_dir(student_code_path, name, target_path, test_code, timeout_sec, case_dir)
    finally:
        shutil.rmtree(case_dir, ignore_errors=True)


def _run_pytest_in_dir(student_code_path, name, target_path, test_code, timeout_sec, case_dir):
    """Execute pytest inside case_dir and parse the JSON report."""
    # Copy student code into the case directory as student_module.py.
    student_dest = os.path.join(case_dir, STUDENT_MODULE_NAME)
    with open(student_code_path, "r") as f:
        student_src = f.read()
    with open(student_dest, "w") as f:
        f.write(student_src)

    # Determine test file path (relative to case_dir).
    safe_target = _sanitize_path(target_path)
    test_file_path = os.path.join(case_dir, safe_target)
    test_file_dir = os.path.dirname(test_file_path)
    os.makedirs(test_file_dir, exist_ok=True)

    # Write test file.
    with open(test_file_path, "w") as f:
        f.write(test_code)

    # Create __init__.py so tests can import student_module.
    tests_init = os.path.join(test_file_dir, "__init__.py")
    if not os.path.exists(tests_init):
        open(tests_init, "w").close()

    # Write a conftest.py that adds case_dir to sys.path so tests can import student_module.
    conftest_path = os.path.join(case_dir, "conftest.py")
    with open(conftest_path, "w") as f:
        f.write("import sys, os\n")
        f.write(f"sys.path.insert(0, {repr(case_dir)})\n")

    # JSON report output file.
    report_path = os.path.join(case_dir, "report.json")

    python_bin = os.environ.get("PYTHON_PATH", sys.executable)

    start = time.monotonic()
    try:
        proc = subprocess.run(
            [
                python_bin, "-m", "pytest",
                safe_target,
                "--json-report",
                f"--json-report-file={report_path}",
                "--tb=short",
                "-q",
                "--no-header",
            ],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            cwd=case_dir,
        )
    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "kind": "pytest",
            "name": name,
            "passed": False,
            "duration_ms": elapsed_ms,
            "assertions": [],
            "stderr": "execution timed out",
        }
    except Exception as e:  # noqa: BLE001
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "kind": "pytest",
            "name": name,
            "passed": False,
            "duration_ms": elapsed_ms,
            "assertions": [],
            "stderr": f"pytest runner error: {e}",
        }

    elapsed_ms = int((time.monotonic() - start) * 1000)

    # Try to parse the JSON report.
    if os.path.exists(report_path):
        try:
            with open(report_path, "r") as f:
                report = json.load(f)
            return _parse_report(name, report, elapsed_ms)
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            # Report exists but is malformed — fall through to stderr handling.
            stderr_text = proc.stderr or proc.stdout or f"failed to parse pytest JSON report: {e}"
            return {
                "kind": "pytest",
                "name": name,
                "passed": False,
                "duration_ms": elapsed_ms,
                "assertions": [],
                "stderr": _truncate(stderr_text),
            }

    # No report file — pytest crashed (collection error, import error, etc.).
    # Capture stderr + stdout as the error message.
    stderr_text = proc.stderr or proc.stdout or "pytest produced no output"
    return {
        "kind": "pytest",
        "name": name,
        "passed": False,
        "duration_ms": elapsed_ms,
        "assertions": [],
        "stderr": _truncate(stderr_text),
    }


def _parse_report(name, report, elapsed_ms):
    """Parse the pytest-json-report JSON output into PytestCaseResult shape.

    The report schema (from pytest-json-report):
      - exitcode: 0=passed, 1=failed, 2=interrupted (collection error), 3=internal error, 4=usage error, 5=no tests
      - tests: list of test results (empty when collection fails)
      - collectors: list of collector results; failed collectors indicate collection errors
      - summary: aggregated counts
    """
    exitcode = report.get("exitcode", 0)
    tests = report.get("tests", [])
    collectors = report.get("collectors", [])

    # exitcode 2 = interrupted (collection error, import error, etc.)
    # exitcode 3+ = internal/usage errors
    # Also catch the case where tests is empty and we have failed collectors.
    failed_collectors = [c for c in collectors if c.get("outcome") == "failed"]

    if not tests and (exitcode in (2, 3, 4) or failed_collectors):
        # Collection error — extract error details from failed collectors.
        stderr_parts = []
        for collector in failed_collectors:
            longrepr = collector.get("longrepr", "")
            if isinstance(longrepr, str):
                stderr_parts.append(longrepr)
            elif isinstance(longrepr, dict):
                msg = longrepr.get("reprcrash", {}).get("message", "")
                if msg:
                    stderr_parts.append(str(msg))
                else:
                    stderr_parts.append(str(longrepr))
        stderr_text = "\n".join(stderr_parts) if stderr_parts else "pytest collection error (no output)"
        return {
            "kind": "pytest",
            "name": name,
            "passed": False,
            "duration_ms": elapsed_ms,
            "assertions": [],
            "stderr": _truncate(stderr_text),
        }

    assertions = []
    all_passed = True

    for test in tests:
        test_name = test.get("nodeid", "unknown")
        outcome = test.get("outcome", "failed")
        passed = (outcome == "passed")
        if not passed:
            all_passed = False

        failure_message = ""
        traceback_text = ""

        if not passed:
            # Extract failure details from the "call" phase (or "setup"/"teardown" for errors).
            for phase in ("call", "setup", "teardown"):
                phase_data = test.get(phase, None)
                if phase_data and phase_data.get("outcome") in ("failed", "error"):
                    longrepr = phase_data.get("longrepr", "")
                    if isinstance(longrepr, str):
                        failure_message, traceback_text = _split_longrepr(longrepr)
                    elif isinstance(longrepr, dict):
                        # pytest-json-report sometimes returns a dict for longrepr.
                        failure_message = str(longrepr.get("reprcrash", {}).get("message", ""))
                        traceback_text = str(longrepr.get("reprtraceback", {}).get("reprentries", ""))
                    break

        assertions.append({
            "name": test_name,
            "passed": passed,
            "failure_message": failure_message,
            "traceback": traceback_text,
        })

    return {
        "kind": "pytest",
        "name": name,
        "passed": all_passed,
        "duration_ms": elapsed_ms,
        "assertions": assertions,
        "stderr": "",
    }


def _split_longrepr(longrepr):
    """Split pytest longrepr into (failure_message, traceback).

    longrepr typically looks like:
      <traceback lines>
      E   AssertionError: assert X == Y

    We treat lines starting with 'E ' as the failure message and the
    remainder as the traceback.
    """
    lines = longrepr.splitlines()
    error_lines = []
    traceback_lines = []

    for line in lines:
        if line.startswith("E ") or line.startswith("E\t"):
            error_lines.append(line[2:].strip())
        else:
            traceback_lines.append(line)

    failure_message = " ".join(error_lines).strip()
    traceback = "\n".join(traceback_lines).strip()
    return failure_message, traceback


def _sanitize_path(path):
    """Sanitize a relative path to prevent directory traversal."""
    # Resolve to prevent ../../../etc/passwd attacks.
    # We keep the basename structure but strip leading slashes and ../ components.
    parts = []
    for part in path.replace("\\", "/").split("/"):
        if part in ("", ".", ".."):
            continue
        # Remove any component that looks like an absolute path component.
        if part.startswith("/"):
            part = part.lstrip("/")
        parts.append(part)
    if not parts:
        return "test_case.py"
    return os.path.join(*parts)


def _truncate(text, max_bytes=65536):
    """Truncate text to max_bytes, appending a notice if truncated."""
    if len(text.encode("utf-8", errors="replace")) <= max_bytes:
        return text
    return text[:max_bytes] + "\n... [truncated]"


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: pytest_runner.py <student_code_path> <cases_json>"}))
        sys.exit(1)

    student_code_path = sys.argv[1]
    cases_json = sys.argv[2]

    try:
        cases = json.loads(cases_json)
    except json.JSONDecodeError as e:
        print(json.dumps([{"kind": "pytest", "name": "error", "passed": False,
                           "duration_ms": 0, "assertions": [],
                           "stderr": f"invalid cases JSON: {e}"}]))
        sys.exit(0)

    # Use a shared work dir for all cases (cleaned up after each case run).
    work_dir = tempfile.mkdtemp(prefix="pytest_work_")
    try:
        results = []
        for case in cases:
            result = run_pytest_case(student_code_path, case, work_dir)
            results.append(result)
        print(json.dumps(results))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
