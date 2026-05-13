# `redesign` branch — operational runbook

Long-lived branch carrying the Claude Design v3 visual + structural redesign of Eval (epic `eval-cej` — see [`design/REDESIGN_PLAN.md`](design/REDESIGN_PLAN.md)). Per decision D6, the redesign lands to `main` as a single cutover PR after G1–G5 + epic-level acceptance tests pass on staging.

This document is the operational source of truth for working on that branch.

## Purpose

- Carry visual epics G1–G5 in isolation from `main` until cutover.
- Lift the redesign to staging on demand, for visual review.
- Cut over to `main` as a single PR once acceptance tests pass.

Foundation work (F1 tokens, F2 pytest, F4 itself) splits along these lines:

| Category | Lands on | Reason |
|----------|----------|--------|
| Visual foundation (F1 — CSS-variable tokens) | `redesign` | No consumer on `main` until cutover. Lands directly here to avoid dual-namespace coexistence work. |
| Backend foundation (F2 — pytest backend + service layer) | `main` | Independent of visuals. Adds capability used by `redesign` once it pulls main. |
| Operational foundation (F4 — this doc) | `main` | Runbook needs to be findable from `main`. |

## How to push

```bash
git push origin redesign
```

CI runs unit + integration tests on every push to `redesign` (per `.github/workflows/ci.yml`). **No staging deploy fires automatically.** The prod deploy pipeline (`.github/workflows/deploy-pipeline.yaml`) is gated on `branches: [main]`, so `redesign` cannot accidentally deploy anywhere.

## How to manually deploy to staging

`deploy-pr-staging.yaml` resolves a **PR number** to a head SHA via `gh pr view`. There is no `--ref redesign` form. The pattern is: keep a **long-lived draft PR** from `redesign` → `main` open as the deploy target, and trigger the workflow with that PR's number whenever a staging refresh is needed.

The deploy target PR is **GitHub PR #266** (`chore(redesign): staging deploy target for redesign branch`). Keep it open and in draft. Do not merge it — the cutover is a separate PR per D6.

### Refresh staging from `redesign` HEAD

```bash
# Make sure the redesign branch on origin matches your local HEAD first.
git push origin redesign

# Trigger the staging deploy against the draft PR (replace 266 if the PR is reopened).
gh workflow run deploy-pr-staging.yaml -f pr=266
```

**Auth note:** `workflow_dispatch` requires `actions: write`. The GitHub App token used by Claude Code sessions in this repo does not have that permission, so a Claude session cannot fire the deploy itself — a human user has to run `gh workflow run`. Claude can still monitor (`gh run watch`) and validate the staging surface once it's up.

What this does (full details in `.github/workflows/deploy-pr-staging.yaml`):

1. Resolves PR #266's head SHA — i.e. `redesign` HEAD on origin.
2. Builds + pushes `go-api`, `executor`, `frontend` images tagged with that SHA.
3. **Resets the staging database** (`DROP SCHEMA public CASCADE`) and reapplies migrations on go-api startup.
4. Rolls out the new images to the `staging` namespace in the prod GKE cluster.
5. Runs `scripts/seed-staging.sh` to repopulate test fixtures.
6. Comments on the PR with the staging URL.

**Staging URL:** https://staging.eval.delquillan.com

**Concurrency:** the workflow has `concurrency: deploy-pr-staging, cancel-in-progress: true`. A new staging deploy from `redesign` will cancel any in-flight PR-staging deploy from a different PR. Don't fire it during a `main`-PR review unless you're coordinating.

### Fallback paths (use only if the draft-PR path is broken)

- **Fallback A — temporarily merge `redesign` → `main` for a staging refresh, then revert.** Risky: `deploy-pipeline.yaml` auto-deploys `main` to **prod**, so this also ships the redesign to prod for the duration. Only use if prod is intentionally paused and you've verified the deploy-pipeline run is stopped.
- **Fallback B — local `kubectl apply` from a redesign build.** Bypasses CI entirely. Last resort.

## Rebase cadence

Rebase `redesign` onto `main` **weekly (Monday)**, or sooner if a foundation PR lands that touches files heavily modified on `redesign`.

```bash
git checkout redesign
git fetch origin
git rebase origin/main
git push --force-with-lease origin redesign
```

If the rebase produces conflicts, resolve them on `redesign` rather than rewriting `main`. Force-push uses `--force-with-lease` to avoid clobbering anyone else's push.

## Branch hygiene

- **Foundation PRs that touch files heavily modified on `redesign`** (e.g. `CodeEditor.tsx`, anything under `frontend/src/components/workspace/`): leave a comment on the relevant G-epic issue before merging. The G-epic owner should pause touches on those files until the foundation PR lands and `redesign` is rebased.
- **Do not auto-deploy on push to `redesign`.** If a workflow is ever added that triggers on `push: branches: [redesign]`, audit it for staging-deploy side effects first.
- **No Terraform changes on `redesign`.** Staging reuses the prod stack (`infrastructure/terraform/environments/prod/main.tf`); there is no parallel staging environment to configure. `git diff main..redesign -- infrastructure/` should always be empty until cutover.

## Cutover (future — not yet)

Cutover lands the redesign on `main` as a single PR — `redesign` → `main`, **not the draft deploy-target PR**. The deploy-target PR stays draft; open a new PR for cutover. See D6 in the epic for the gating criteria (G1–G5 done, AT #1–6 passing on staging).

## Last verified

The full procedure (push `redesign`, fire `deploy-pr-staging.yaml -f pr=266`, monitor with `gh run watch`, smoke-check `https://staging.eval.delquillan.com`) was exercised end-to-end on **2026-05-13** against `redesign` HEAD `3c5ccd6` (empty init commit on top of main `7aa6727`). Anonymous smoke covered homepage, `/auth/signin`, `/auth/signin/email`, `/register/student` — all 200, real Eval UI rendered. Auth-flow validation was not performed (requires `E2E_PASSWORD` GitHub secret).
