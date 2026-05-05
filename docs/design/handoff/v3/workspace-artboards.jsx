/* Workspace artboards — concrete configurations of the unified shell.
   Each one is a single React element rendering <WorkspaceShell> with
   skin-specific props. No layout differences between skins beyond what
   the shell already supports. */

const { Btn: WABtn, Pill: WAPill, Kbd: WAKbd } = window.EvalUI;

const STUDENT_LINES = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

const STARTER_LINES = [
  "def two_sum(nums, target):",
  "  # TODO: return the indices of the two numbers",
  "  # such that they add up to target.",
  "  pass",
];

const SOLUTION_LINES = STUDENT_LINES;

/* ---------- 1. Student — idle / drawer collapsed ---------- */
function ArtStudentIdle() {
  const [ribbon, setRibbon] = React.useState(true);
  const [activeTest, setActiveTest] = React.useState("t1");
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={<WAPill tone="info" dot>Connected</WAPill>}
      ribbonOpen={ribbon}
      onToggleRibbon={() => setRibbon(!ribbon)}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · python 3.11"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible)}
      activeTestId={activeTest}
      onSelectTest={setActiveTest}
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="4 / 5 passing"
      onRunAll={() => {}}
      drawerMode="idle"
      drawerCollapsed
      onToggleDrawer={() => {}}
      drawerSummary="Run a test to see output here."
    />
  );
}

/* ---------- 2. Student — debugging the failing duplicate test ---------- */
function ArtStudentDebug() {
  const [ribbon, setRibbon] = React.useState(false);
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum"]}
      headerRight={
        <div style={{ display:"flex", gap:6 }}>
          <WAPill tone="danger" dot>1 failing</WAPill>
          <WAPill tone="info" dot>Connected</WAPill>
        </div>
      }
      ribbonOpen={ribbon}
      onToggleRibbon={() => setRibbon(!ribbon)}
      problemMeta="due Tue · 10 pts · 7 tests"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES, dark:true }]}
      activeTabId="main"
      highlight={4}
      breakpoints={[4]}
      editorFootnote="paused at line 4 · debugging  duplicate"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible)}
      activeTestId="t3"
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="4 / 5 · debugging duplicate"
      drawerMode="debug"
      onToggleDrawer={() => {}}
      drawerDebug={{
        step: 6, total: 11, testName: "duplicate",
        locals: [
          { name:"nums",   value:"[3, 3]" },
          { name:"target", value:"6" },
          { name:"i",      value:"1", changed:true },
          { name:"n",      value:"3", changed:true },
          { name:"seen",   value:"{3: 0}" },
        ],
        stack: [{ frame:"two_sum", line:4 }, { frame:"<module>", line:11 }],
      }}
    />
  );
}

/* ---------- 3. Author — solution open, drawer collapsed ---------- */
function ArtAuthorSolution() {
  const [ribbon, setRibbon] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("solution");
  const [activeTest, setActiveTest] = React.useState("t3");
  const tabs = [
    { id:"solution",  label:"solution.py",  kind:"code",     lines:SOLUTION_LINES, dark:true },
    { id:"starter",   label:"starter.py",   kind:"code",     lines:STARTER_LINES,  dark:true },
    { id:"statement", label:"statement.md", kind:"markdown", body:window.WS.STATEMENT_MD, preview:false, dark:true },
  ];
  return (
    <window.WorkspaceShell
      skin="author"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum (draft)"]}
      headerRight={
        <div style={{ display:"flex", gap:6 }}>
          <WAPill tone="warn" dot>Draft</WAPill>
          <WABtn variant="quiet" size="sm">Preview as student</WABtn>
          <WABtn variant="primary" size="sm">Publish</WABtn>
        </div>
      }
      ribbonOpen={ribbon}
      onToggleRibbon={() => setRibbon(!ribbon)}
      problemTitle="Two Sum (draft)"
      problemMeta="3 files · 7 tests · last edited 2m ago"
      editorTabs={tabs}
      activeTabId={activeTab}
      onSelectTab={setActiveTab}
      editorFootnote="solution.py · runs against all tests"
      tests={window.WS.SAMPLE_TESTS}
      activeTestId={activeTest}
      onSelectTest={setActiveTest}
      railTitle="Tests · 7"
      railMode="edit"
      railShowAdd
      railSummary="6 / 7 passing on solution"
      onRunAll={() => {}}
      drawerMode="idle"
      drawerCollapsed
      onToggleDrawer={() => {}}
    />
  );
}

/* ---------- 4. Author — statement preview, failure visible in drawer ---------- */
function ArtAuthorStatement() {
  const [ribbon, setRibbon] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("statement");
  const tabs = [
    { id:"solution",  label:"solution.py",  kind:"code",     lines:SOLUTION_LINES, dark:true },
    { id:"starter",   label:"starter.py",   kind:"code",     lines:STARTER_LINES,  dark:true },
    { id:"statement", label:"statement.md", kind:"markdown", body:window.WS.STATEMENT_MD, preview:true, dark:true },
  ];
  const failingTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t3");
  return (
    <window.WorkspaceShell
      skin="author"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum (draft)"]}
      headerRight={
        <div style={{ display:"flex", gap:6 }}>
          <WAPill tone="warn" dot>Draft</WAPill>
          <WABtn variant="quiet" size="sm">Preview as student</WABtn>
          <WABtn variant="primary" size="sm">Publish</WABtn>
        </div>
      }
      ribbonOpen={ribbon}
      onToggleRibbon={() => setRibbon(!ribbon)}
      problemTitle="Two Sum (draft)"
      problemMeta="3 files · 7 tests · last edited 2m ago"
      editorTabs={tabs}
      activeTabId={activeTab}
      onSelectTab={setActiveTab}
      editorRightControls={<MarkdownPreviewToggle preview onToggle={() => {}} />}
      editorFootnote="statement.md · markdown"
      tests={window.WS.SAMPLE_TESTS}
      activeTestId="t3"
      railTitle="Tests · 7"
      railMode="edit"
      railShowAdd
      railSummary="duplicate failed against solution.py"
      drawerMode="failure"
      drawerFailure={failingTest}
      onToggleDrawer={() => {}}
    />
  );
}

