# Screenshots index

PNGs of every artboard in the design canvas, numbered in canvas order. Each is rendered at its native size (per the size standardization in `../README.md`) then scaled to fit a 920×540 capture box.

## Public problem view
- `01-pub-anon.png` — anon · guest viewer with sign-in CTA
- `02-pub-instr.png` — instructor · generic link prompts for class
- `03-pub-autostart.png` — instructor · section-bound link auto-starts in Period 3
- `04-pub-student.png` — student · Practice CTA
- `05-pub-solution.png` — instructor · solution revealed (problem allows it)

## Session lifecycle — instructor
- `06-sess-private.png` — instructor's private screen, session composer
- `07-sess-fromslide.png` — class-picker modal triggered by ambiguous launch
- `08-sess-live.png` — post-launch confirmation strip with join code

## Session lifecycle — student
- `09-sess-banner.png` — new-problem banner over a passing student
- `10-sess-banner-failing.png` — banner over a stuck/failing student
- `11-sess-overview.png` — section overview, no session live
- `12-sess-overview-live.png` — section overview, live session active

## Practice mode
- `13-prac-idle.png` — practice idle, drawer collapsed
- `14-prac-fail.png` — practice with failing test, failure inspector

## Library
- `15-lib.png` — tag-bar-driven problem library

## Student workspace
- `16-ws-idle.png` — idle, drawer collapsed; ribbon expanded for first read
- `17-ws-running.png` — running tests, output streaming
- `18-ws-allpass.png` — all visible tests passing
- `19-ws-fail-fn.png` — fn failure: call · expected · got
- `20-ws-fail-io.png` — i/o failure: stdin · expected · got
- `21-ws-fail-pytest.png` — pytest failure: assertion traceback
- `22-ws-runtime.png` — runtime exception
- `23-ws-debug.png` — debugging the failing test, locals + scrubber

## Author skin
- `24-ed-solution.png` — solution.py active
- `25-ed-starter.png` — starter.py (what students see at t=0)
- `26-ed-statement-edit.png` — statement.md edit (markdown source)
- `27-ed-statement.png` — statement.md preview, failure detail in drawer
- `28-ed-edit-fn.png` — edit fn test
- `29-ed-edit-io.png` — edit i/o test, whitespace flags
- `30-ed-edit-pytest.png` — edit pytest test
- `31-ed-edit-file.png` — edit file-fixture test
- `32-ed-edit-hidden.png` — edit hidden test

## Instructor focused-student
- `33-instr-justconnected.png` — student just connected
- `34-instr-allpass.png` — student passes all tests
- `35-instr-focused.png` — student stuck, failure in drawer
- `36-instr-debugging.png` — instructor debugging student's failing test

## Instructor full dashboard
- `37-instr-overview.png` — overview, no student selected, minimap on top
- `38-instr.png` — focused on Maya, embedded workspace below minimap

## v4 · App chrome
- `39-v4-instr-home.png` — Instructor home: today feed + classes table + recent activity

## v4 · Classes & sections
- `40-v4-classes-list.png` — classes list, one card per class, live indicator
- `41-v4-class-detail.png` — class detail, sections table + about
- `42-v4-section-overview.png` — section overview (instructor), Problems · Sessions · Students
- `43-v4-student-detail.png` — per-student detail, progress + revisions + flags
- `44-v4-student-sections.png` — student section list, live banner pulls them in

## v4 · Auth & landing
- `45-v4-landing.png` — public landing, single job: type a 6-char code
- `46-v4-signin.png` — three OAuth providers, equal weight
- `47-v4-signin-error.png` — OAuth failed (popup closed/blocked)
- `48-v4-register.png` — student register, OAuth-only
- `49-v4-register-bad.png` — invalid join code, error inline
- `50-v4-invite.png` — instructor invite acceptance
- `51-v4-invite-expired.png` — invitation expired
- `52-v4-invite-mismatch.png` — email mismatch
- `53-v4-join.png` — authenticated student joining a new section

## v4 · Modals & overlays
- `54-v4-modal-start.png` — Start session
- `55-v4-modal-solution.png` — Solution viewer (student)
- `56-v4-modal-replay.png` — Replay revisions
- `57-v4-modal-generate.png` — Generate solution (author, AI)
- `58-v4-modal-confirm.png` — Confirm destructive, type-to-confirm
- `59-v4-modal-publish.png` — Publish
- `60-v4-modal-create.png` — Create class

## v4 · Mobile (read-only)
- `61-v4-mob-public.png` — public problem
- `62-v4-mob-landing.png` — landing
- `63-v4-mob-signin.png` — sign in
- `64-v4-mob-section.png` — section overview (student)

## v4 · Empty, error & loading
- `65-v4-404.png` — 404, link rotted
- `66-v4-403.png` — join code expired
- `67-v4-500.png` — 500, "your work is safe"
- `68-v4-offline.png` — offline mid-session
- `69-v4-empty-section.png` — empty section, four ramps to publish
- `70-v4-empty-library.png` — empty library
- `71-v4-loading.png` — loading dashboard, skeleton shimmer
