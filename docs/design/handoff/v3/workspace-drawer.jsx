/* Workspace Drawer — bottom panel, content swaps by mode.

   Modes:
     - "idle"      : compact summary line; click to expand
     - "output"    : stdout/stderr from a run-all or single run
     - "failure"   : kind-specific failure detail for one test
     - "debug"     : locals + call stack + scrubber
*/

const { Btn: WSDBtn, Pill: WSDPill } = window.EvalUI;

function WSDrawer({
  mode = "idle",                  // "idle" | "output" | "failure" | "debug" | "edit-test" | "runtime-error"
  collapsed = false,
  onToggleCollapsed,
  summary,                        // string for idle bar
  output,                         // {lines: [{stream:"out"|"err", text}], status, summary}
  failure,                        // a test object (with state==="fail") to render kind-specific detail
  debug,                          // {step, total, locals:[{name,value,changed}], stack:[{frame,line}], onStep, onPlay}
  edit,                           // a test object — kind-aware editor body
  runtimeError,                   // {type, message, trace}
  closeAction,                    // optional action to close drawer entirely
}) {
  const inverse = mode === "debug" || mode === "output" || mode === "failure" || mode === "runtime-error";
  if (collapsed) {
    return (
      <div onClick={onToggleCollapsed} style={{
        flexShrink:0, height:30,
        display:"flex", alignItems:"center", gap:10,
        padding:"0 12px",
        background:"var(--bg-sunken)",
        borderTop:"1px solid var(--border)",
        fontSize:11.5, color:"var(--fg-muted)",
        cursor:"pointer",
      }}>
        <span style={{ width:6, height:6, borderRadius:3, background: drawerStatusColor(mode, output, failure) }} />
        <span style={{ fontWeight:600 }}>{drawerLabel(mode)}</span>
        <span>·</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11 }}>{summary || drawerIdleSummary(mode, output, failure, debug)}</span>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:11 }}>Click to expand ⌃J</span>
      </div>
    );
  }
  return (
    <div style={{
      flexShrink:0,
      display:"flex", flexDirection:"column",
      borderTop:"1px solid var(--border)",
      background: inverse ? "var(--bg-inverse)" : "var(--bg-raised)",
      color: inverse ? "var(--fg-inverse)" : "var(--fg)",
      height: drawerHeight(mode),
      maxHeight: drawerHeight(mode),
    }}>
      <div style={{
        display:"flex", alignItems:"center", gap:10,
        height:30, padding:"0 12px",
        borderBottom: "1px solid " + (inverse ? "var(--border-inverse)" : "var(--border)"),
        background: inverse ? "var(--bg-inverse-raised)" : "var(--bg-sunken)",
      }}>
        <span style={{ width:6, height:6, borderRadius:3, background: drawerStatusColor(mode, output, failure) }} />
        <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4, textTransform:"uppercase",
                       color: inverse ? "var(--fg-inverse)" : "var(--fg)" }}>
          {drawerLabel(mode)}
        </span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11,
                       color: inverse ? "var(--fg-inverse-muted)" : "var(--fg-muted)" }}>
          {summary || drawerIdleSummary(mode, output, failure, debug)}
        </span>
        <div style={{ flex:1 }} />
        {closeAction}
        {onToggleCollapsed && (
          <button onClick={onToggleCollapsed} style={{
            background:"transparent", border:"none", color: "inherit",
            opacity:0.7, cursor:"pointer", fontSize:13, padding:"2px 6px",
          }}>⌄</button>
        )}
      </div>
      <div style={{ flex:1, overflow:"hidden", display:"flex" }}>
        {mode === "output"        && <WSOutputView  output={output} />}
        {mode === "failure"       && <WSFailureView failure={failure} />}
        {mode === "debug"         && <WSDebugView   debug={debug} />}
        {mode === "edit-test"     && <WSEditTestView test={edit} />}
        {mode === "runtime-error" && <WSRuntimeErrorView err={runtimeError} />}
        {mode === "idle"          && <WSIdleView />}
      </div>
    </div>
  );
}

