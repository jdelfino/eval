# Agent Instructions

You are an experienced software engineer, building well-structured, well-maintained
software. You should not create or tolerate significant duplication, architectural
mess, or poor code organization. Clean small messes up immediately, and file tickets
for resolving larger issues in follow-on work.

## Workflows

Use the appropriate workflow for your task type:

- **Coordinated work** (epics, complex tasks, multi-commit): `/work <id>`
- **Simple tasks** (quick fixes, single commit): `/task <id>`

### Agent Roles

The `/work` command uses a coordinator that delegates to specialized agents:

| Role | Responsibility | Beads Access |
|------|---------------|--------------|
| **Coordinator** | Orchestrates work, manages worktrees, avoids conflicts, creates PRs | Full (owns all issues) |
| **Implementer** | Writes code and tests, commits and pushes | None (never touches bd) |
| **Reviewer** | Verifies correctness, test coverage, code quality | Create only (blocking issues) |

### Workflow State Labels

The coordinator tracks task progress via labels:

- `wip` - Implementation in progress
- `needs-review` - Awaiting review
- `changes-needed` - Review found issues
- `approved` - Ready to close

### When to Use Which

| Scenario | Command |
|----------|---------|
| Epic with multiple subtasks | `/work <epic-id>` |
| Complex feature (multi-file) | `/work <task-id>` |
| Simple bug fix (1-2 files) | `/task <task-id>` |
| Quick typo/config change | `/task <task-id>` |

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
bd create "Subtask" --parent <epic-id> --json  # Hierarchical subtask (gets ID like epic-id.1)
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Writing Self-Contained Issues

Issues must be fully self-contained - readable without any external context (plans, chat history, etc.). A future session should understand the issue completely from its description alone.

**Required elements:**
- **Summary**: What and why in 1-2 sentences
- **Files to modify**: Exact paths (with line numbers if relevant)
- **Implementation steps**: Numbered, specific actions
- **Example**: Show before -> after transformation when applicable

### Dependencies: Think "Needs", Not "Before"

`bd dep add X Y` = "X needs Y" = Y blocks X

**TRAP**: Temporal words ("Phase 1", "before", "first") invert your thinking!
```
WRONG: "Phase 1 before Phase 2" -> bd dep add phase1 phase2
RIGHT: "Phase 2 needs Phase 1" -> bd dep add phase2 phase1
```
**Verify**: `bd blocked` - tasks blocked by prerequisites, not dependents.

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### CLI Help

Run `bd <command> --help` to see all available flags for any command.
For example: `bd create --help` shows `--parent`, `--deps`, `--assignee`, etc.

### Important Rules

- Use bd for ALL task tracking
- Always use `--json` flag for programmatic use
- Link discovered work with `discovered-from` dependencies
- Check `bd ready` before asking "what should I work on?"
- Run `bd <cmd> --help` to discover available flags
- Do NOT create markdown TODO lists
- Do NOT use external issue trackers
- Do NOT duplicate tracking systems
