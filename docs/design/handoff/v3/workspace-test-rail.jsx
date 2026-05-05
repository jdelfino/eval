/* Workspace Test Rail — single component used in all three skins.

   Modes:
     - "run"   : student/instructor; can run, debug-this, view detail
     - "edit"  : author; same affordances + click row to edit kind-specific body
     - "view"  : read-only fallback
*/

const { Btn: TRBtn, Pill: TRPill } = window.EvalUI;

function WSTestRail({
  tests,
  activeId,
  onSelectTest,
  onRunTest,
  onDebugTest,
  mode = "run",          // "run" | "edit" | "view"
  showAdd = false,
  selectedSummary,       // small string at top — e.g. "5 of 7 passing · last run 2s"
  onRunAll,
  isRunningAll,
  title = "Tests",
  emptyHint,
}) {
  return (
    <aside style={{
      width: "100%", display:"flex", flexDirection:"column", minHeight:0,
      background:"var(--bg-raised)",
      borderLeft:"1px solid var(--border)",
    }}>
      {/* Rail header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 10px", height:32, flexShrink:0,
        borderBottom:"1px solid var(--border)",
        background:"var(--bg-sunken)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4, textTransform:"uppercase", color:"var(--fg-muted)" }}>{title}</span>
          {selectedSummary && <span style={{ fontSize:11, color:"var(--fg-subtle)" }}>{selectedSummary}</span>}
        </div>
        {onRunAll && (
          <TRBtn variant="run" size="sm" onClick={onRunAll}>
            {isRunningAll ? "Running…" : "Run all"}
          </TRBtn>
        )}
      </div>

      {/* List */}
      <div style={{ flex:1, overflow:"auto" }}>
        {tests.map(t => (
          <WSTestRow
            key={t.id}
            test={t}
            active={t.id === activeId}
            mode={mode}
            onSelect={() => onSelectTest?.(t.id)}
            onRun={() => onRunTest?.(t.id)}
            onDebug={() => onDebugTest?.(t.id)}
          />
        ))}
        {tests.length === 0 && (
          <div style={{ padding:"24px 16px", color:"var(--fg-subtle)", fontSize:12, textAlign:"center" }}>
            {emptyHint || "No tests yet."}
          </div>
        )}
        {showAdd && (
          <button style={{
            display:"flex", alignItems:"center", gap:8, width:"100%",
            padding:"10px 12px", border:"none",
            borderTop:"1px dashed var(--border)",
            background:"transparent",
            color:"var(--fg-muted)", fontSize:12,
            cursor:"pointer", fontFamily:"var(--font-sans)",
          }}>
            <span style={{ width:16, height:16, borderRadius:8, border:"1px dashed var(--border)", display:"grid", placeItems:"center", fontSize:11, color:"var(--fg-subtle)" }}>+</span>
            Add test case
          </button>
        )}
      </div>
    </aside>
  );
}

function WSTestRow({ test, active, mode, onSelect, onRun, onDebug }) {
  const KIND_TONE = window.WS.KIND_TONE;
  const KIND_LABEL = window.WS.KIND_LABEL;
  const stateDot = test.state === "pass" ? "var(--run)"
                  : test.state === "fail" ? "var(--danger)"
                  : test.state === "running" ? "var(--accent)"
                  : "var(--fg-subtle)";
  return (
    <div
      onClick={onSelect}
      style={{
        display:"flex", alignItems:"stretch", gap:0,
        borderBottom:"1px solid var(--border)",
        background: active ? "var(--bg)" : "transparent",
        cursor: onSelect ? "pointer" : "default",
        position:"relative",
      }}
    >
      {active && <div style={{ position:"absolute", left:0, top:0, bottom:0, width:2, background:"var(--accent)" }} />}
      <div style={{ flex:1, minWidth:0, padding:"8px 10px", display:"flex", flexDirection:"column", gap:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:6, height:6, borderRadius:4, background:stateDot, flexShrink:0 }} />
          <span style={{ fontSize:12.5, fontWeight: active ? 600 : 500, color:"var(--fg)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {test.name}
          </span>
          <TRPill tone={KIND_TONE[test.kind] || "neutral"} mono>{KIND_LABEL[test.kind] || test.kind}</TRPill>
          {!test.visible && <TRPill tone="warn">hidden</TRPill>}
          <div style={{ flex:1 }} />
          <span style={{ fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--fg-subtle)" }}>{test.t}</span>
        </div>
        {/* Tiny inline preview line */}
        <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-muted)",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", paddingLeft:14 }}>
          {kindPreview(test)}
        </div>
        {/* Actions on hover/active */}
        {active && (
          <div style={{ display:"flex", gap:6, paddingTop:4, paddingLeft:14 }}>
            <TRBtn variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); onRun?.(); }}>▶ Run</TRBtn>
            <TRBtn variant="quiet" size="sm" onClick={(e) => { e.stopPropagation(); onDebug?.(); }}>🐞 Debug</TRBtn>
            {mode === "edit" && <TRBtn variant="ghost" size="sm">Edit body</TRBtn>}
          </div>
        )}
      </div>
    </div>
  );
}

function kindPreview(t) {
  if (t.kind === "fn")     return t.fn.call;
  if (t.kind === "io")     return `stdin: "${t.io.stdin.split("\n")[0]}…"`;
  if (t.kind === "pytest") return t.pytest.target;
  if (t.kind === "file")   return `${t.file.stdinFile} → ${t.file.expectedFile}`;
  return "";
}

window.WSTestRail = WSTestRail;