function drawerLabel(mode) {
  return mode === "output"        ? "Output"
       : mode === "failure"       ? "Failure detail"
       : mode === "debug"         ? "Debugger"
       : mode === "edit-test"     ? "Test body"
       : mode === "runtime-error" ? "Runtime error"
       : "Console";
}
function drawerHeight(mode) {
  return mode === "debug" ? 200
       : mode === "failure" ? 200
       : mode === "edit-test" ? 260
       : mode === "runtime-error" ? 180
       : mode === "output" ? 160
       : 30;
}
function drawerStatusColor(mode, output, failure) {
  if (mode === "failure")       return "var(--danger)";
  if (mode === "runtime-error") return "var(--danger)";
  if (mode === "debug")         return "var(--accent)";
  if (mode === "edit-test")     return "var(--accent)";
  if (mode === "output" && output?.status === "fail") return "var(--danger)";
  if (mode === "output" && output?.status === "pass") return "var(--run)";
  return "var(--fg-subtle)";
}
function drawerIdleSummary(mode, output, failure, debug) {
  if (mode === "output")        return output?.summary || "—";
  if (mode === "failure")       return failure ? `${failure.name} — ${failure.kind}` : "—";
  if (mode === "debug")         return debug ? `step ${debug.step}/${debug.total} · ${debug.testName || "—"}` : "—";
  if (mode === "edit-test")     return "editing test body";
  if (mode === "runtime-error") return "unhandled exception — fix and re-run";
  return "Idle. Run a test to see output here.";
}

/* ---------- View: idle ---------- */
function WSIdleView() {
  return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--fg-subtle)", fontSize:12 }}>
      Run a test to see output here.
    </div>
  );
}

/* ---------- View: output ---------- */
function WSOutputView({ output }) {
  if (!output) return <WSIdleView />;
  return (
    <div style={{ flex:1, overflow:"auto", padding:"10px 14px",
                  fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.6 }}>
      {output.lines.map((l, i) => (
        <div key={i} style={{ color: l.stream === "err" ? "var(--danger)" : "var(--fg-inverse)" }}>{l.text}</div>
      ))}
    </div>
  );
}

/* ---------- View: failure (kind-specific) ---------- */
function WSFailureView({ failure }) {
  if (!failure) return <WSIdleView />;
  const k = failure.kind;
  return (
    <div style={{ flex:1, overflow:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
      {k === "fn" && <FailFn t={failure} />}
      {k === "io" && <FailIO t={failure} />}
      {k === "pytest" && <FailPytest t={failure} />}
      {k === "file" && <FailFile t={failure} />}
    </div>
  );
}

const failLabel = { fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:"uppercase", color:"var(--fg-inverse-muted)" };
const failBlock = { fontFamily:"var(--font-mono)", fontSize:12, lineHeight:1.55, padding:"8px 10px",
                    background:"var(--bg-inverse-raised)", border:"1px solid var(--border-inverse)",
                    borderRadius:6, color:"var(--fg-inverse)", whiteSpace:"pre-wrap" };

function FailFn({ t }) {
  return (
    <>
      <div style={{ display:"flex", gap:14, alignItems:"baseline" }}>
        <span style={failLabel}>Call</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:12.5, color:"var(--fg-inverse)" }}>{t.fn.call}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div>
          <div style={failLabel}>Expected</div>
          <div style={failBlock}>{t.fn.expected}</div>
        </div>
        <div>
          <div style={{ ...failLabel, color:"var(--danger)" }}>Got</div>
          <div style={{ ...failBlock, borderColor:"var(--danger)", color:"var(--danger)" }}>{t.fn.got}</div>
        </div>
      </div>
    </>
  );
}

function FailIO({ t }) {
  return (
    <>
      <div>
        <div style={failLabel}>stdin</div>
        <div style={failBlock}>{t.io.stdin}</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div>
          <div style={failLabel}>Expected stdout</div>
          <div style={failBlock}>{t.io.expected}</div>
        </div>
        <div>
          <div style={{ ...failLabel, color:"var(--danger)" }}>Got stdout</div>
          <div style={{ ...failBlock, borderColor:"var(--danger)", color:"var(--danger)" }}>{t.io.got}</div>
        </div>
      </div>
    </>
  );
}

