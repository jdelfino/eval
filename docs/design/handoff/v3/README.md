# Handoff: Eval — Workspace & Live-Session Redesign (v3)

> **Provenance.** This is the Claude Design v3 handoff bundle for the Eval redesign (beads epic `eval-cej`). It was delivered as a zip and landed in the repo by `eval-cej.19` so implementer agents can reach `tokens.js`, the JSX prototypes, and screenshots from beads issue descriptions alone. Open `Eval Redesign Tour.html` for the design canvas walk.

## Overview

This handoff covers a full UI revamp of **Eval** — a classroom coding tool where instructors author programming problems, run them live with a class, and watch students work in real time. The redesign unifies what were previously several disjoint screens into **one workspace shell with three skins** (student, author, instructor) plus a small set of supporting screens (public problem view, library, section overview, session lifecycle).

The core thesis of the redesign:

1. **One shell, three skins.** Student, author, and instructor all see the same `ribbon · editor · test-rail · drawer` four-region layout. Only the chrome and affordances differ. This collapses three codebases into one.
2. **Tests are first-class everywhere.** The right-hand test rail is the same primitive in all three skins; in the author skin it becomes editable; in the instructor skin its rows show per-student verdicts.
3. **Sessions are explicit.** A "session" = one problem opened live for one class for one stretch of time. The redesign gives sessions a clear start, a clear end, and a clear public artifact (the join code, the cast view, the post-mortem).
4. **Tags drive the library.** The problem library is tag-filtered first, table second.

## About the Design Files

**The files in this bundle are design references created in HTML — prototypes showing intended look and behavior, not production code to copy directly.** The HTML/JSX uses inline-Babel React, fake data, and design-canvas wrappers so multiple screen states sit side-by-side for review.

**The task is to recreate these designs in Eval's existing codebase**, using its established framework, component library, routing, state management, and data fetching patterns. Lift the visual language, layout structure, interaction model, and copy from these mocks — but implement them idiomatically in the target stack. If the codebase has an existing design system, prefer its primitives over recreating the ones in `primitives.jsx`.

If there are mismatches between what these mocks assume and how the real app actually works (and the user has flagged that there are some), **do a rigorous review pass first**: read the existing app's models, routes, and components; flag every assumption in this design that breaks against reality; and surface those before implementing. Examples of likely friction points:

