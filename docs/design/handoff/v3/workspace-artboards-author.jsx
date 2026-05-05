/* Author skin — additional artboards.
   - Starter file open
   - Statement edit (markdown source)
   - Kind-aware test body editor in the drawer (one artboard per kind):
       fn, io, pytest, file, hidden
*/

const { Btn: AuBtn, Pill: AuPill } = window.EvalUI;

const SOLUTION_LINES_AU = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

const STARTER_LINES_AU = [
  "def two_sum(nums, target):",
  "  # TODO: return the indices of the two numbers",
  "  # such that they add up to target.",
  "  pass",
];

function authorTabs(activeTab, mdPreview) {
  return [
    { id:"solution",  label:"solution.py",  kind:"code",     lines:SOLUTION_LINES_AU, dark:true },
    { id:"starter",   label:"starter.py",   kind:"code",     lines:STARTER_LINES_AU,  dark:true },
    { id:"statement", label:"statement.md", kind:"markdown", body:window.WS.STATEMENT_MD, preview:!!mdPreview, dark:true },
  ];
}

function authorHeaderRight() {
  return (
    <div style={{ display:"flex", gap:6 }}>
      <AuPill tone="warn" dot>Draft</AuPill>
      <AuBtn variant="quiet" size="sm">Preview as student</AuBtn>
      <AuBtn variant="primary" size="sm">Publish</AuBtn>
    </div>
  );
}

function MdToggle({ preview }) {
  return (
    <div style={{ display:"inline-flex", background:"var(--bg-inverse-raised)",
                  border:"1px solid var(--border-inverse)", borderRadius:4, padding:2, gap:2 }}>
      {["edit","preview"].map(k => {
        const active = (k === "preview") === !!preview;
        return (
          <button key={k} style={{
            height:20, padding:"0 8px",
            background: active ? "var(--bg-inverse)" : "transparent",
            color: active ? "var(--fg-inverse)" : "var(--fg-inverse-muted)",
            border:"none", borderRadius:3,
            fontFamily:"var(--font-sans)", fontSize:11, fontWeight: active ? 600 : 500,
            cursor:"pointer",
          }}>{k[0].toUpperCase() + k.slice(1)}</button>
        );
      })}
    </div>
  );
}

/* ---- Starter file open ---- */
function ArtAuthorStarter() {
  return (
    <window.WorkspaceShell
      skin="author"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum (draft)"]}
      headerRight={authorHeaderRight()}
      problemTitle="Two Sum (draft)"
      problemMeta="3 files · 7 tests · last edited 2m ago"
      editorTabs={authorTabs("starter")}
      activeTabId="starter"
      editorFootnote="starter.py · what students see at t=0"
      tests={window.WS.SAMPLE_TESTS}
      activeTestId="t1"
      railTitle="Tests · 7"
      railMode="edit"
      railShowAdd
      railSummary="solution.py passes 6 / 7"
      onRunAll={() => {}}
      drawerMode="idle"
      drawerCollapsed
      onToggleDrawer={() => {}}
    />
  );
}

/* ---- Statement, edit (md source) ---- */
function ArtAuthorStatementEdit() {
  return (
    <window.WorkspaceShell
      skin="author"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum (draft)"]}
      headerRight={authorHeaderRight()}
      problemTitle="Two Sum (draft)"
      problemMeta="3 files · 7 tests · last edited just now"
      editorTabs={authorTabs("statement", false)}
      activeTabId="statement"
      editorRightControls={<MdToggle preview={false} />}
      editorFootnote="statement.md · markdown source"
      tests={window.WS.SAMPLE_TESTS}
      activeTestId="t1"
      railTitle="Tests · 7"
      railMode="edit"
      railShowAdd
      railSummary="solution.py passes 6 / 7"
      drawerMode="idle"
      drawerCollapsed
      onToggleDrawer={() => {}}
    />
  );
}

/* ---- Kind-aware test body editor: one per kind ---- */

function makeKindEditArtboard(kindId, testId) {
  const test = window.WS.SAMPLE_TESTS.find(t => t.id === testId);
  return function ArtAuthorEdit() {
    return (
      <window.WorkspaceShell
        skin="author"
        direction="workshop"
        breadcrumb={["Eval", "Library", "Two Sum (draft)"]}
        headerRight={authorHeaderRight()}
        problemTitle="Two Sum (draft)"
        problemMeta="3 files · 7 tests · last edited 2m ago"
        editorTabs={authorTabs("solution")}
        activeTabId="solution"
        editorFootnote="solution.py · runs against all tests"
        tests={window.WS.SAMPLE_TESTS}
        activeTestId={testId}
        railTitle="Tests · 7"
        railMode="edit"
        railShowAdd
        railSummary={`editing test body — ${test.name}`}
        drawerMode="edit-test"
        drawerEdit={test}
        drawerSummary={`${test.name} · ${kindId}`}
        drawerCloseAction={
          <div style={{ display:"flex", gap:6 }}>
            <AuBtn variant="ghost" size="sm" style={{ color:"var(--fg-inverse-muted)" }}>Cancel</AuBtn>
            <AuBtn variant="accent" size="sm">Save & run</AuBtn>
          </div>
        }
        onToggleDrawer={() => {}}
      />
    );
  };
}

window.ArtAuthorStarter        = ArtAuthorStarter;
window.ArtAuthorStatementEdit  = ArtAuthorStatementEdit;
window.ArtAuthorEditFn         = makeKindEditArtboard("fn",     "t3");
window.ArtAuthorEditIO         = makeKindEditArtboard("io",     "t4");
window.ArtAuthorEditPytest     = makeKindEditArtboard("pytest", "t5");
window.ArtAuthorEditFile       = makeKindEditArtboard("file",   "t6");
window.ArtAuthorEditHidden     = makeKindEditArtboard("fn",     "t7"); // hidden flag → fn editor + banner
