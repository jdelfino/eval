# Direct Task Implementation

Work on task **$ARGUMENTS** directly (without coordinator/subagent overhead).

Use this for simple, isolated tasks. For complex work or epics, use `/work` instead.

1. Fetch task details: `bd show $ARGUMENTS --json`
2. Follow the task-completer skill instructions below

---

@.claude/skills/task-completer/SKILL.md
