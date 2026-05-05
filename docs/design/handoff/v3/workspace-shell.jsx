/* Workspace Shell — the unified screen used by all three skins.

   ┌─ AppBar ─────────────────────────────────────────────────────┐
   │ Statement ribbon (collapsed peek by default; click to open) ─│
   ├──────────────────────────────────┬───────────────────────────┤
   │   EDITOR (tabs)                  │   TEST RAIL               │
   │                                  │                           │
   ├──────────────────────────────────┴───────────────────────────┤
   │ DRAWER (output / failure / debug — content swaps)            │
   └──────────────────────────────────────────────────────────────┘

   Skins:
     "student"  — single tab "main.py"; rail run-mode; drawer output/debug
     "author"   — Solution / Starter / Statement tabs; rail edit-mode; drawer
                  swaps between output and failure detail when running tests
     "instructor" — read-only student snapshot; can run all tests on student's
                    code; drawer swaps between output, failure detail, debug
*/

const { ScreenShell, AppBar, Btn, Pill, Kbd } = window.EvalUI;

function WorkspaceShell({
  skin = "student",            // "student" | "author" | "instructor"
  // shared state
  ribbonOpen = false,
  onToggleRibbon,
  // editor
  editorTabs,
  activeTabId,
  onSelectTab,
  highlight,
  breakpoints,
  editorRightControls,
  editorFootnote,
  // rail
  tests,
  activeTestId,
  onSelectTest,
  onRunTest,
  onDebugTest,
  onRunAll,
  isRunningAll,
  railTitle,
  railMode,
  railShowAdd,
  railSummary,
  // drawer
  drawerMode,
  drawerCollapsed,
  onToggleDrawer,
  drawerOutput,
  drawerFailure,
  drawerDebug,
  drawerEdit,
  drawerRuntimeError,
  drawerCloseAction,
  drawerSummary,
  // header
  breadcrumb,
  headerRight,
  // statement (markdown body)
  statement = window.WS.STATEMENT_MD,
  problemTitle = "Two Sum",
  problemMeta,                  // string under title
  // skin-specific extras
  skinTopBar,                   // optional row between ribbon and editor (instructor: student switcher)
  direction = "workshop",
  density = "compact",
  embedded = false,             // when true, omit AppBar + Ribbon (host page provides them)
}) {
  if (embedded) {
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", minHeight:0, minWidth:0, background:"var(--bg)", color:"var(--fg)" }}>
        {skinTopBar}
        <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
            <window.WSEditorPane
              tabs={editorTabs}
              activeId={activeTabId}
              onSelect={onSelectTab}
              highlight={highlight}
              breakpoints={breakpoints}
              rightControls={editorRightControls}
              footnote={editorFootnote}
            />
          </div>
          <div style={{ width:320, flexShrink:0, display:"flex", flexDirection:"column", minHeight:0 }}>
            <window.WSTestRail
              tests={tests}
              activeId={activeTestId}
              onSelectTest={onSelectTest}
              onRunTest={onRunTest}
              onDebugTest={onDebugTest}
              onRunAll={onRunAll}
              isRunningAll={isRunningAll}
              title={railTitle}
              mode={railMode}
              showAdd={railShowAdd}
              selectedSummary={railSummary}
            />
          </div>
        </div>
        <window.WSDrawer
          mode={drawerMode}
          collapsed={drawerCollapsed}
          onToggleCollapsed={onToggleDrawer}
          output={drawerOutput}
          failure={drawerFailure}
          debug={drawerDebug}
          edit={drawerEdit}
          runtimeError={drawerRuntimeError}
          summary={drawerSummary}
          closeAction={drawerCloseAction}
        />
      </div>
    );
  }
  return (
    <ScreenShell direction={direction} density={density} style={{ overflow:"hidden" }}>
      <AppBar breadcrumb={breadcrumb} right={headerRight} direction={direction} />
      <Ribbon
        open={ribbonOpen}
        onToggle={onToggleRibbon}
        title={problemTitle}
        meta={problemMeta}
        body={statement}
      />
      {skinTopBar}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          <window.WSEditorPane
            tabs={editorTabs}
            activeId={activeTabId}
            onSelect={onSelectTab}
            highlight={highlight}
            breakpoints={breakpoints}
            rightControls={editorRightControls}
            footnote={editorFootnote}
          />
        </div>
        <div style={{ width:340, flexShrink:0, display:"flex", flexDirection:"column", minHeight:0 }}>
          <window.WSTestRail
            tests={tests}
            activeId={activeTestId}
            onSelectTest={onSelectTest}
            onRunTest={onRunTest}
            onDebugTest={onDebugTest}
            onRunAll={onRunAll}
            isRunningAll={isRunningAll}
            title={railTitle}
            mode={railMode}
            showAdd={railShowAdd}
            selectedSummary={railSummary}
          />
        </div>
      </div>
      <window.WSDrawer
        mode={drawerMode}
        collapsed={drawerCollapsed}
        onToggleCollapsed={onToggleDrawer}
        output={drawerOutput}
        failure={drawerFailure}
        debug={drawerDebug}
        edit={drawerEdit}
        runtimeError={drawerRuntimeError}
        summary={drawerSummary}
        closeAction={drawerCloseAction}
      />
    </ScreenShell>
  );
}

/* ---------- Statement ribbon (peek + expand) ---------- */
function Ribbon({ open, onToggle, title, meta, body }) {
  return (
    <div style={{
      flexShrink:0, display:"flex", flexDirection:"column",
      borderBottom:"1px solid var(--border)",
      background:"var(--bg-raised)",
      maxHeight: open ? 280 : 36,
      transition:"max-height 200ms ease",
      overflow:"hidden",
    }}>
      <div onClick={onToggle} style={{
        display:"flex", alignItems:"center", gap:10, height:36,
        padding:"0 14px",
        cursor:"pointer",
        borderBottom: open ? "1px solid var(--border)" : "none",
        background: "var(--bg-raised)",
      }}>
        <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4, textTransform:"uppercase", color:"var(--fg-muted)" }}>Problem</span>
        <span style={{ fontSize:13, fontWeight:600, color:"var(--fg)" }}>{title}</span>
        {meta && <span style={{ fontSize:12, color:"var(--fg-muted)" }}>· {meta}</span>}
        <div style={{ flex:1 }} />
        {!open && (
          <span style={{ fontSize:11.5, color:"var(--fg-muted)",
                         whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"55%" }}>
            {body.split("\n")[0].replace(/`/g, "")}
          </span>
        )}
        <Kbd>⌘1</Kbd>
        <span style={{ color:"var(--fg-muted)", fontSize:13, transform: open ? "rotate(180deg)" : "none", transition:"transform 160ms" }}>⌃</span>
      </div>
      {open && (
        <div style={{ flex:1, overflow:"auto", padding:"14px 22px" }}>
          <window.WSMarkdownRender body={body} dark={false} />
        </div>
      )}
    </div>
  );
}

window.WorkspaceShell = WorkspaceShell;