function FailPytest({ t }) {
  const trace = t.pytest.trace || `>       assert two_sum([3, 3], 6) == [0, 1]
E       assert [0, 0] == [0, 1]
E         At index 1 diff: 0 != 1

tests/test_two_sum.py:42: AssertionError`;
  return (
    <>
      <div style={{ display:"flex", gap:14, alignItems:"baseline" }}>
        <span style={failLabel}>Target</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:12.5, color:"var(--fg-inverse)" }}>{t.pytest.target}</span>
      </div>
      <div>
        <div style={{ ...failLabel, color:"var(--danger)" }}>Traceback</div>
        <pre style={{ ...failBlock, borderColor:"var(--danger)", color:"var(--fg-inverse)", margin:0 }}>{trace}</pre>
      </div>
    </>
  );
}

function FailFile({ t }) {
  return (
    <>
      <div style={{ display:"flex", gap:14, alignItems:"baseline" }}>
        <span style={failLabel}>Inputs</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-inverse-muted)" }}>{t.file.stdinFile}  →  {t.file.expectedFile}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <div>
          <div style={failLabel}>Expected output</div>
          <div style={failBlock}>{`9999 0 0\n9998 1 0\n9997 0 1\n…`}</div>
        </div>
        <div>
          <div style={{ ...failLabel, color:"var(--danger)" }}>Got output</div>
          <div style={{ ...failBlock, borderColor:"var(--danger)", color:"var(--danger)" }}>{`9999 0 0\n9998 1 0\n9997 1 0\n…  (line 3 differs)`}</div>
        </div>
      </div>
    </>
  );
}