- The session model in these mocks assumes a clear "one problem, one class, one stretch of time" boundary. The real app may multiplex differently.
- Practice mode in these mocks intentionally does **not** track attempts. Confirm whether the real app already persists student progress on practice — if so, the mocks need to grow that surface.
- The public link in these mocks supports two variants (`/p/two-sum` and `/p/two-sum?launch=cs101-p3`). Confirm routing.
- The student "Section overview" screen shown here may overlap with existing dashboard surfaces — reconcile.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, density, copy, icons-as-glyphs, and interaction states are intentional. Hex/oklch values, type scale, radii, and shadows are defined as design tokens in `tokens.js` and applied as CSS variables — see [Design Tokens](#design-tokens). Recreate pixel-perfectly within the target codebase's conventions.

Note: SVG icons in these mocks are stand-ins (single-character glyphs in some places, simple `<svg>` paths in others). Use the target codebase's icon set (lucide, phosphor, custom, whatever Eval already uses) and pick semantically equivalent icons.

## Sections in the design canvas

Open `Eval Redesign Tour.html` to walk the canvas. Sections, in order:

1. **Public problem view** — anon, instructor, and student personas viewing the same shareable URL. Two link variants (generic + section-bound auto-launch).
2. **Session lifecycle — instructor side** — instructor's private composer, the class-picker modal triggered by an ambiguous launch URL, post-launch confirmation strip with join code + cast button.
3. **Session lifecycle — student side** — new-problem banner overlaid on a passing student and on a failing student; student section overview (home for a class section).
4. **Student practicing solo** — same workspace shell, no session attached. Practice chip replaces Connected pill.
5. **Problem library** — tag-bar-driven filtering, table view.
6. **Student workspace** — idle, running, all-pass, single-fail, exception, and a few other states.
7. **Problem editor (author)** — solution / starter / statement tabs; editable test rail; test-body editor.
8. **Instructor focused-student** — full-screen view of one student's workspace from the instructor's POV.
9. **Instructor live session** — full dashboard with roster, minimap, and focused panel.

## Screens & Views

For each screen, the source-of-truth artboard component is named after `window.<ComponentName>` references inside `Eval Redesign Tour.html`. Find the component in the `.jsx` files and read its layout and copy directly.

### 1. Public problem view (`PublicProblemAnon`, `PublicProblemInstructor`, `PublicProblemStudent`)

- **Purpose**: shareable link to a problem. Same content for everyone; CTAs flip per persona.
- **Layout**: centered single-column, ~720px content width, problem statement → tags → visible test cases → CTA strip pinned bottom.
- **CTAs**:
  - Anon → "Sign in to attempt" (primary) + "Try as guest" (quiet).
  - Instructor → "Launch with a class" (primary) + "Open in editor" (quiet).
  - Student → "Practice solo" (primary) + "Wait for live session" (quiet) when no session is live; "Jump into live session" (accent) when one is.
- **Reveal-solution toggle**: shown only when the problem is configured to allow it.
- **Two URL variants**: `/p/<slug>` (generic; instructor sees a class-picker on launch) and `/p/<slug>?launch=<section-id>` (auto-launches into that section, no picker).

### 2. Session lifecycle — instructor (`InstrPrivateBeforeStart`, `InstrClassPicker`, `InstrPostLaunchConfirm`)

- **Private screen**: the instructor's pre-session view of a problem they're about to launch. Right rail is a session composer: pick class → pick problem (defaults to current) → optional time limit → "Launch session" primary button.
- **Class-picker modal**: triggered when the instructor arrives via a generic public link with no `?launch=` param. Lists their sections; recent first; keyboard-navigable.
- **Post-launch confirmation strip**: full-width banner above the workspace, shows join code (large, mono, copyable), section name, time started, "Cast to projector" button, "End session" quiet button.

### 3. Session lifecycle — student (`StudentNewProblemBanner`, `StudentBannerWhileFailing`, `StudentSectionOverview`)

- **New-problem banner**: appears as an overlay on the student's existing workspace when the instructor moves to a new problem. Two variants designed:
  - Over an all-passing student (`StudentNewProblemBanner` wrapping `ArtStudentAllPass`) — common case, student was just done.
  - Over a stuck/failing student (`StudentBannerWhileFailing` wrapping `ArtStudentFailFn`) — "Stay here" matters more.
- **Banner contents**: small ▶ glyph, "Instructor moved on — <new problem>", subtext "New problem just opened for <section>. Your current code on <prev problem> will be saved.", `Stay here` (quiet) and `Jump in` (accent, ⏎ kbd) buttons.
- **Section overview**: student's home for one section. Live banner up top (idle / live-now states), then a list of published problems (state chip · name · tags · last-seen · test count · Practice → CTA), then a past-sessions table (date · problem · duration · result · Replay →).

### 4. Practice mode (`StudentPracticeIdle`, `StudentPracticeFailing`)

- Same workspace shell as a live session.
- Header: dashed `practice · solo` chip instead of the `Connected` pill.
- Breadcrumb routed through Library, not a section.
- One failing-test variant included to confirm the failure inspector works the same.
- **Does not track attempts in these mocks** — confirm desired behavior with the team.

### 5. Library (`ProblemLibrary`)

- Top tag bar (multi-select chips) drives a table below.
- Row chips reflect active tags.
- Columns: name · tags · # tests · last edited · author · row actions (Open, Launch, Duplicate).

### 6. Student workspace (`ArtStudent*` in `workspace-artboards-student.jsx`)

Four-region layout:
- **Ribbon** (top): breadcrumb, problem title, session pill, density toggle.
- **Editor** (center-left): single file (`main.py`); tabs only if multi-file.
- **Test rail** (right, ~360px wide): list of tests with run/debug controls, pass/fail/pending state.
- **Drawer** (bottom, collapsible): output / stdout / failure inspector. Collapses to a single status line when idle.

States designed: idle, running, all-pass, single-fail (with inspector open showing expected vs. actual diff), exception, drawer-collapsed-while-passing.

### 7. Author skin (`ArtAuthor*` in `workspace-artboards-author.jsx`)

Same shell. Editor gains tabs: `solution.py`, `starter.py`, `statement.md`. Test rail rows become editable; clicking "Edit body" on a test row opens the test-body editor inline in the drawer area. New-test row at the bottom of the rail.

### 8. Instructor focused-student (`ArtInstructor*` in `workspace-artboards-instructor.jsx`)

Same shell, scoped to one student. Header shows the focused student's name + status. Test rail rows show this student's verdicts. Drawer can show live stdout from their last run. This view is **embedded** inside the full instructor dashboard (next section), but is also designed at full size for clarity.

### 9. Instructor live session (`InstructorLive*` in `instructor-*.jsx`)

Full dashboard:
- **Roster** (left rail): list of connected students with quick status glyphs.
- **Minimap** (top): grid of all students' code or test status at a glance; click any tile to focus.
- **Focused panel** (center): the focused-student workspace from §8 embedded.
- **Signals strip**: aggregate stats (n connected, n passing, median test progress, etc.).

## Interactions & Behavior

- **Session start**: instructor opens a problem → "Launch with a class" → picks section → server creates session, returns join code → confirmation strip mounts above workspace → connected students get a real-time push.
- **Session end**: instructor clicks "End session" → confirmation modal → server marks session complete → all students get a "session ended" banner with a "Review your work" CTA → session appears in the section's past-sessions table.
- **New problem mid-session**: instructor navigates to a different problem while session is live → banner pushes to all connected students.
- **Student "Jump in"**: pressed Enter or clicked → student's workspace navigates to the new problem; their code on the previous problem is auto-saved.
- **Student "Stay here"**: dismisses banner; student keeps working on the previous problem; can rejoin from the section overview.
- **Test row click** (student): focuses the test, scrolls the editor to the relevant context if applicable, opens drawer to that test's last output.
- **Test row click** (instructor): scopes the focused panel to show that test's verdict for the currently-focused student.
- **Minimap tile click** (instructor): swaps the focused student.

## State Management

- **Session**: `{ id, sectionId, problemId, joinCode, startedAt, endedAt, castUrl, allowSolutionReveal }`
- **Connection**: `{ studentId, sessionId, status: connected|disconnected|away, lastSeenAt }`
- **Attempt** (in-session): `{ studentId, sessionId, problemId, code, lastRunAt, testResults: [{testId, state: pass|fail|pending|exception, durationMs, output}] }`
- **PracticeAttempt**: confirm whether the real app persists this; mocks don't.
- Real-time: connected students need push for new-problem, session-end, instructor-cast events. Likely WebSocket or server-sent events; use whatever Eval already uses.

## Design Tokens

All tokens defined in `tokens.js` under `window.EvalTokens.workshop`. Applied as CSS variables via `applyEvalTokens(el, 'workshop')`. Highlights:

| Token | Value |
|---|---|
| `--bg` | `oklch(0.985 0.005 80)` (paper) |
| `--bg-raised` | `oklch(0.998 0.003 80)` |
| `--bg-sunken` | `oklch(0.965 0.008 80)` |
| `--bg-inverse` | `oklch(0.18 0.012 80)` (editor) |
| `--fg` | `oklch(0.20 0.012 80)` |
| `--fg-muted` | `oklch(0.46 0.010 80)` |
| `--accent` | `oklch(0.58 0.14 55)` (deep amber) |
| `--run` | `oklch(0.62 0.16 145)` (signal green) |
| `--danger` | `oklch(0.56 0.19 25)` |
| `--info` | `oklch(0.56 0.13 245)` |
| `--warn` | `oklch(0.68 0.14 85)` |
| `--radius` | `6px` |
| `--radius-lg` | `10px` |
| `--font-sans` | IBM Plex Sans |
| `--font-mono` | JetBrains Mono |
| `--font-serif` | IBM Plex Serif (used for section titles) |

Density: rows are 32px (compact) / 40px (comfortable). Spacing scale is loose but consistent: 4 / 6 / 8 / 12 / 14 / 18 / 22 / 36px.

## Files in this bundle

- `Eval Redesign Tour.html` — the design canvas; open this first.
- `screenshots/` — PNG of every artboard, numbered to match the section ordering above. See `screenshots/INDEX.md` for the full list.
- `tokens.js` — design tokens.
- `primitives.jsx` — buttons, pills, kbd, modal, etc. (`SBtn`, `SPill`, …). Recreate using the target codebase's primitives.
- `workspace-shell.jsx` + `workspace-editor.jsx` + `workspace-test-rail.jsx` + `workspace-drawer.jsx` — the four regions of the unified shell.
- `workspace-artboards-{student,author,instructor}.jsx` — per-skin states.
- `artboards-sessions.jsx` — public link, session lifecycle, practice, section overview.
- `library-*.jsx` — problem library.
- `instructor-*.jsx` — full instructor dashboard.
- `design-canvas.jsx`, `tweaks-panel.jsx` — design-canvas chrome only; do not port.

## Recommended next steps for the implementer

1. Read the existing Eval codebase's models, routes, and component library before touching the mocks.
2. Build a **mismatch doc** comparing assumptions in these designs to the real app — surface every gap to the team before coding.
3. Start with `tokens.js` → CSS variables in the real app. Land them as a feature flag if needed.
4. Build the unified workspace shell (4 regions) once. Then layer the three skins on top.
5. Build the session lifecycle screens last — they touch the most server-side surface area.
