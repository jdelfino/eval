/* ==============================================================
   Eval Workspace — UNIFIED SHELL.

   One layout, three skins. Same shell:

   ┌─ AppBar ─────────────────────────────────────────────────┐
   │ Statement ribbon (collapsible peek; ⌘1 to expand) ───────│
   ├──────────────────────────────────┬───────────────────────┤
   │             EDITOR               │      RIGHT RAIL       │
   │      (one or more file tabs;     │   (test list — same   │
   │       same dark monaco-ish       │    component for all  │
   │       surface in all skins)      │    three skins)       │
   ├──────────────────────────────────┴───────────────────────┤
   │ DRAWER — output / failure detail / debug (content swaps) │
   └──────────────────────────────────────────────────────────┘

   Skins differ only in:
     - what file tabs the editor shows + whether they are editable
     - what the right-rail rows allow (run, debug, edit, view-only)
     - which drawer modes are reachable

   Keep the surface identical. Behaviour varies by `skin` prop.
   ============================================================== */

const { ScreenShell: WSShell, AppBar: WSAppBar, Btn: WSBtn, Pill: WSPill, Kbd: WSKbd } = window.EvalUI;

/* ---------- Shared sample data: tests + statement ---------- */

const STATEMENT_MD = `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers such that they add up to \`target\`.

You may assume each input has exactly one solution and you may not use the same element twice.

**Example**

    two_sum([2, 7, 11, 15], 9)  →  [0, 1]
    two_sum([3, 2, 4], 6)       →  [1, 2]
    two_sum([3, 3], 6)          →  [0, 1]

**Constraints** — \`2 ≤ len(nums) ≤ 10⁴\`, O(n) expected.`;

const SAMPLE_TESTS = [
  { id:"t1", kind:"fn",     name:"basic",         visible:true,  state:"pass", t:"0.4ms",
    fn:{ call:"two_sum([2, 7, 11, 15], 9)", expected:"[0, 1]", got:"[0, 1]" } },
  { id:"t2", kind:"fn",     name:"middle hit",    visible:true,  state:"pass", t:"0.5ms",
    fn:{ call:"two_sum([3, 2, 4], 6)",      expected:"[1, 2]", got:"[1, 2]" } },
  { id:"t3", kind:"fn",     name:"duplicate",     visible:true,  state:"fail", t:"0.5ms",
    fn:{ call:"two_sum([3, 3], 6)",         expected:"[0, 1]", got:"[0, 0]" } },
  { id:"t4", kind:"io",     name:"console mode",  visible:true,  state:"pass", t:"3ms",
    io:{ stdin:"5 3 7\n10", expected:"0 2\n", got:"0 2\n" } },
  { id:"t5", kind:"pytest", name:"symmetry",      visible:true,  state:"pass", t:"1.2ms", seed: 7,
    pytest:{ target:"tests/test_two_sum.py::test_symmetry", trace:null } },
  { id:"t6", kind:"file",   name:"large fixture", visible:false, state:"idle", t:"—",
    file:{ stdinFile:"fixtures/large_in.txt", expectedFile:"fixtures/large_out.txt" } },
  { id:"t7", kind:"fn",     name:"adversarial",   visible:false, state:"idle", t:"—", seed: 4242,
    fn:{ call:"two_sum(rng_array(n=10_000), 17)", expected:"sum_at(result) == 17", got:null } },
];

const KIND_TONE = { fn:"neutral", io:"info", pytest:"accent", file:"warn" };
const KIND_LABEL = { fn:"fn", io:"i/o", pytest:"pytest", file:"files" };

window.WS = {
  STATEMENT_MD,
  SAMPLE_TESTS,
  KIND_TONE,
  KIND_LABEL,
};
