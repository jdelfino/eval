# Upstream Sync Point

This file tracks which coding-tool commits have been ported to eval.

## Last Synced

- **Commit:** `78067cb`
- **Date:** 2026-02-11
- **Repository:** coding-tool (private upstream)

## What Was Ported

| Eval Issue | coding-tool Commit(s) | Description |
|---|---|---|
| PLAT-gzp | cc27abb | Add outputCollapsible prop to CodeEditor |
| PLAT-65a | cc27abb | Editor gutter refinements (lineNumbersMinChars, lineDecorationsWidth) |
| PLAT-k7y | cc27abb | Projector view: remove header, show join code in header slot |
| PLAT-mpe | cc27abb | Add distinct green favicon for projector route group |
| PLAT-2ru | dbaf12a | Add practice mode for completed sessions |
| PLAT-dmm | 78067cb | Port session-lifecycle E2E test |

## How to Use

When porting new changes from coding-tool, start from the commit after `78067cb`:

```bash
cd /workspaces/coding-tool
git log --oneline 78067cb..HEAD
```

Create new beads issues for each change to port, referencing the coding-tool commit.