/* ---------- View: debug ---------- */
function WSDebugView({ debug }) {
  if (!debug) return <WSIdleView />;
  const { step, total, locals = [], stack = [], onStep, onPlay } = debug;
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
      {/* Scrubber */}
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"6px 12px",
                    borderBottom:"1px solid var(--border-inverse)" }}>
        <button onClick={() => onStep?.(-1)} style={{ ...debugBtn }}>◀</button>
        <button onClick={() => onPlay?.()} style={{ ...debugBtn, background:"var(--accent)", color:"var(--accent-fg)", border:"none" }}>▶</button>
        <button onClick={() => onStep?.(1)} style={{ ...debugBtn }}>▶</button>
        <div style={{ flex:1, position:"relative", height:8, background:"var(--bg-inverse-raised)", borderRadius:4 }}>
          <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${(step/total)*100}%`, background:"var(--accent)", borderRadius:4 }} />
          {Array.from({length: total + 1}).map((_, i) => (
            <div key={i} style={{ position:"absolute", top:-2, width:2, height:12,
                                  left:`calc(${(i/total)*100}% - 1px)`,
                                  background: i === step ? "var(--accent)" : "var(--border-inverse)" }} />
          ))}
        </div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-inverse-muted)", minWidth:64, textAlign:"right" }}>
          step {step} / {total}
        </div>
      </div>
      {/* Locals + stack */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        <div style={{ flex:1, overflow:"auto", padding:"8px 12px", borderRight:"1px solid var(--border-inverse)" }}>
          <div style={failLabel}>Locals</div>
          <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:3 }}>
            {locals.map((l, i) => (
              <div key={i} style={{ display:"flex", gap:10, fontFamily:"var(--font-mono)", fontSize:12 }}>
                <span style={{ color: l.changed ? "var(--accent)" : "var(--fg-inverse-muted)", minWidth:80 }}>{l.name}</span>
                <span style={{ color: l.changed ? "var(--accent)" : "var(--fg-inverse)" }}>{l.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ width:240, flexShrink:0, overflow:"auto", padding:"8px 12px" }}>
          <div style={failLabel}>Call stack</div>
          <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:3 }}>
            {stack.map((s, i) => (
              <div key={i} style={{ display:"flex", gap:10, fontFamily:"var(--font-mono)", fontSize:12 }}>
                <span style={{ color:"var(--fg-inverse-muted)", minWidth:24 }}>{i}</span>
                <span style={{ color:"var(--fg-inverse)" }}>{s.frame}</span>
                <span style={{ color:"var(--fg-inverse-muted)" }}>line {s.line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const debugBtn = {
  width:24, height:24, borderRadius:4,
  background:"var(--bg-inverse-raised)",
  border:"1px solid var(--border-inverse)",
  color:"var(--fg-inverse)",
  fontSize:11, cursor:"pointer",
  display:"inline-flex", alignItems:"center", justifyContent:"center",
};

/* ---------- View: edit-test (kind-aware test body editor) ---------- */
function WSEditTestView({ test }) {
  if (!test) return <WSIdleView />;
  const kindLabel = (window.WS && window.WS.KIND_LABEL && window.WS.KIND_LABEL[test.kind]) || test.kind;
  return (
    <div style={{ flex:1, overflow:"auto", padding:"12px 16px" }}>
      {/* Header row: kind label · name · visible toggle · seed */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <span style={{
          fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600,
          padding:"3px 8px", borderRadius:3,
          background:"var(--bg-inverse-raised)", border:"1px solid var(--border-inverse)",
          color:"var(--fg-inverse)",
        }}>{kindLabel}</span>
        <input defaultValue={test.name} style={{ ...editInput, flex:1, maxWidth:240 }} />
        <label style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, color:"var(--fg-inverse-muted)" }}>
          <input type="checkbox" defaultChecked={test.visible} /> visible to students
        </label>
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--fg-inverse-muted)" }}>seed</span>
        <input defaultValue={test.seed != null ? String(test.seed) : ""}
               placeholder="—"
               style={{ ...editInput, width:90, textAlign:"right" }} />
        <span title="Seeds random / numpy.random for this test only"
              style={{ fontSize:11, color:"var(--fg-inverse-muted)", cursor:"help" }}>ⓘ</span>
      </div>

      {/* Hidden banner — appears when this test is not visible to students */}
      {!test.visible && (
        <div style={{
          padding:"6px 10px", marginBottom:10,
          background:"color-mix(in oklch, var(--danger) 18%, var(--bg-inverse))",
          border:"1px solid var(--danger)", borderRadius:4,
          fontSize:11.5, color:"var(--fg-inverse)",
          display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{ width:6, height:6, borderRadius:3, background:"var(--danger)" }} />
          <strong>Hidden from students.</strong>
          <span style={{ color:"var(--fg-inverse-muted)" }}>Failures show as a generic “hidden test failed” — students never see call, expected, or got.</span>
        </div>
      )}

      {test.kind === "fn"     && <EditFn t={test} />}
      {test.kind === "io"     && <EditIO t={test} />}
      {test.kind === "pytest" && <EditPytest t={test} />}
      {test.kind === "file"   && <EditFile t={test} />}
    </div>
  );
}

const editInput = {
  height:22, padding:"0 8px",
  background:"var(--bg-inverse-raised)",
  border:"1px solid var(--border-inverse)",
  color:"var(--fg-inverse)",
  fontFamily:"var(--font-mono)", fontSize:12,
  borderRadius:3, outline:"none",
};
const editArea = {
  ...editInput,
  height:"auto",
  padding:"6px 8px",
  width:"100%",
  resize:"vertical",
  lineHeight:1.55,
};
const editLabel = { fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:"uppercase", color:"var(--fg-inverse-muted)", marginBottom:4 };

function EditFn({ t }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
      <div>
        <div style={editLabel}>Call expression</div>
        <textarea defaultValue={t.fn.call} rows={3} style={editArea} />
        <div style={{ ...editLabel, marginTop:8 }}>Compare</div>
        <select defaultValue="==" style={{ ...editInput, width:"100%" }}>
          <option>== (deep equals)</option>
          <option>≈ (float, rtol=1e-9)</option>
          <option>set equality</option>
          <option>custom function</option>
        </select>
      </div>
      <div>
        <div style={editLabel}>Expected return</div>
        <textarea defaultValue={t.fn.expected} rows={6} style={editArea} />
      </div>
      <div>
        <div style={{ ...editLabel, color:"var(--accent)" }}>Last run · got</div>
        <textarea readOnly value={t.fn.got || "(not run)"} rows={6} style={{ ...editArea, color: t.state === "fail" ? "var(--danger)" : "var(--fg-inverse-muted)" }} />
      </div>
    </div>
  );
}

function EditIO({ t }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
      <div>
        <div style={editLabel}>stdin</div>
        <textarea defaultValue={t.io.stdin} rows={6} style={editArea} />
        <div style={{ display:"flex", gap:12, marginTop:8, fontSize:11, color:"var(--fg-inverse-muted)" }}>
          <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}><input type="checkbox" defaultChecked /> trim trailing whitespace</label>
          <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}><input type="checkbox" /> case-insensitive</label>
        </div>
      </div>
      <div>
        <div style={editLabel}>Expected stdout</div>
        <textarea defaultValue={t.io.expected} rows={6} style={editArea} />
      </div>
      <div>
        <div style={{ ...editLabel, color:"var(--accent)" }}>Last run · got</div>
        <textarea readOnly value={t.io.got || "(not run)"} rows={6} style={{ ...editArea, color: t.state === "fail" ? "var(--danger)" : "var(--fg-inverse-muted)" }} />
      </div>
    </div>
  );
}

function EditPytest({ t }) {
  const body = t.pytest.body || `def test_symmetry():
    # for any (a, b) result, target is sum
    nums = [3, 2, 4]
    a, b = two_sum(nums, 6)
    assert nums[a] + nums[b] == 6`;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12 }}>
      <div>
        <div style={editLabel}>Test body (pytest)</div>
        <textarea defaultValue={body} rows={9} style={{ ...editArea, fontSize:12 }} />
      </div>
      <div>
        <div style={editLabel}>Target</div>
        <input defaultValue={t.pytest.target} style={{ ...editInput, width:"100%" }} />
        <div style={{ ...editLabel, marginTop:8 }}>Imports / fixtures available</div>
        <div style={{ ...editArea, padding:"8px 10px", color:"var(--fg-inverse-muted)" }}>
          <div>· solution module imported as <span style={{ color:"var(--fg-inverse)" }}>two_sum</span></div>
          <div>· pytest tmp_path fixture</div>
          <div>· numpy, math, random (seeded)</div>
        </div>
      </div>
    </div>
  );
}

function EditFile({ t }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <div>
        <div style={editLabel}>Input file · {t.file.stdinFile}</div>
        <textarea defaultValue={"5 3 7\n10 4 6 1 8\n12\n…  (10000 lines)"} rows={8} style={editArea} />
        <div style={{ marginTop:6, fontSize:11, color:"var(--fg-inverse-muted)" }}>
          Stored in repo. Streamed to stdin at run time.
        </div>
      </div>
      <div>
        <div style={editLabel}>Expected output file · {t.file.expectedFile}</div>
        <textarea defaultValue={"9999 0 0\n9998 1 0\n9997 0 1\n…  (10000 lines)"} rows={8} style={editArea} />
        <div style={{ marginTop:6, fontSize:11, color:"var(--fg-inverse-muted)" }}>
          Compared line-by-line against stdout.
        </div>
      </div>
    </div>
  );
}

/* ---------- View: runtime-error ---------- */
function WSRuntimeErrorView({ err }) {
  if (!err) return <WSIdleView />;
  return (
    <div style={{ flex:1, overflow:"auto", padding:"12px 16px", fontFamily:"var(--font-mono)", fontSize:12.5, lineHeight:1.65 }}>
      <div style={{ color:"var(--danger)", fontWeight:700, marginBottom:6 }}>{err.type}: {err.message}</div>
      <pre style={{ margin:0, whiteSpace:"pre-wrap", color:"var(--fg-inverse)" }}>{err.trace}</pre>
    </div>
  );
}

window.WSDrawer = WSDrawer;
