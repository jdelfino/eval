#!/usr/bin/env python3
"""
Validates the structure of .github/workflows/ci.yml.

This script is used to verify the consolidated CI workflow has the correct
structure: proper triggers, job dependencies, path filters, and required jobs.

Exit code 0 = valid, 1 = invalid.
"""

import sys
import yaml


def load_workflow(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def check(condition, message):
    if not condition:
        print(f"FAIL: {message}")
        return False
    print(f"PASS: {message}")
    return True


def validate(workflow_path):
    try:
        wf = load_workflow(workflow_path)
    except FileNotFoundError:
        print(f"FAIL: workflow file not found: {workflow_path}")
        return False
    except yaml.YAMLError as e:
        print(f"FAIL: YAML parse error: {e}")
        return False

    ok = True
    jobs = wf.get("jobs", {})
    # In YAML, 'on' is parsed as Python True (YAML boolean). Handle both.
    on = wf.get(True, wf.get("on", {})) or {}

    # ── Triggers ────────────────────────────────────────────────────────────
    ok &= check("pull_request" in on, "trigger: pull_request")
    ok &= check("workflow_call" in on, "trigger: workflow_call")

    wc = on.get("workflow_call", {}) or {}
    wc_inputs = wc.get("inputs", {}) or {}
    ok &= check("run-all" in wc_inputs, "workflow_call input: run-all")
    run_all_type = (wc_inputs.get("run-all") or {}).get("type")
    ok &= check(run_all_type == "boolean", "run-all input type is boolean")

    # ── Required jobs ────────────────────────────────────────────────────────
    required_jobs = [
        "changes",
        "build-frontend",
        "build-go-api",
        # Frontend test jobs
        "frontend-typecheck",
        "frontend-test",
        "frontend-lint",
        "frontend-contract-coverage",
        # Go API test jobs
        "go-api-test",
        "go-api-lint",
        "go-api-integration",
        # Executor test jobs
        "executor-test",
        "executor-lint",
        "executor-integration",
        # Cross-stack jobs
        "contract-tests",
        "e2e-tests",
        "validate-manifests",
        "migration-lint",
    ]
    for job in required_jobs:
        ok &= check(job in jobs, f"job exists: {job}")

    # ── changes job ──────────────────────────────────────────────────────────
    changes_job = jobs.get("changes", {})
    ok &= check(
        "dorny/paths-filter" in str(changes_job),
        "changes job uses dorny/paths-filter",
    )
    changes_outputs = changes_job.get("outputs", {})
    for filter_name in ["go-backend", "frontend", "executor", "k8s", "migrations"]:
        ok &= check(
            filter_name in changes_outputs,
            f"changes job output: {filter_name}",
        )

    # ── build-frontend job ───────────────────────────────────────────────────
    bf = jobs.get("build-frontend", {})
    bf_needs = bf.get("needs", [])
    if isinstance(bf_needs, str):
        bf_needs = [bf_needs]
    ok &= check("changes" in bf_needs, "build-frontend needs: changes")
    bf_steps_str = str(bf)
    ok &= check("actions/cache" in bf_steps_str, "build-frontend: node_modules cache step")
    ok &= check("npm ci" in bf_steps_str, "build-frontend: npm ci step")

    # ── build-go-api job ─────────────────────────────────────────────────────
    bg = jobs.get("build-go-api", {})
    bg_needs = bg.get("needs", [])
    if isinstance(bg_needs, str):
        bg_needs = [bg_needs]
    ok &= check("changes" in bg_needs, "build-go-api needs: changes")
    bg_steps_str = str(bg)
    ok &= check("actions/setup-go" in bg_steps_str, "build-go-api: setup-go step")
    ok &= check("go build" in bg_steps_str, "build-go-api: go build step")

    # ── Frontend test jobs need build-frontend ───────────────────────────────
    for job_name in ["frontend-typecheck", "frontend-test", "frontend-lint", "frontend-contract-coverage"]:
        job = jobs.get(job_name, {})
        needs = job.get("needs", [])
        if isinstance(needs, str):
            needs = [needs]
        ok &= check("build-frontend" in needs, f"{job_name} needs: build-frontend")
        job_str = str(job)
        ok &= check("actions/cache" in job_str, f"{job_name}: restores node_modules cache")

    # ── Go API test jobs need build-go-api ───────────────────────────────────
    for job_name in ["go-api-test", "go-api-lint", "go-api-integration"]:
        job = jobs.get(job_name, {})
        needs = job.get("needs", [])
        if isinstance(needs, str):
            needs = [needs]
        ok &= check("build-go-api" in needs, f"{job_name} needs: build-go-api")

    # ── Executor jobs: NO setup-java ─────────────────────────────────────────
    for job_name in ["executor-test", "executor-lint", "executor-integration"]:
        job = jobs.get(job_name, {})
        ok &= check("setup-java" not in str(job), f"{job_name}: no setup-java")

    # ── contract-tests needs build-frontend + build-go-api ───────────────────
    ct_job = jobs.get("contract-tests", {})
    ct_needs = ct_job.get("needs", [])
    if isinstance(ct_needs, str):
        ct_needs = [ct_needs]
    ok &= check("build-frontend" in ct_needs, "contract-tests needs: build-frontend")
    ok &= check("build-go-api" in ct_needs, "contract-tests needs: build-go-api")

    # ── e2e-tests needs build-frontend + build-go-api ────────────────────────
    e2e_job = jobs.get("e2e-tests", {})
    e2e_needs = e2e_job.get("needs", [])
    if isinstance(e2e_needs, str):
        e2e_needs = [e2e_needs]
    ok &= check("build-frontend" in e2e_needs, "e2e-tests needs: build-frontend")
    ok &= check("build-go-api" in e2e_needs, "e2e-tests needs: build-go-api")
    e2e_str = str(e2e_job)
    ok &= check("WIF_PROVIDER" in e2e_str, "e2e-tests: GCP auth (WIF_PROVIDER)")

    # ── validate-manifests: validates base AND staging ────────────────────────
    vm_str = str(jobs.get("validate-manifests", {}))
    ok &= check("k8s/base" in vm_str, "validate-manifests: k8s/base")
    ok &= check("k8s/overlays/staging" in vm_str, "validate-manifests: k8s/overlays/staging")

    # ── migration-lint: PR-only ───────────────────────────────────────────────
    ml_job = jobs.get("migration-lint", {})
    ml_str = str(ml_job)
    ok &= check("pull_request" in ml_str, "migration-lint: PR-only condition")
    ok &= check("fetch-depth" in ml_str, "migration-lint: fetch-depth 0 for git history")

    # ── e2e-tests: ubuntu-latest (no container) ───────────────────────────────
    e2e_runs_on = e2e_job.get("runs-on", "")
    ok &= check(e2e_runs_on == "ubuntu-latest", f"e2e-tests runs-on ubuntu-latest (got: {e2e_runs_on})")
    ok &= check("container:" not in str(e2e_job), "e2e-tests: no container (ubuntu-latest only)")

    return ok


if __name__ == "__main__":
    workflow_path = sys.argv[1] if len(sys.argv) > 1 else ".github/workflows/ci.yml"
    success = validate(workflow_path)
    print()
    if success:
        print("All checks passed.")
        sys.exit(0)
    else:
        print("Some checks failed.")
        sys.exit(1)
