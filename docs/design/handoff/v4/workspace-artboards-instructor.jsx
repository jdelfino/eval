/* Instructor focused-student skin — additional artboards.
   - All passing
   - Just connected (no runs yet)
   - Debugging into student's failing test
*/

const { Btn: InBtn, Pill: InPill } = window.EvalUI;

const STUDENT_LINES_OK = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

const STUDENT_LINES_DUP = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i  # ← uses last index of each value",
  "  return []",
];

const STARTER_FROZEN = [
  "def two_sum(nums, target):",
  "  # TODO: return the indices of the two numbers",
  "  # such that they add up to target.",
  "  pass",
];

function focusedHeaderRight() {
  return (
    <div style={{ display:"flex", gap:6 }}>
      <InPill tone="run" dot>Live · 17 / 22</InPill>
      <InBtn variant="quiet" size="sm">End session</InBtn>
    </div>
  );
}

function studentBar({ name, initials, summary, signal, prev, next, accent = "accent" }) {
  return (
    <div style={{
      flexShrink:0, height:36,
      display:"flex", alignItems:"center", gap:10,
      padding:"0 12px",
      borderBottom:"1px solid var(--border)",
      background:"var(--bg)",
    }}>
      <button style={chev}>‹</button>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:24, height:24, borderRadius:12,
                      background: accent === "warn" ? "var(--warn-soft)" : accent === "danger" ? "var(--danger-soft)" : "var(--accent-soft)",
                      color:     accent === "warn" ? "var(--warn)"      : accent === "danger" ? "var(--danger)"      : "var(--accent-ink)",
                      display:"grid", placeItems:"center", fontSize:10, fontWeight:700 }}>{initials}</div>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1.2 }}>
          <span style={{ fontSize:13, fontWeight:600 }}>{name}</span>
          <span style={{ fontSize:11, color:"var(--fg-muted)" }}>{summary}</span>
        </div>
      </div>
      <button style={chev}>›</button>
      <div style={{ flex:1 }} />
      {signal}
      <InBtn variant="quiet" size="sm">Send hint</InBtn>
      <InBtn variant="quiet" size="sm">Back to roster</InBtn>
    </div>
  );
}
const chev = {
  width:24, height:24, borderRadius:4,
  background:"var(--bg-sunken)", border:"1px solid var(--border)",
  color:"var(--fg-muted)", fontSize:14, cursor:"pointer",
  display:"inline-flex", alignItems:"center", justifyContent:"center",
};

/* ---- All passing ---- */
function ArtInstructorAllPass() {
  return (
    <window.WorkspaceShell
      skin="instructor"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Live · Two Sum"]}
      headerRight={focusedHeaderRight()}
      problemMeta="22 students · 17 connected"
      skinTopBar={studentBar({
        name:"Jamie Liu", initials:"JL",
        summary:"5 / 5 passing · submitted 32s ago · 1 of 22",
        signal:<InPill tone="run" dot>Done</InPill>,
        accent:"accent",
      })}
      editorTabs={[{ id:"main", label:"Jamie Liu · main.py", kind:"code", lines:STUDENT_LINES_OK, dark:true }]}
      activeTabId="main"
      editorFootnote="read-only · live snapshot"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible).map(t => ({ ...t, state:"pass" }))}
      activeTestId="t1"
      railTitle="Tests against Jamie's code"
      railMode="run"
      railSummary="5 / 5 · 4.8ms total"
      onRunAll={() => {}}
      drawerMode="output"
      drawerOutput={{
        status:"pass",
        summary:"all tests pass on Jamie's code",
        lines: [
          { stream:"out", text:"basic         PASSED  [0.4ms]" },
          { stream:"out", text:"middle_hit    PASSED  [0.5ms]" },
          { stream:"out", text:"duplicate     PASSED  [0.5ms]" },
          { stream:"out", text:"console_mode  PASSED  [3.0ms]" },
          { stream:"out", text:"symmetry      PASSED  [0.4ms]" },
        ],
      }}
      onToggleDrawer={() => {}}
    />
  );
}

/* ---- Just connected (no runs) ---- */
function ArtInstructorJustConnected() {
  return (
    <window.WorkspaceShell
      skin="instructor"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Live · Two Sum"]}
      headerRight={focusedHeaderRight()}
      problemMeta="22 students · 17 connected"
      skinTopBar={studentBar({
        name:"Sam Okafor", initials:"SO",
        summary:"just connected · 0 keystrokes · 9 of 22",
        signal:<InPill tone="info" dot>Reading</InPill>,
        accent:"accent",
      })}
      editorTabs={[{ id:"main", label:"Sam Okafor · main.py", kind:"code", lines:STARTER_FROZEN, dark:true }]}
      activeTabId="main"
      editorFootnote="read-only · starter file unmodified"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible).map(t => ({ ...t, state:"idle", t:"—" }))}
      activeTestId="t1"
      railTitle="Tests against Sam's code"
      railMode="run"
      railSummary="not run yet"
      onRunAll={() => {}}
      drawerMode="idle"
      drawerCollapsed
      drawerSummary="Sam hasn't started writing code yet."
      onToggleDrawer={() => {}}
    />
  );
}

/* ---- Debugging student's failing test ---- */
function ArtInstructorDebugging() {
  return (
    <window.WorkspaceShell
      skin="instructor"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Live · Two Sum"]}
      headerRight={focusedHeaderRight()}
      problemMeta="22 students · 17 connected"
      skinTopBar={studentBar({
        name:"Maya Patel", initials:"MP",
        summary:"4 / 5 passing · last edit 4s · 3 of 22",
        signal:<InPill tone="warn" dot>Stuck on duplicate</InPill>,
        accent:"warn",
      })}
      editorTabs={[{ id:"main", label:"Maya Patel · main.py", kind:"code", lines:STUDENT_LINES_DUP, dark:true }]}
      activeTabId="main"
      highlight={6}
      breakpoints={[6]}
      editorFootnote="paused at line 6 · debugging Maya's duplicate test"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible)}
      activeTestId="t3"
      railTitle="Tests against Maya's code"
      railMode="run"
      railSummary="debugging duplicate · step 6 / 11"
      drawerMode="debug"
      drawerDebug={{
        step: 6, total: 11, testName: "duplicate",
        locals: [
          { name:"nums",   value:"[3, 3]" },
          { name:"target", value:"6" },
          { name:"i",      value:"1", changed:true },
          { name:"n",      value:"3", changed:true },
          { name:"seen",   value:"{3: 0}" },
        ],
        stack: [{ frame:"two_sum", line:6 }, { frame:"<module>", line:1 }],
      }}
      onToggleDrawer={() => {}}
    />
  );
}

window.ArtInstructorAllPass        = ArtInstructorAllPass;
window.ArtInstructorJustConnected  = ArtInstructorJustConnected;
window.ArtInstructorDebugging      = ArtInstructorDebugging;