function MarkdownPreviewToggle({ preview, onToggle }) {
  return (
    <div style={{ display:"inline-flex", background:"var(--bg-inverse-raised)",
                  border:"1px solid var(--border-inverse)", borderRadius:4, padding:2, gap:2 }}>
      {[
        { id:"edit",    label:"Edit"    },
        { id:"preview", label:"Preview" },
      ].map(opt => {
        const active = (opt.id === "preview") === !!preview;
        return (
          <button key={opt.id} onClick={onToggle} style={{
            height:20, padding:"0 8px",
            background: active ? "var(--bg-inverse)" : "transparent",
            color: active ? "var(--fg-inverse)" : "var(--fg-inverse-muted)",
            border:"none",
            borderRadius:3,
            fontFamily:"var(--font-sans)", fontSize:11, fontWeight: active ? 600 : 500,
            cursor:"pointer",
          }}>{opt.label}</button>
        );
      })}
    </div>
  );
}

/* ---------- 5. Instructor — focused student, failure detail in drawer ---------- */
function ArtInstructorFocused() {
  const [ribbon, setRibbon] = React.useState(false);
  const [activeTest, setActiveTest] = React.useState("t3");
  const failingTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t3");
  return (
    <window.WorkspaceShell
      skin="instructor"
      direction="workshop"
      breadcrumb={["Eval", "CS 101 · Period 3", "Live · Two Sum"]}
      headerRight={
        <div style={{ display:"flex", gap:6 }}>
          <WAPill tone="run" dot>Live · 17 / 22</WAPill>
          <WABtn variant="quiet" size="sm">End session</WABtn>
        </div>
      }
      ribbonOpen={ribbon}
      onToggleRibbon={() => setRibbon(!ribbon)}
      problemMeta="22 students · 17 connected"
      skinTopBar={<InstructorStudentBar />}
      editorTabs={[{
        id:"main", label:"Maya Patel · main.py", kind:"code",
        lines: [
          "def two_sum(nums, target):",
          "  seen = {}",
          "  for i, n in enumerate(nums):",
          "    if target - n in seen:",
          "      return [seen[target - n], i]",
          "    seen[n] = i  # ← uses last index of each value",
          "  return []",
        ],
        dark:true,
      }]}
      activeTabId="main"
      editorFootnote="read-only · live snapshot · 4s ago"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible)}
      activeTestId={activeTest}
      onSelectTest={setActiveTest}
      railTitle="Tests against Maya's code"
      railMode="run"
      railSummary="4 / 5 · click failure to inspect"
      onRunAll={() => {}}
      drawerMode="failure"
      drawerFailure={failingTest}
      drawerSummary="duplicate · function returns wrong index for repeated values"
      onToggleDrawer={() => {}}
    />
  );
}

function InstructorStudentBar() {
  return (
    <div style={{
      flexShrink:0, height:36,
      display:"flex", alignItems:"center", gap:10,
      padding:"0 12px",
      borderBottom:"1px solid var(--border)",
      background:"var(--bg)",
    }}>
      <button style={chevronBtn}>‹</button>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:24, height:24, borderRadius:12, background:"var(--accent-soft)",
                      display:"grid", placeItems:"center", fontSize:10, fontWeight:700, color:"var(--accent-ink)" }}>MP</div>
        <div style={{ display:"flex", flexDirection:"column", lineHeight:1.2 }}>
          <span style={{ fontSize:13, fontWeight:600 }}>Maya Patel</span>
          <span style={{ fontSize:11, color:"var(--fg-muted)" }}>4 / 5 passing · last edit 4s · 3 of 22</span>
        </div>
      </div>
      <button style={chevronBtn}>›</button>
      <div style={{ flex:1 }} />
      <WAPill tone="warn" dot>Stuck on duplicate</WAPill>
      <WABtn variant="quiet" size="sm">Send hint</WABtn>
      <WABtn variant="quiet" size="sm">Back to roster</WABtn>
    </div>
  );
}
const chevronBtn = {
  width:24, height:24, borderRadius:4,
  background:"var(--bg-sunken)", border:"1px solid var(--border)",
  color:"var(--fg-muted)", fontSize:14, cursor:"pointer",
  display:"inline-flex", alignItems:"center", justifyContent:"center",
};

window.ArtStudentIdle      = ArtStudentIdle;
window.ArtStudentDebug     = ArtStudentDebug;
window.ArtAuthorSolution   = ArtAuthorSolution;
window.ArtAuthorStatement  = ArtAuthorStatement;
window.ArtInstructorFocused = ArtInstructorFocused;
