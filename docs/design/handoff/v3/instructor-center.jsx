/* Instructor center column: minimap + (if student selected) focused workspace.

   Two modes:
     - mode="overview"  : minimap + tall "select a student" hint panel below
     - mode="focused"   : minimap + read-only workspace shell scoped to the student
*/

const STUDENT_LINES_FOCUSED = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i  # ← keeps last index of each value",
  "  return []",
];

function InstrCenter({ mode = "focused" } = {}) {
  return (
    <main style={{ display:"flex", flexDirection:"column", minHeight:0, minWidth:0 }}>
      <window.ClassMinimap/>
      <div style={{ flex:1, minHeight:0, display:"flex", borderTop:"1px solid var(--border)" }}>
        {mode === "overview" ? <FocusedEmpty/> : <FocusedStudent/>}
      </div>
    </main>
  );
}

/* No student selected — encourage clicking into the minimap or roster. */
function FocusedEmpty() {
  return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:10, padding:24, background:"var(--bg-sunken)",
      color:"var(--fg-muted)", fontSize:13, textAlign:"center",
    }}>
      <div style={{ fontSize:14, fontWeight:600, color:"var(--fg)" }}>No student focused</div>
      <div style={{ maxWidth:340 }}>
        Click any tile in the minimap above, or any name in the roster, to inspect a student's code without leaving this dashboard.
      </div>
      <div style={{ display:"flex", gap:6, marginTop:6 }}>
        <window.EvalUI.Pill tone="neutral" mono>↵  open selected</window.EvalUI.Pill>
        <window.EvalUI.Pill tone="neutral" mono>esc  close</window.EvalUI.Pill>
      </div>
    </div>
  );
}

/* Student selected — embed the workspace shell with the instructor skin. */
function FocusedStudent() {
  const tests = window.WS.SAMPLE_TESTS;
  // Mark the duplicate test (t3) as failing for this student snapshot
  const railTests = tests.map(t => t.id === "t3" ? { ...t, state:"fail", fn:{ ...t.fn, got:"[0,0]" } } : t);
  const failingTest = railTests.find(t => t.id === "t3");

  return (
    <div style={{ flex:1, minWidth:0, minHeight:0, display:"flex" }}>
      <window.WorkspaceShell
        skin="instructor"
        direction="workshop"
        embedded
        problemMeta=""
        skinTopBar={
          <div style={{
            flexShrink:0, height:34,
            display:"flex", alignItems:"center", gap:10,
            padding:"0 12px",
            borderBottom:"1px solid var(--border)",
            background:"var(--bg)",
          }}>
            <button style={chev}>‹</button>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={avatarStyle("warn")}>MP</div>
              <div style={{ display:"flex", flexDirection:"column", lineHeight:1.2 }}>
                <span style={{ fontSize:12.5, fontWeight:600 }}>Maya Patel</span>
                <span style={{ fontSize:10.5, color:"var(--fg-muted)" }}>4 / 5 passing · last edit 4s · 3 of 22</span>
              </div>
            </div>
            <button style={chev}>›</button>
            <div style={{ flex:1 }} />
            <window.EvalUI.Pill tone="warn" dot>Stuck on duplicate</window.EvalUI.Pill>
            <window.EvalUI.Btn variant="quiet" size="sm">Send hint</window.EvalUI.Btn>
            <window.EvalUI.Btn variant="ghost"  size="sm" title="Close focused panel (esc)">esc</window.EvalUI.Btn>
          </div>
        }
        editorTabs={[{ id:"main", label:"Maya Patel · main.py", kind:"code", lines:STUDENT_LINES_FOCUSED, dark:true }]}
        activeTabId="main"
        editorFootnote="read-only · live snapshot · last keystroke 4s ago"
        tests={railTests}
        activeTestId="t3"
        railTitle="Tests on Maya's code"
        railMode="run"
        railSummary="4 / 5 · duplicate failed"
        onRunAll={() => {}}
        drawerMode="failure"
        drawerFailure={failingTest}
        drawerSummary="duplicate · function returns wrong index"
        onToggleDrawer={() => {}}
      />
    </div>
  );
}

const chev = {
  width:22, height:22, borderRadius:4,
  background:"var(--bg-sunken)", border:"1px solid var(--border)",
  color:"var(--fg-muted)", fontSize:13, cursor:"pointer",
  display:"inline-flex", alignItems:"center", justifyContent:"center",
};
function avatarStyle(tone) {
  return {
    width:22, height:22, borderRadius:11,
    background: tone === "warn" ? "var(--warn-soft)" : tone === "danger" ? "var(--danger-soft)" : "var(--accent-soft)",
    color:     tone === "warn" ? "var(--warn)"      : tone === "danger" ? "var(--danger)"      : "var(--accent-ink)",
    display:"grid", placeItems:"center", fontSize:9.5, fontWeight:700,
  };
}

window.InstrCenter = InstrCenter;
