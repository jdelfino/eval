# Handoff: Eval — Workspace, Live-Session & Product-Surface Redesign

This bundle is for Claude Code. It contains the **design references** for the redesign of Eval (LMS/code-eval product), as a working HTML/React prototype plus PNG screenshots of every surface. Your job is to recreate these designs in the target codebase (the user's `frontend/` folder) using its existing patterns, components, and conventions — not to ship this HTML.

## How to use this bundle

1. Open `Eval Redesign Tour v4.html` in a browser to see the live prototype with all surfaces laid out on a pan/zoom canvas. Click the expand icon on any artboard to focus it. Use ←/→ to cycle within a section, ↑/↓ across sections.
2. Browse `screenshots/` for static PNGs of every artboard if the prototype isn't loading or you want to grep quickly. Filenames mirror the artboard IDs used in the canvas.
3. Read this README for the system-level decisions, then read the individual JSX files for component-level detail. Each file is small and named after what it builds.

## Fidelity

**High-fidelity.** Final layout, copy, colors, typography, and interactions. Pixel-perfect — recreate in the codebase's existing primitives. If a primitive doesn't exist (e.g. the `MiniMap`, the multi-kind `TestRail`), implement it from the JSX here.

## Canvas size standardization

Every desktop app/web surface is rendered at **1440 × 900** (16:10, default-scaling MacBook 13/14" baseline). Distinct from that:

- **Modals** (`v4-modal-*`): 1100 × 780 — modal proportions, never full-bleed.
- **Auth cards** (`v4-signin`, `v4-register*`, `v4-invite*`): 520 × 5xx–7xx — these are forms, not pages. They sit in the center of the viewport when implemented.
- **Mobile** (`v4-mob-*`): 420 × 820 — phone proportions. Mobile is read-only across the board.

Some surfaces (section overview matrix, public problem with solution) had taller content frames in earlier versions but were compressed to 900 to match the standard. If a screen ends up scrolling on a real 13" MBA at default zoom, that's expected and acceptable — the alternative was inconsistent artboard sizes that misled the implementer about real viewport room.

## The system: one shell, three skins

The single most important idea in v4 is that the **workspace** — editor + test rail + collapsible drawer — is one component (`workspace-shell.jsx`) re-skinned three ways:

- **Student skin**: single editor file (`main.py`), Run/Debug controls, drawer for output / failure detail / locals.
- **Author skin**: `solution.py` / `starter.py` / `statement.md` tabs, editable test rail (clicking a row opens a kind-aware editor in the drawer), Publish button.
- **Instructor skin**: read-only over a student's live editor + test results, "Take over" affordance, embeds inside the dashboard's center column.

Build the shell first. Skins are styling + which-buttons-show; same DOM.

## Sections in canvas order

### Public problem view — `01–05`
Static, shareable URL for any problem. One page, three personas (anon / instructor / student). Two link variants: a generic link prompts the instructor to pick a class; a section-bound link auto-starts the session.

### Session lifecycle, instructor side — `06–08`
A "session" = one problem opened live for one class. Session control **always** routes through the instructor's private screen (`sess-private`); if the entry point didn't already specify a class, modal asks (`sess-fromslide`). Post-launch confirmation strip with join code, projector cast option (`sess-live`).

### Session lifecycle, student side — `09–12`
When the instructor moves on, every connected student gets a banner with a one-key jump and a "Stay here" escape — important when they're mid-failure (`sess-banner-failing`). Between sessions, students see their section overview: published problems for solo practice + past sessions to review.

### Practice mode — `13–14`
Same workspace shell, no class attached. Drops the "connected" chip; adds a dashed "practice · solo" chip. Breadcrumb routes through Library, not a class.

### Library — `15`
Tag bar drives filtering. Row chips reflect active tags. **Difficulty was dropped** — tags only.

### Student workspace — `16–23`
Eight states of the same shell:
- idle, running, all-pass, fn-failure, i/o-failure, pytest-failure, runtime-error, debug (locals + scrubber)

The drawer is one component that swaps content based on state. Failure detail is kind-specific (fn shows `call · expected · got`; i/o shows `stdin · expected stdout · got`; pytest shows the assertion traceback).

### Author skin — `24–32`
Same shell with editable test rail. Nine views:
- solution / starter / statement edit / statement preview
- edit fn / i/o / pytest / file-fixture / hidden test (each opens kind-aware editor in drawer)

### Instructor focused-student — `33–36`
The workspace shell, instructor-skinned, full-bleed. Same four shapes as the student states. In practice these embed inside the dashboard (next section).

### Instructor full dashboard — `37–38`
Roster (left) + minimap (top) + focused workspace (below). Click a student in either roster or minimap and their workspace embeds inline. Never leaves the dashboard.

### v4 app chrome — `39`
Persistent left sidebar: logomark + namespace switcher + nav + active-session card + user. Top bar is just a breadcrumb. Sidebar can be collapsed; toggle live via the Tweaks panel in the canvas. The `AppShell` wrapper is in `v4-shell.jsx`.

### v4 classes & sections — `40–44`
A class is the long-running container. Sections are the meeting times that share its problem set. Section overview keeps **Problems / Sessions / Students** tabs (matches today's app). Per-student detail with progress, revisions, flags. Student-facing section list with live banner pull-in.

### v4 auth & landing — `45–53`
Minimal sign-in gate. Volume hierarchy:
1. Returning authed student → auto-redirect, never sees landing
2. **Primary path**: first-time student with a code → 6-char code entry, the only thing on the page
3. Returning unauthed student → "Sign in →" link below the code card

OAuth-only with three equal-weight providers (Google · GitHub · Microsoft). Email/password is intentionally hidden behind a footer link. Instructor entry is via emailed invitation only.

### v4 modals — `54–60`
Seven flows dense enough for a real modal: Start session, Solution viewer (student opens reference, with `code / notes / diff vs. their last revision` tabs), Replay (instructor walks revisions), Generate Solution (AI), Confirm destructive (type-to-confirm join code), Publish, Create class.

### v4 mobile — `61–64`
Read-only across the board. Public problem view, landing, sign-in, student section overview. Mobile is a pass-through; real work is on a laptop. Every mobile surface has an "Open on laptop" affordance.

### v4 empty / error / loading — `65–71`
404, 403 (join code expired), 500, mid-session offline ("what still works"), empty section (four ramps to publish), empty library, dashboard skeleton.

Mid-session errors keep the workspace shell so the student doesn't lose orientation.

## Decisions already locked

- **Solved** = all tests pass (visible + hidden) on the most recent run. Surfaced consistently in dashboard, section matrix, student detail.
- **Difficulty**: dropped. Library uses tags only.
- **Section overview tabs**: stay as Problems / Sessions / Students.
- **Auth personality**: minimal gate. Real product lives behind the door.
- **Sidebar default**: expanded.
- **Hit targets** on mobile: ≥ 44px.

## Still open — flag if you need an answer

- Sidebar's "active session" indicator assumes one live session per instructor at a time.
- Join code format is shown as `K7M-2A9` (3-char-3-char). Confirm format and length.
- Mobile authoring/running: out of scope. If product wants it, separate spec.
- Solution Viewer's `Notes` tab assumes the author wrote prose. If notes aren't supported, the tab disappears.
- Empty-section's four ramps assume starter packs + shared-namespace sharing exist.
- Generate Solution assumes an LLM endpoint exists in the app.

## Recommended implementation order

1. **Workspace shell** (`workspace-shell.jsx`) — every workspace surface depends on it. Get the three skins switching via prop before anything else.
2. **App chrome** (`v4-shell.jsx`) — sidebar + breadcrumb + content area. Once this lands, every v4 page is just a child route.
3. **Auth surfaces** (`v4-auth.jsx`) — unblock the demo.
4. **Instructor home + classes + sections** (`v4-instructor.jsx`) — reuses today's tab structure; layout/skin pass on existing routes.
5. **Live dashboard** — roster + minimap + embedded workspace. The minimap is the meatiest new component.
6. **Modals** (`v4-modals.jsx`) — independently shippable.
7. **Mobile + empty/error** — polish.

## File map

| File | Contents |
|---|---|
| `Eval Redesign Tour v4.html` | The canvas. Open this first. Tweaks panel (top-right toolbar) gates global sidebar collapse. |
| `design-canvas.jsx` | The canvas component itself (pan/zoom + sections + artboards + focus mode). Don't port this — it's the presentation harness, not part of Eval. |
| `tokens.js` | Color, type, spacing tokens. Treat as the source of truth for design values. |
| `primitives.jsx` | Workspace-era primitives: `Chip`, `Btn`, `Tag`, `KBd`, code blocks, etc. |
| `primitives-v4.jsx` | App-chrome primitives: `Sidebar`, `AppBarLite`, `Modal`, `Toast`, `Banner`, `ConnectionDot`, `EmptyFrame`, `Skeleton`, `Tabs`, `Field`, `Input`, `MobileFrame`, `IconBtn`, `Icon` (line glyphs), `CodeBlock`. |
| `workspace-*.jsx` | The one workspace shell (`workspace-shell.jsx`) + its editor (`workspace-editor.jsx`), test rail (`workspace-test-rail.jsx`), drawer (`workspace-drawer.jsx`), and the data fixtures + three skin artboards. |
| `artboards-sessions.jsx` | Session lifecycle artboards (sess-* IDs). |
| `instructor-*.jsx` | Live dashboard parts: roster, minimap, focused-center, signal cards, shell. |
| `library-*.jsx` | Library parts: tag bar, toolbar, row, table, shell. |
| `v4-shell.jsx` | `AppShell` (sidebar + AppBarLite + content). Instructor and student nav presets live here. |
| `v4-instructor.jsx` | D · Instructor home, G · Classes list + class detail, E · Section overview, F · Per-student detail, H · Student section list. |
| `v4-auth.jsx` | I · Landing, J · Sign in, K · Register (student via join code), L · Invite accept (instructor), M · Section join. |
| `v4-modals.jsx` | N–T modals. |
| `v4-mobile.jsx` | U/V/W/X mobile surfaces. |
| `v4-empty-error.jsx` | Y/Z/AA/AB/AC/AD/AE states. |
| `tweaks-panel.jsx` | The Tweaks panel framework (presentation only — don't port). |
| `screenshots/` | One PNG per artboard, numbered in canvas order. See `screenshots/INDEX.md`. |

## Screenshots

71 PNGs in `screenshots/`, numbered in canvas order. Each is rendered at native size (per the standardization above) then scaled to fit a 920×540 capture box — so the aspect ratio reflects the artboard, but the visual size is consistent across the index. See `screenshots/INDEX.md` for the full list with one-line descriptions.

## What "recreate in the codebase" means

The bundled HTML is a **design reference**, not a code starting point. The user's `frontend/` folder is the codebase to land this in. Specifically:

- Use the codebase's existing component library, design tokens, and routing conventions.
- If the codebase uses a different CSS approach (CSS-in-JS, Tailwind, CSS modules), map `tokens.js` values to the codebase's idiom — don't introduce a parallel system.
- The JSX here uses inline styles. That's a side-effect of building in a single-file HTML harness; production code should follow whatever the codebase uses.
- Don't copy the design-canvas chrome (`design-canvas.jsx`, `tweaks-panel.jsx`) — those exist only to lay out the artboards for review.
- The `window.Foo = …` global-attachment pattern at the bottom of each JSX is also presentation-only — modules should export normally.
