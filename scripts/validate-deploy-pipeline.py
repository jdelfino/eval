#!/usr/bin/env python3
"""
Validates the structure of .github/workflows/deploy-pipeline.yaml.

Checks that:
- All required jobs are present
- build-push-executor uses content-hash caching to skip unnecessary builds
- The skip path produces a commit-SHA tag (so deploy-staging works unchanged)
- The build path also produces commit-SHA and latest tags
- deploy-staging runs executor sandbox validation via in-cluster K8s Job
- The hibernation guard: a hibernation-check job exists and exposes a
  `hibernating` output; the five gated jobs (build-push-go-api,
  build-push-executor, build-push-frontend, deploy-staging, deploy-prod)
  each list it in `needs` and reference its output in their `if:`; `ci` and
  `notify-failure` do not; and no job has a duplicate `if:` key (a hard
  parse error for GitHub Actions' own workflow parser) — enforced below by
  a loader that raises on duplicate mapping keys, since plain
  yaml.safe_load silently keeps the last value instead of rejecting it.

Exit code 0 = valid, 1 = invalid.
"""

import sys
import yaml


class _UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that raises on duplicate mapping keys.

    Plain yaml.safe_load silently keeps the last value for a duplicate key
    (e.g. two `if:` entries under one job) instead of raising. A duplicate
    job-level `if:` is exactly the mistake the hibernation guard's "AND it
    into the existing if:" instruction exists to avoid, and GitHub Actions'
    own workflow parser rejects it outright — so this loader makes the
    local validator catch it too, rather than silently passing.
    """

    def construct_mapping(self, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in seen:
                raise yaml.constructor.ConstructorError(
                    "while constructing a mapping",
                    node.start_mark,
                    f"found duplicate key {key!r}",
                    key_node.start_mark,
                )
            seen.add(key)
        return super().construct_mapping(node, deep)


def load_workflow(path):
    with open(path, "r") as f:
        return yaml.load(f, Loader=_UniqueKeyLoader)


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

    # ── Required jobs ──────────────────────────────────────────────────────────
    required_jobs = [
        "build-push-go-api",
        "build-push-executor",
        "build-push-frontend",
        "ci",
        "deploy-staging",
        "deploy-prod",
    ]
    for job in required_jobs:
        ok &= check(job in jobs, f"job exists: {job}")

    ok &= check(
        "build-push-test-runner" not in jobs,
        "job removed: build-push-test-runner (replaced by public staging approach)",
    )

    # ── Hibernation guard ──────────────────────────────────────────────────────
    # hibernation-check reads the same tfvars the `hibernate` flag lives in, so
    # there is no second toggle to drift from the applied Terraform state. The
    # five build/deploy jobs must gate on its output; ci keeps gating merges
    # while hibernating, and notify-failure's failure-only condition already
    # tolerates skipped upstreams — neither should reference the guard.
    ok &= check("hibernation-check" in jobs, "job exists: hibernation-check")

    hibernation_job = jobs.get("hibernation-check", {})
    hibernation_outputs = hibernation_job.get("outputs", {})
    ok &= check(
        "hibernating" in hibernation_outputs,
        "hibernation-check: exposes a 'hibernating' output",
    )

    gated_jobs = [
        "build-push-go-api",
        "build-push-executor",
        "build-push-frontend",
        "deploy-staging",
        "deploy-prod",
    ]
    for job_name in gated_jobs:
        job = jobs.get(job_name, {})
        job_needs = job.get("needs", [])
        if isinstance(job_needs, str):
            job_needs = [job_needs]
        ok &= check(
            "hibernation-check" in job_needs,
            f"{job_name}: needs hibernation-check",
        )
        job_if = str(job.get("if", ""))
        ok &= check(
            "needs.hibernation-check.outputs.hibernating" in job_if,
            f"{job_name}: if: references needs.hibernation-check.outputs.hibernating",
        )

    for job_name in ["ci", "notify-failure"]:
        job = jobs.get(job_name, {})
        job_if = str(job.get("if", ""))
        ok &= check(
            "hibernation-check" not in job_if,
            f"{job_name}: if: does NOT reference hibernation-check (left alone)",
        )

    # deploy-prod's condition starts with always(), which overrides GitHub's
    # default of skipping a job whose `needs` failed. Without an explicit
    # result check, a *failed* hibernation-check leaves `hibernating` empty,
    # '' != 'true' evaluates true, and prod deploys against a nodeless
    # cluster — the exact outcome the guard exists to prevent. The other
    # gated jobs have no always() and so fail closed on their own.
    prod_if = str(jobs.get("deploy-prod", {}).get("if", ""))
    ok &= check(
        "needs.hibernation-check.result == 'success'" in prod_if,
        "deploy-prod: if: fails closed when hibernation-check itself fails",
    )

    # ── build-push-executor: content-hash caching ─────────────────────────────
    executor_job = jobs.get("build-push-executor", {})
    executor_str = str(executor_job)

    # The job must compute a content hash of build inputs
    ok &= check(
        "sha256sum" in executor_str,
        "build-push-executor: computes sha256sum content hash",
    )
    ok &= check(
        "content-" in executor_str,
        "build-push-executor: uses content-$HASH tag prefix",
    )

    # Exclude executor/tmp/ from the hash
    ok &= check(
        "tmp" in executor_str,
        "build-push-executor: excludes executor/tmp/ from hash",
    )

    # Must check if the content-tagged image already exists in Artifact Registry
    ok &= check(
        "gcloud artifacts docker tags list" in executor_str,
        "build-push-executor: checks Artifact Registry for existing content-hash tag",
    )

    # Both skip and build paths must tag the image with the commit SHA
    # (deploy-staging uses ${{ github.sha }} to reference the image)
    ok &= check(
        "github.sha" in executor_str,
        "build-push-executor: tags image with github.sha (required by deploy-staging)",
    )

    # Both paths must also update the latest tag
    ok &= check(
        "latest" in executor_str,
        "build-push-executor: updates latest tag",
    )

    # Must use gcloud artifacts docker tags add for retag-without-pull path
    ok &= check(
        "gcloud artifacts docker tags add" in executor_str,
        "build-push-executor: uses gcloud artifacts docker tags add to retag without pulling",
    )

    # ── deploy-staging: gates on all build-push jobs ──────────────────────────
    staging_job = jobs.get("deploy-staging", {})
    staging_needs = staging_job.get("needs", [])
    if isinstance(staging_needs, str):
        staging_needs = [staging_needs]
    ok &= check(
        "build-push-executor" in staging_needs,
        "deploy-staging needs: build-push-executor",
    )

    # ── deploy-staging: executor sandbox validation via in-cluster K8s Job ──────
    # Connect Gateway blocks kubectl port-forward (SPDY upgrade), so the
    # executor is validated via a K8s Job that runs curl from inside the cluster.
    staging_steps = staging_job.get("steps", [])
    staging_steps_str = str(staging_steps)

    ok &= check(
        "executor-validate" in staging_steps_str,
        "deploy-staging: uses executor-validate K8s Job",
    )
    ok &= check(
        "executor.staging.svc.cluster.local" in staging_steps_str,
        "deploy-staging: executor Job uses in-cluster FQDN",
    )

    # ── deploy-staging: seed staging data after rollout ───────────────────────
    # The seed step must run after rollout completes and before E2E tests.
    # Seed failures should block the pipeline — E2E tests depend on seed data.
    step_names = [s.get("name", "") for s in staging_steps]

    seed_step = next((s for s in staging_steps if s.get("name") == "Seed staging data"), None)
    ok &= check(
        seed_step is not None,
        "deploy-staging: has 'Seed staging data' step",
    )

    if seed_step is not None:
        ok &= check(
            seed_step.get("continue-on-error") is not True,
            "deploy-staging: 'Seed staging data' does not use continue-on-error",
        )
        seed_run = seed_step.get("run", "")
        ok &= check(
            "seed-staging.sh" in seed_run,
            "deploy-staging: 'Seed staging data' runs scripts/seed-staging.sh",
        )
        seed_env = seed_step.get("env", {})
        ok &= check(
            "E2E_PASSWORD" in seed_env,
            "deploy-staging: 'Seed staging data' passes E2E_PASSWORD",
        )

    # "Read staging config from ConfigMaps" must come before "Setup Node.js"
    # (i.e., it was moved earlier in the job, before npm/playwright setup)
    if "Read staging config from ConfigMaps" in step_names and "Setup Node.js" in step_names:
        config_idx = step_names.index("Read staging config from ConfigMaps")
        node_idx = step_names.index("Setup Node.js")
        ok &= check(
            config_idx < node_idx,
            "deploy-staging: 'Read staging config from ConfigMaps' moved before 'Setup Node.js'",
        )

    # "Seed staging data" must come before "Setup Node.js"
    if seed_step is not None and "Setup Node.js" in step_names:
        seed_idx = step_names.index("Seed staging data")
        node_idx = step_names.index("Setup Node.js")
        ok &= check(
            seed_idx < node_idx,
            "deploy-staging: 'Seed staging data' runs before 'Setup Node.js' (before E2E tests)",
        )

    # ── deploy-prod: gates on deploy-staging + ci ─────────────────────────────
    prod_job = jobs.get("deploy-prod", {})
    prod_needs = prod_job.get("needs", [])
    if isinstance(prod_needs, str):
        prod_needs = [prod_needs]
    ok &= check("deploy-staging" in prod_needs, "deploy-prod needs: deploy-staging")
    ok &= check("ci" in prod_needs, "deploy-prod needs: ci")

    # ── deploy-prod: smoke test credentials read from cluster before smoke test ─
    prod_steps = prod_job.get("steps", [])
    prod_steps_str = str(prod_steps)

    ok &= check(
        "FIREBASE_API_KEY" in prod_steps_str,
        "deploy-prod: reads FIREBASE_API_KEY for smoke test",
    )
    ok &= check(
        "SMOKE_TEST_PASSWORD" in prod_steps_str,
        "deploy-prod: reads SMOKE_TEST_PASSWORD for smoke test",
    )
    ok &= check(
        "frontend-config" in prod_steps_str,
        "deploy-prod: reads FIREBASE_API_KEY from frontend-config ConfigMap",
    )
    ok &= check(
        "smoke-test-secrets" in prod_steps_str,
        "deploy-prod: reads SMOKE_TEST_PASSWORD from smoke-test-secrets Secret",
    )

    return ok


if __name__ == "__main__":
    workflow_path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else ".github/workflows/deploy-pipeline.yaml"
    )
    success = validate(workflow_path)
    print()
    if success:
        print("All checks passed.")
        sys.exit(0)
    else:
        print("Some checks failed.")
        sys.exit(1)
