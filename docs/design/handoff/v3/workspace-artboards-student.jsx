/* Workspace artboards — additional states.

   Student:    running, all-pass, fn-fail, io-fail, pytest-fail, runtime-error
   Author:     starter, statement-edit, kind-edit (fn/io/pytest/file/hidden)
   Instructor: all-pass, debugging, just-connected
*/

const { Btn: A2Btn, Pill: A2Pill, Kbd: A2Kbd } = window.EvalUI;

const STUDENT_LINES_2 = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

const STUDENT_LINES_BUGGY = [
  "def two_sum(nums, target):",
  "  for i in range(len(nums)):",
  "    for j in range(len(nums)):",      // j should start at i+1
  "      if nums[i] + nums[j] == target:",
  "        return [i, j]",
  "  return []",
];

const STUDENT_LINES_RAISES = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if targt - n in seen:",            // typo
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

const STARTER_LINES_2 = [
  "def two_sum(nums, target):",
  "  # TODO: return the indices of the two numbers",
  "  # such that they add up to target.",
  "  pass",
];

/* ============================================================
   STUDENT — additional states
   ============================================================ */

function ArtStudentRunning() {
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="info" dot>Connected</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_2, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="running…"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible).map((t, i) => ({
        ...t,
        state: i < 2 ? "pass" : i === 2 ? "running" : "idle",
        t: i < 2 ? t.t : "—",
      }))}
      activeTestId="t3"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="running 3 of 5 · 2 passed"
      isRunningAll
      onRunAll={() => {}}
      drawerMode="output"
      drawerOutput={{
        status: "running",
        summary: "running tests…",
        lines: [
          { stream:"out", text:"$ pytest -q tests/" },
          { stream:"out", text:"tests/test_two_sum.py::basic        PASSED  [0.4ms]" },
          { stream:"out", text:"tests/test_two_sum.py::middle_hit   PASSED  [0.5ms]" },
          { stream:"out", text:"tests/test_two_sum.py::duplicate    ..." },
        ],
      }}
      onToggleDrawer={() => {}}
    />
  );
}

function ArtStudentAllPass() {
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="run" dot>All passing</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_2, dark:true }]}
      activeTabId="main"
      editorFootnote="main.py · ready to submit"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible).map(t => ({ ...t, state:"pass" }))}
      activeTestId="t1"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="5 / 5 passing · 5.4ms total"
      onRunAll={() => {}}
      drawerMode="output"
      drawerOutput={{
        status: "pass",
        summary: "5 passed in 5.4ms",
        lines: [
          { stream:"out", text:"$ pytest -q tests/" },
          { stream:"out", text:"basic         PASSED  [0.4ms]" },
          { stream:"out", text:"middle_hit    PASSED  [0.5ms]" },
          { stream:"out", text:"duplicate     PASSED  [0.5ms]" },
          { stream:"out", text:"console_mode  PASSED  [3.0ms]" },
          { stream:"out", text:"symmetry      PASSED  [1.0ms]" },
          { stream:"out", text:"" },
          { stream:"out", text:"5 passed in 5.4ms" },
        ],
      }}
      onToggleDrawer={() => {}}
    />
  );
}

function ArtStudentFailFn() {
  const failingTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t3");
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="danger" dot>1 failing</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_BUGGY, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · 1 test failing"
      tests={[
        { ...window.WS.SAMPLE_TESTS[0] },
        { ...window.WS.SAMPLE_TESTS[1] },
        { ...failingTest, fn:{ ...failingTest.fn, got:"[0, 0]" } },
        { ...window.WS.SAMPLE_TESTS[3] },
        { ...window.WS.SAMPLE_TESTS[4] },
      ]}
      activeTestId="t3"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="4 / 5 · click failure to inspect"
      onRunAll={() => {}}
      drawerMode="failure"
      drawerFailure={failingTest}
      drawerSummary="duplicate · function returns wrong index"
      onToggleDrawer={() => {}}
    />
  );
}

function ArtStudentFailIO() {
  const ioTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t4");
  const failedIO = { ...ioTest, state:"fail", io:{ ...ioTest.io, got:"0 1\n", expected:"0 2\n" } };
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="danger" dot>1 failing</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_BUGGY, dark:true }]}
      activeTabId="main"
      editorFootnote="main.py · console-mode test failing"
      tests={[
        { ...window.WS.SAMPLE_TESTS[0] },
        { ...window.WS.SAMPLE_TESTS[1] },
        { ...window.WS.SAMPLE_TESTS[2] },
        failedIO,
        { ...window.WS.SAMPLE_TESTS[4] },
      ]}
      activeTestId="t4"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="4 / 5 · console_mode failed"
      onRunAll={() => {}}
      drawerMode="failure"
      drawerFailure={failedIO}
      drawerSummary="console_mode · stdout differs"
      onToggleDrawer={() => {}}
    />
  );
}

function ArtStudentFailPytest() {
  const pyTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t5");
  const failed = { ...pyTest, state:"fail", visible:true, pytest:{ ...pyTest.pytest, trace:
`>       a, b = two_sum(nums, 6)
E       TypeError: cannot unpack non-iterable NoneType object

tests/test_two_sum.py:14: TypeError

During the call:
  two_sum([3, 2, 4], 6)  ->  None` } };
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="danger" dot>pytest failure</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STARTER_LINES_2, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · returns None on this input"
      tests={[
        { ...window.WS.SAMPLE_TESTS[0], state:"pass" },
        { ...window.WS.SAMPLE_TESTS[1], state:"fail" },
        { ...window.WS.SAMPLE_TESTS[2], state:"fail" },
        { ...window.WS.SAMPLE_TESTS[3], state:"fail" },
        failed,
      ]}
      activeTestId="t5"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="1 / 5 · symmetry raised TypeError"
      onRunAll={() => {}}
      drawerMode="failure"
      drawerFailure={failed}
      drawerSummary="symmetry · unpack of None"
      onToggleDrawer={() => {}}
    />
  );
}

function ArtStudentRuntimeError() {
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<A2Pill tone="danger" dot>NameError</A2Pill>}
      ribbonOpen={false}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_RAISES, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · NameError on line 4"
      highlight={4}
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible).map(t => ({ ...t, state:"fail", t:"—" }))}
      activeTestId="t1"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="0 / 5 · all tests errored"
      onRunAll={() => {}}
      drawerMode="runtime-error"
      drawerRuntimeError={{
        type: "NameError",
        message: "name 'targt' is not defined. Did you mean: 'target'?",
        trace:
`File "main.py", line 4, in two_sum
    if targt - n in seen:
       ^^^^^

Raised on every test (the function body fails before any test logic runs).`,
      }}
      drawerSummary="line 4 · typo: 'targt' should be 'target'"
      onToggleDrawer={() => {}}
    />
  );
}

window.ArtStudentRunning      = ArtStudentRunning;
window.ArtStudentAllPass      = ArtStudentAllPass;
window.ArtStudentFailFn       = ArtStudentFailFn;
window.ArtStudentFailIO       = ArtStudentFailIO;
window.ArtStudentFailPytest   = ArtStudentFailPytest;
window.ArtStudentRuntimeError = ArtStudentRuntimeError;
