/* ============================================================
   Session lifecycle + Public view + Practice mode
   ============================================================

   New artboards covering aspects not yet in the tour:

   1. PublicProblemAnon       — public link, not signed in
   2. PublicProblemInstructor — public link, signed in as instructor
   3. PublicProblemStudent    — public link, signed in as student
   4. PublicProblemSolution   — public link with solution revealed (toggle)

   5. InstrPrivateBeforeStart — instructor's private screen, no live
                                session yet, "Start session" affordance
   6. InstrSessionFromSlide   — instructor followed a public link from
                                slides; modal asks which class to launch
                                the session for (since the public URL
                                doesn't carry a class)
   7. InstrSessionLive        — confirmation strip after launching;
                                instructor sees "session live" w/ join code

   8. StudentNewProblemBanner — student is on their own workspace; a
                                notif banner slides in announcing the
                                instructor moved on to a new problem
   9. StudentBetweenSessions  — student waiting; no session live yet,
                                last problem is sealed read-only

  10. StudentPracticeIdle     — student practicing solo on a problem
                                no class session involved; idle drawer
  11. StudentPracticeFail     — same, with a failing test inspected
   ============================================================ */

const { Btn: SBtn, Pill: SPill, Kbd: SKbd, ScreenShell: SShell, AppBar: SAppBar } = window.EvalUI;

const PUBLIC_STARTER = [
  "def two_sum(nums, target):",
  "  # TODO: return the indices of the two numbers",
  "  # such that they add up to target.",
  "  pass",
];

const PUBLIC_SOLUTION = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

/* ============================================================
   1–4. PUBLIC PROBLEM VIEW
   ----------------------------------------------------------
   A static, public, shareable URL for the problem. No editor,
   no run. Header shows the share URL. Action button differs
   based on auth: Sign in → Start session (instructor) →
   Practice (student). Solution can optionally be revealed if
   the problem is configured to allow it.
   ============================================================ */

function PublicShell({ persona, showSolution, onToggleSolution, autostart }) {
  return (
    <SShell direction="workshop">
      <PublicTopBar persona={persona} autostart={autostart} />
      <div style={{ flex:1, overflow:"auto" }}>
        <PublicHero persona={persona} autostart={autostart} />
        <PublicBody
          showSolution={showSolution}
          onToggleSolution={onToggleSolution}
          persona={persona}
        />
      </div>
    </SShell>
  );
}

function PublicTopBar({ persona, autostart }) {
  const { Logomark } = window.EvalUI;
  return (
    <header style={{
      height:44, flexShrink:0,
      display:"flex", alignItems:"center", gap:12, padding:"0 18px",
      borderBottom:"1px solid var(--border)", background:"var(--bg-raised)",
      fontSize:12.5,
    }}>
      <Logomark direction="workshop" />
      <span style={{ color:"var(--fg-muted)" }}>Public problem</span>
      <span style={{ opacity:0.4 }}>/</span>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--fg-muted)",
                     padding:"3px 8px", background:"var(--bg-sunken)",
                     border:"1px solid var(--border)", borderRadius:4 }}>
        {autostart ? "eval.run/p/two-sum?launch=cs101-p3" : "eval.run/p/two-sum"}
      </span>
      {autostart && <SPill tone="accent" dot>auto-start · Period 3</SPill>}
      <SBtn variant="ghost" size="sm" style={{ marginLeft:-2 }}>📋 Copy link</SBtn>
      <div style={{ flex:1 }} />
      {persona === "anon" && (
        <>
          <span style={{ fontSize:12, color:"var(--fg-muted)" }}>Viewing as guest</span>
          <SBtn variant="quiet" size="sm">Sign in</SBtn>
        </>
      )}
      {persona === "instructor" && (
        <>
          <SPill tone="accent" dot>Instructor</SPill>
          <span style={{ fontSize:12, color:"var(--fg-muted)" }}>M. Ramirez</span>
        </>
      )}
      {persona === "student" && (
        <>
          <SPill tone="info" dot>Student</SPill>
          <span style={{ fontSize:12, color:"var(--fg-muted)" }}>J. Liu</span>
        </>
      )}
    </header>
  );
}

function PublicHero({ persona, autostart }) {
  return (
    <div style={{
      padding:"32px 64px 28px 64px",
      borderBottom:"1px solid var(--border)",
      background:"var(--bg)",
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:24, maxWidth:1100 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4,
                           textTransform:"uppercase", color:"var(--fg-muted)" }}>
              Problem
            </span>
            <SPill tone="neutral" mono>python · 3.11</SPill>
            <SPill tone="neutral" mono>hashing</SPill>
            <SPill tone="neutral" mono>arrays</SPill>
            <SPill tone="neutral" mono>O(n)</SPill>
          </div>
          <h1 style={{ margin:"0 0 6px 0", fontSize:32, fontWeight:600, letterSpacing:-0.6,
                       fontFamily:"var(--font-serif)" }}>Two Sum</h1>
          <div style={{ fontSize:13.5, color:"var(--fg-muted)" }}>
            7 tests · 5 visible · authored by M. Ramirez · last updated Mar 14
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
          <PublicCTA persona={persona} autostart={autostart}/>
          <div style={{ fontSize:11.5, color:"var(--fg-subtle)" }}>
            {persona === "anon"     && <>Sign in to start a session or practice</>}
            {persona === "instructor" && (autostart
              ? <>This link auto-launches into Period 3 — no class picker</>
              : <>Generic link · prompts which class to launch into</>)}
            {persona === "student"   && <>Practice solo at your own pace</>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicCTA({ persona, autostart }) {
  if (persona === "anon") {
    return (
      <div style={{ display:"flex", gap:8 }}>
        <SBtn variant="quiet" size="md">Sign in to view</SBtn>
        <SBtn variant="primary" size="md">Create account</SBtn>
      </div>
    );
  }
  if (persona === "instructor") {
    if (autostart) {
      return (
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <SBtn variant="quiet" size="md">Open in library</SBtn>
          <SBtn variant="accent" size="md" kbd="⌘⏎">▶  Start for Period 3</SBtn>
        </div>
      );
    }
    return (
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <SBtn variant="quiet" size="md">Open in library</SBtn>
        <SBtn variant="accent" size="md" kbd="⌘⏎">▶  Start session…</SBtn>
      </div>
    );
  }
  return (
    <div style={{ display:"flex", gap:8 }}>
      <SBtn variant="quiet" size="md">Bookmark</SBtn>
      <SBtn variant="accent" size="md" kbd="⌘⏎">Practice</SBtn>
    </div>
  );
}

function PublicBody({ showSolution, onToggleSolution, persona }) {
  return (
    <div style={{ padding:"28px 64px 64px 64px", display:"grid",
                  gridTemplateColumns:"minmax(0, 1fr) 320px", gap:36, maxWidth:1180 }}>
      <div>
        <PublicSection title="Statement">
          <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border)",
                        borderRadius:"var(--radius-lg)", padding:"22px 28px" }}>
            <window.WSMarkdownRender body={window.WS.STATEMENT_MD} dark={false} />
          </div>
        </PublicSection>

        <PublicSection title="Visible tests" sub="5 of 7 — hidden tests run on submit only">
          <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border)",
                        borderRadius:"var(--radius-lg)", overflow:"hidden" }}>
            {window.WS.SAMPLE_TESTS.filter(t => t.visible).map((t, i) => (
              <PublicTestRow key={t.id} test={t} last={i === 4} />
            ))}
          </div>
        </PublicSection>

        <PublicSection
          title="Solution"
          sub={showSolution
            ? "configured visible to anyone · click ‘Hide’ to collapse"
            : "available — click reveal to view"}
          right={
            <button onClick={onToggleSolution} style={{
              height:24, padding:"0 10px",
              background:"var(--bg-sunken)", border:"1px solid var(--border)",
              borderRadius:"var(--radius)", color:"var(--fg)",
              fontSize:12, fontWeight:500, cursor:"pointer",
            }}>{showSolution ? "Hide solution" : "Reveal solution"}</button>
          }
        >
          {showSolution ? (
            <div style={{ borderRadius:"var(--radius-lg)", overflow:"hidden",
                          border:"1px solid var(--border-inverse)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10,
                            padding:"8px 14px",
                            background:"var(--bg-inverse-raised)",
                            color:"var(--fg-inverse-muted)",
                            borderBottom:"1px solid var(--border-inverse)",
                            fontFamily:"var(--font-mono)", fontSize:11.5 }}>
                <span style={{ color:"var(--fg-inverse)" }}>solution.py</span>
                <span>·</span>
                <span>read-only</span>
                <div style={{ flex:1 }}/>
                <SPill tone="run" dot>passes 7 / 7</SPill>
              </div>
              <window.WSCodeBody lines={PUBLIC_SOLUTION} dark={true} />
            </div>
          ) : (
            <div style={{ background:"var(--bg-raised)", border:"1px dashed var(--border-strong)",
                          borderRadius:"var(--radius-lg)",
                          padding:"40px 20px", display:"flex", flexDirection:"column",
                          alignItems:"center", justifyContent:"center", gap:8,
                          color:"var(--fg-muted)" }}>
              <div style={{ width:32, height:32, borderRadius:16, background:"var(--bg-sunken)",
                            border:"1px solid var(--border)", display:"grid", placeItems:"center",
                            color:"var(--fg-subtle)", fontSize:14 }}>👁</div>
              <div style={{ fontSize:13, color:"var(--fg)" }}>Solution is available</div>
              <div style={{ fontSize:12 }}>This problem is configured to allow viewing the reference solution.</div>
              <button onClick={onToggleSolution} style={{
                marginTop:8, height:28, padding:"0 14px",
                background:"var(--fg)", color:"var(--bg)", border:"none",
                borderRadius:"var(--radius)", fontSize:12.5, fontWeight:600, cursor:"pointer",
              }}>Reveal solution</button>
            </div>
          )}
        </PublicSection>
      </div>

      <aside style={{ display:"flex", flexDirection:"column", gap:18 }}>
        <PublicAside title="At a glance">
          <PublicMeta k="Tests"     v="7 (5 visible)" />
          <PublicMeta k="Language"  v="Python 3.11" />
          <PublicMeta k="Time limit" v="2.0s · 256MB" />
          <PublicMeta k="Solution"   v="reveal allowed" />
        </PublicAside>
        <PublicAside title={persona === "instructor" ? "If you start a session…" : persona === "student" ? "Practice mode" : "What is a session?"}>
          <ul style={{ margin:0, padding:0, listStyle:"none",
                       display:"flex", flexDirection:"column", gap:8,
                       fontSize:12.5, color:"var(--fg-muted)" }}>
            {persona === "instructor" ? (
              <>
                <li>Pick which class to launch into.</li>
                <li>Connected students get a banner and jump to a fresh editor.</li>
                <li>You see live progress in the dashboard.</li>
              </>
            ) : persona === "student" ? (
              <>
                <li>Open a private editor — your code is yours.</li>
                <li>Run visible tests as many times as you want.</li>
                <li>Attempts won't count toward a class session.</li>
              </>
            ) : (
              <>
                <li>An instructor opens a problem live for their class.</li>
                <li>Students see a banner and jump to a shared editor.</li>
                <li>The instructor can watch progress in real time.</li>
              </>
            )}
          </ul>
        </PublicAside>
      </aside>
    </div>
  );
}

function PublicSection({ title, sub, right, children }) {
  return (
    <section style={{ marginBottom:32 }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:10, marginBottom:10 }}>
        <h2 style={{ margin:0, fontSize:13, fontWeight:600, letterSpacing:0.4,
                     textTransform:"uppercase", color:"var(--fg-muted)" }}>{title}</h2>
        {sub && <div style={{ fontSize:12, color:"var(--fg-subtle)", paddingBottom:1 }}>{sub}</div>}
        <div style={{ flex:1 }}/>
        {right}
      </div>
      {children}
    </section>
  );
}

function PublicAside({ title, children }) {
  return (
    <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-lg)", padding:"14px 16px" }}>
      <div style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4,
                    textTransform:"uppercase", color:"var(--fg-muted)", marginBottom:10 }}>{title}</div>
      {children}
    </div>
  );
}

function PublicMeta({ k, v }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between",
                  fontSize:12.5, padding:"4px 0",
                  borderBottom:"1px dashed var(--border)" }}>
      <span style={{ color:"var(--fg-muted)" }}>{k}</span>
      <span style={{ color:"var(--fg)", fontFamily:"var(--font-mono)", fontSize:12 }}>{v}</span>
    </div>
  );
}

function PublicTestRow({ test, last }) {
  const tone = window.WS.KIND_TONE[test.kind];
  const label = window.WS.KIND_LABEL[test.kind];
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding:"10px 14px",
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <SPill tone={tone} mono>{label}</SPill>
      <span style={{ fontSize:13, fontWeight:500 }}>{test.name}</span>
      <span style={{ flex:1 }}/>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:11.5, color:"var(--fg-muted)",
                     maxWidth:480, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {test.kind === "fn"  && test.fn.call}
        {test.kind === "io"  && `stdin: ${test.io.stdin.replace(/\n/g, " ↵ ")}`}
        {test.kind === "pytest" && test.pytest.target}
      </span>
    </div>
  );
}

function PublicProblemAnon()       { return <PublicShell persona="anon"       showSolution={false} onToggleSolution={() => {}}/>; }
function PublicProblemInstructor() {
  const [show, setShow] = React.useState(false);
  return <PublicShell persona="instructor" showSolution={show} onToggleSolution={() => setShow(s => !s)}/>;
}
function PublicProblemAutostart() {
  return <PublicShell persona="instructor" autostart showSolution={false} onToggleSolution={() => {}}/>;
}
function PublicProblemStudent() {
  const [show, setShow] = React.useState(false);
  return <PublicShell persona="student" showSolution={show} onToggleSolution={() => setShow(s => !s)}/>;
}
function PublicProblemSolution() {
  return <PublicShell persona="instructor" showSolution={true} onToggleSolution={() => {}}/>;
}

/* ============================================================
   5–7. INSTRUCTOR — STARTING / RUNNING A SESSION
   ----------------------------------------------------------
   Today (in the live app) the instructor often follows a URL
   from their slides on the projector machine, but the *control*
   should happen on their private screen. This is a deliberately
   simpler model:
     a. Instructor's private screen always shows a "session
        composer" while no session is live for that problem.
     b. If they follow a public URL, an interstitial picks the
        class to launch into (since the public URL is class-less).
     c. Once launched, a slim live-session strip persists at the
        top of every Eval surface they touch.
   ============================================================ */

function InstrPrivateBeforeStart() {
  return (
    <SShell direction="workshop">
      <SAppBar
        direction="workshop"
        breadcrumb={["Eval", "Library", "Two Sum"]}
        right={<>
          <SPill tone="neutral" mono>private screen</SPill>
          <SBtn variant="quiet" size="sm">Open public link ↗</SBtn>
        </>}
      />
      <div style={{ flex:1, overflow:"auto", padding:"28px 36px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:28, maxWidth:1340 }}>
          <div>
            <div style={{ fontFamily:"var(--font-serif)", fontSize:28, fontWeight:600,
                          letterSpacing:-0.4, marginBottom:6 }}>Two Sum</div>
            <div style={{ fontSize:13, color:"var(--fg-muted)", marginBottom:18 }}>
              7 tests · 5 visible · last edited 2m ago · no live session
            </div>
            <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border)",
                          borderRadius:"var(--radius-lg)", padding:"18px 22px", marginBottom:16 }}>
              <window.WSMarkdownRender body={window.WS.STATEMENT_MD} dark={false}/>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <SBtn variant="quiet" size="md">Open in editor</SBtn>
              <SBtn variant="quiet" size="md">Edit problem</SBtn>
              <SBtn variant="quiet" size="md">📋 Copy public link</SBtn>
            </div>
          </div>

          <SessionComposer />
        </div>
      </div>
    </SShell>
  );
}

function SessionComposer({ preselected, fromSlideUrl }) {
  const [classId, setClassId] = React.useState(preselected || null);
  const classes = [
    { id:"cs101-p3", name:"CS 101 · Period 3",  count:22, status:"in-class · 17 connected" },
    { id:"cs101-p5", name:"CS 101 · Period 5",  count:24, status:"meets in 38 min" },
    { id:"cs61a",    name:"CS 61A · Spring",    count:31, status:"async — no live time" },
  ];
  return (
    <div style={{ position:"sticky", top:0,
                  background:"var(--bg-raised)", border:"1px solid var(--border)",
                  borderRadius:"var(--radius-lg)", overflow:"hidden",
                  display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"12px 16px", borderBottom:"1px solid var(--border)",
                    background:"var(--bg-sunken)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:8, height:8, borderRadius:4, background:"var(--accent)" }}/>
          <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4,
                         textTransform:"uppercase", color:"var(--fg-muted)" }}>
            Start session
          </span>
        </div>
        <div style={{ marginTop:4, fontSize:12.5, color:"var(--fg-muted)" }}>
          {fromSlideUrl
            ? "You opened this from a slide link. Pick a class to launch into."
            : "Pick a class. Connected students will get a banner and a fresh editor."}
        </div>
      </div>
      <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:0.3,
                      textTransform:"uppercase", color:"var(--fg-subtle)",
                      padding:"6px 6px 2px 6px" }}>Class</div>
        {classes.map(c => {
          const sel = c.id === classId;
          return (
            <button key={c.id} onClick={() => setClassId(c.id)} style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"10px 12px", borderRadius:6,
              background: sel ? "var(--accent-soft)" : "transparent",
              border: sel ? "1px solid var(--accent)" : "1px solid var(--border)",
              cursor:"pointer", textAlign:"left",
            }}>
              <span style={{
                width:14, height:14, borderRadius:7, flexShrink:0,
                background: sel ? "var(--accent)" : "var(--bg)",
                border: sel ? "4px solid var(--accent-soft)" : "1px solid var(--border-strong)",
                boxShadow: sel ? "inset 0 0 0 2px var(--accent-fg)" : "none",
              }}/>
              <div style={{ display:"flex", flexDirection:"column", lineHeight:1.25, flex:1 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"var(--fg)" }}>{c.name}</span>
                <span style={{ fontSize:11.5, color:"var(--fg-muted)" }}>
                  {c.count} students · {c.status}
                </span>
              </div>
              {c.id === "cs101-p3" && <SPill tone="run" dot>now</SPill>}
            </button>
          );
        })}
      </div>
      <div style={{ padding:"4px 12px 10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:0.3,
                      textTransform:"uppercase", color:"var(--fg-subtle)",
                      padding:"6px 6px 2px 6px" }}>Options</div>
        <CheckRow label="Notify connected students with a banner" checked />
        <CheckRow label="Reset everyone's editor to the starter file" />
        <CheckRow label="End any session already running for this class" checked />
      </div>
      <div style={{ padding:"12px 14px",
                    borderTop:"1px solid var(--border)",
                    background:"var(--bg-sunken)",
                    display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:11.5, color:"var(--fg-muted)" }}>
          {classId ? `Will notify ${classes.find(c => c.id === classId).count} students` : "Pick a class to continue"}
        </span>
        <div style={{ flex:1 }}/>
        <SBtn variant="ghost" size="sm">Cancel</SBtn>
        <SBtn
          variant={classId ? "accent" : "quiet"}
          size="sm"
          kbd="⌘⏎"
          style={!classId ? { opacity:0.5, pointerEvents:"none" } : {}}
        >▶  Start session</SBtn>
      </div>
    </div>
  );
}

function CheckRow({ label, checked }) {
  return (
    <label style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"6px 8px", borderRadius:5, cursor:"pointer",
                    fontSize:12.5, color:"var(--fg)" }}>
      <span style={{
        width:14, height:14, borderRadius:3,
        background: checked ? "var(--fg)" : "var(--bg)",
        border: `1px solid ${checked ? "var(--fg)" : "var(--border-strong)"}`,
        display:"grid", placeItems:"center",
        color:"var(--bg)", fontSize:10, fontWeight:700,
      }}>{checked ? "✓" : ""}</span>
      <span>{label}</span>
    </label>
  );
}

function InstrSessionFromSlide() {
  return (
    <div style={{ position:"relative", width:"100%", height:"100%" }}>
      {/* Background: the public problem page, dimmed */}
      <div style={{ position:"absolute", inset:0, filter:"blur(2px) saturate(0.85)", opacity:0.55 }}>
        <PublicShell persona="instructor" showSolution={false} onToggleSolution={() => {}}/>
      </div>
      <div style={{ position:"absolute", inset:0, background:"oklch(0.18 0.012 80 / 0.45)" }}/>
      {/* Modal */}
      <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center", padding:24 }}>
        <div style={{
          width:520, background:"var(--bg)", color:"var(--fg)",
          border:"1px solid var(--border-strong)",
          borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow-lg)",
          overflow:"hidden",
        }}>
          <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)",
                        display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ width:8, height:8, borderRadius:4, background:"var(--accent)" }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600 }}>Start session — Two Sum</div>
              <div style={{ fontSize:12, color:"var(--fg-muted)" }}>
                You opened this from a slide link. Pick a class to launch into.
              </div>
            </div>
            <button style={{ background:"transparent", border:"none", color:"var(--fg-muted)",
                             fontSize:18, cursor:"pointer", lineHeight:1 }}>×</button>
          </div>
          <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:8 }}>
            <ClassRadio
              name="CS 101 · Period 3" sub="22 students · 17 connected · in class right now"
              tone="run" toneLabel="now"
              selected
            />
            <ClassRadio
              name="CS 101 · Period 5" sub="24 students · meets in 38 min"
              tone="neutral" toneLabel="upcoming"
            />
            <ClassRadio
              name="CS 61A · Spring" sub="31 students · async — no live time"
              tone="neutral" toneLabel="async"
            />
            <button style={{
              padding:"10px 12px", borderRadius:6, border:"1px dashed var(--border-strong)",
              background:"transparent", textAlign:"left",
              fontSize:12.5, color:"var(--fg-muted)", cursor:"pointer",
            }}>+ another class…</button>
          </div>
          <div style={{ padding:"12px 16px",
                        borderTop:"1px solid var(--border)",
                        background:"var(--bg-sunken)",
                        display:"flex", alignItems:"center", gap:8 }}>
            <CheckRow label="Notify with banner" checked />
            <div style={{ flex:1 }}/>
            <SBtn variant="ghost" size="sm">Cancel</SBtn>
            <SBtn variant="accent" size="sm" kbd="⌘⏎">▶  Start for Period 3</SBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassRadio({ name, sub, selected, tone, toneLabel }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding:"10px 12px", borderRadius:6,
      background: selected ? "var(--accent-soft)" : "transparent",
      border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
      cursor:"pointer",
    }}>
      <span style={{
        width:14, height:14, borderRadius:7, flexShrink:0,
        background: selected ? "var(--accent)" : "var(--bg)",
        border: selected ? "4px solid var(--accent-soft)" : "1px solid var(--border-strong)",
        boxShadow: selected ? "inset 0 0 0 2px var(--accent-fg)" : "none",
      }}/>
      <div style={{ display:"flex", flexDirection:"column", lineHeight:1.25, flex:1 }}>
        <span style={{ fontSize:13, fontWeight:600 }}>{name}</span>
        <span style={{ fontSize:11.5, color:"var(--fg-muted)" }}>{sub}</span>
      </div>
      <SPill tone={tone} dot={tone === "run"}>{toneLabel}</SPill>
    </div>
  );
}

function InstrSessionLive() {
  return (
    <SShell direction="workshop">
      <SAppBar
        direction="workshop"
        breadcrumb={["Eval", "CS 101 · Period 3", "Two Sum · live"]}
        right={<>
          <SPill tone="run" dot>Live · 17 / 22</SPill>
          <SPill tone="neutral" mono>code · 9F4K2</SPill>
          <SBtn variant="danger" size="sm">End session</SBtn>
        </>}
      />
      {/* Toast confirmation */}
      <div style={{
        flexShrink:0,
        background:"linear-gradient(180deg, var(--run-soft), var(--bg-raised))",
        borderBottom:"1px solid var(--border)",
        padding:"14px 24px",
        display:"flex", alignItems:"center", gap:14,
      }}>
        <div style={{
          width:28, height:28, borderRadius:14,
          background:"var(--run)", color:"var(--accent-fg)",
          display:"grid", placeItems:"center", fontSize:14, fontWeight:700, flexShrink:0,
        }}>✓</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13.5, fontWeight:600 }}>
            Session started for CS 101 · Period 3
          </div>
          <div style={{ fontSize:12, color:"var(--fg-muted)" }}>
            Notified 17 connected students · 5 still offline will be prompted on join
          </div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <SBtn variant="quiet" size="sm">📋 Copy code · 9F4K2</SBtn>
          <SBtn variant="quiet" size="sm">📺 Cast to projector</SBtn>
          <SBtn variant="ghost" size="sm">Dismiss</SBtn>
        </div>
      </div>

      {/* Behind: a dimmed dashboard so context is clear */}
      <div style={{ flex:1, display:"grid",
                    gridTemplateColumns:"260px 1fr 320px", minHeight:0,
                    opacity:0.92 }}>
        <window.InstrRoster mode="overview"/>
        <window.InstrCenter mode="overview"/>
        <window.InstrSignals/>
      </div>
    </SShell>
  );
}

/* ============================================================
   8–9. STUDENT — RECEIVES NEW PROBLEM / BETWEEN SESSIONS
   ============================================================ */

function NewProblemBannerOverlay({ children, fromProblem = "FizzBuzz", toProblem = "Two Sum" }) {
  return (
    <div style={{ position:"relative", width:"100%", height:"100%" }}>
      {children}
      {/* Backdrop dim — focuses attention on the banner */}
      <div style={{ position:"absolute", inset:0,
                    background:"linear-gradient(180deg, oklch(0.18 0.012 80 / 0.18), transparent 22%)",
                    pointerEvents:"none", zIndex:9 }}/>
      {/* Notif banner — slides from top */}
      <div style={{
        position:"absolute", top:54, left:"50%", transform:"translateX(-50%)",
        width:540, background:"var(--bg-inverse)", color:"var(--fg-inverse)",
        border:"1px solid var(--border-inverse)",
        borderRadius:"var(--radius-lg)", boxShadow:"var(--shadow-lg)",
        padding:"12px 14px",
        display:"flex", alignItems:"center", gap:12, zIndex:10,
      }}>
        <div style={{
          width:32, height:32, borderRadius:16, flexShrink:0,
          background:"var(--accent)", color:"var(--accent-fg)",
          display:"grid", placeItems:"center", fontSize:14, fontWeight:700,
        }}>▶</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600 }}>Instructor moved on — {toProblem}</div>
          <div style={{ fontSize:12, color:"var(--fg-inverse-muted)" }}>
            New problem just opened for Period 3. Your current code on {fromProblem} will be saved.
          </div>
        </div>
        <SBtn variant="quiet" size="sm" style={{
          background:"var(--bg-inverse-raised)", color:"var(--fg-inverse)",
          border:"1px solid var(--border-inverse)",
        }}>Stay here</SBtn>
        <SBtn variant="accent" size="sm" kbd="⏎">Jump in</SBtn>
      </div>
    </div>
  );
}

function StudentNewProblemBanner() {
  return (
    <NewProblemBannerOverlay fromProblem="duplicate fix" toProblem="Two Sum">
      <window.ArtStudentAllPass/>
    </NewProblemBannerOverlay>
  );
}
function StudentBannerWhileFailing() {
  return (
    <NewProblemBannerOverlay fromProblem="this problem" toProblem="Reverse a list">
      <window.ArtStudentFailFn/>
    </NewProblemBannerOverlay>
  );
}

function StudentBetweenSessions() {
  return <StudentSectionOverview/>;
}

/* ============================================================
   STUDENT SECTION OVERVIEW
   ----------------------------------------------------------
   The student's home for a section they're enrolled in. Lists:
     - Live now (if any session is live in this section)
     - Published problems they can practice on
     - Past sessions they participated in (review-only)
   ============================================================ */

function StudentSectionOverview({ liveNow = false }) {
  return (
    <SShell direction="workshop">
      <SAppBar
        direction="workshop"
        breadcrumb={["Eval", "CS 101 · Period 3"]}
        right={liveNow
          ? <SPill tone="run" dot>Session live</SPill>
          : <SPill tone="neutral" dot>No session live</SPill>}
      />
      <div style={{ flex:1, overflow:"auto", padding:"24px 36px 48px 36px" }}>
        <div style={{ maxWidth:1180, margin:"0 auto" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-end", gap:18, marginBottom:22 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11.5, fontWeight:600, letterSpacing:0.4,
                            textTransform:"uppercase", color:"var(--fg-muted)", marginBottom:4 }}>
                Section
              </div>
              <h1 style={{ margin:0, fontFamily:"var(--font-serif)",
                           fontSize:30, fontWeight:600, letterSpacing:-0.4 }}>
                CS 101 · Period 3
              </h1>
              <div style={{ marginTop:6, fontSize:13, color:"var(--fg-muted)" }}>
                M. Ramirez · TR 9:30–10:45 · room 142 · 22 students
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <SBtn variant="quiet" size="md">All sections</SBtn>
              <SBtn variant="quiet" size="md">Browse library</SBtn>
            </div>
          </div>

          {/* Live banner */}
          <LiveSessionCard liveNow={liveNow}/>

          {/* Published problems */}
          <SectionHeader
            title="Published problems"
            sub="Available to practice anytime · won't affect class progress"
            right={<>
              <FilterChip label="All" active/>
              <FilterChip label="Not started"/>
              <FilterChip label="In progress"/>
              <FilterChip label="Solved"/>
              <SBtn variant="ghost" size="sm">Sort: newest ↓</SBtn>
            </>}
          />
          <div style={{
            background:"var(--bg-raised)", border:"1px solid var(--border)",
            borderRadius:"var(--radius-lg)", overflow:"hidden", marginBottom:36,
          }}>
            {PUBLISHED_PROBLEMS.map((p, i) => (
              <ProblemRow key={p.id} problem={p} last={i === PUBLISHED_PROBLEMS.length - 1}/>
            ))}
          </div>

          {/* Past sessions */}
          <SectionHeader
            title="Past sessions"
            sub="Replay any class session to see your code, tests, and the problem statement"
            right={<SBtn variant="ghost" size="sm">View all 14 →</SBtn>}
          />
          <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border)",
                        borderRadius:"var(--radius-lg)", overflow:"hidden" }}>
            {PAST_SESSIONS.map((s, i) => (
              <PastSessionRow key={s.id} session={s} last={i === PAST_SESSIONS.length - 1}/>
            ))}
          </div>
        </div>
      </div>
    </SShell>
  );
}

function LiveSessionCard({ liveNow }) {
  if (!liveNow) {
    return (
      <div style={{
        display:"flex", alignItems:"center", gap:14,
        padding:"14px 18px", marginBottom:30,
        background:"var(--bg-raised)", border:"1px dashed var(--border-strong)",
        borderRadius:"var(--radius-lg)",
      }}>
        <div style={{ width:34, height:34, borderRadius:17,
                      background:"var(--bg-sunken)", border:"1px solid var(--border)",
                      display:"grid", placeItems:"center", color:"var(--fg-subtle)",
                      fontSize:16 }}>·</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13.5, fontWeight:600 }}>No session live right now</div>
          <div style={{ fontSize:12, color:"var(--fg-muted)" }}>
            You'll get a banner when M. Ramirez opens a problem. Until then, practice or review past sessions below.
          </div>
        </div>
        <SBtn variant="quiet" size="sm">Notify me</SBtn>
      </div>
    );
  }
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14,
      padding:"14px 18px", marginBottom:30,
      background:"linear-gradient(180deg, var(--run-soft), var(--bg-raised))",
      border:"1px solid var(--run)", borderRadius:"var(--radius-lg)",
    }}>
      <div style={{ width:34, height:34, borderRadius:17,
                    background:"var(--run)", color:"var(--accent-fg)",
                    display:"grid", placeItems:"center", fontSize:14, fontWeight:700 }}>▶</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13.5, fontWeight:600 }}>Two Sum — live now</div>
        <div style={{ fontSize:12, color:"var(--fg-muted)" }}>Started 2m ago · 17 of 22 connected</div>
      </div>
      <SBtn variant="accent" size="sm" kbd="⏎">Jump in</SBtn>
    </div>
  );
}

function SectionHeader({ title, sub, right }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:12 }}>
      <h2 style={{ margin:0, fontSize:13, fontWeight:600, letterSpacing:0.4,
                   textTransform:"uppercase", color:"var(--fg-muted)" }}>{title}</h2>
      {sub && <div style={{ fontSize:12, color:"var(--fg-subtle)" }}>{sub}</div>}
      <div style={{ flex:1 }}/>
      <div style={{ display:"flex", gap:6, alignItems:"center" }}>{right}</div>
    </div>
  );
}

function FilterChip({ label, active }) {
  return (
    <button style={{
      height:24, padding:"0 10px",
      background: active ? "var(--fg)" : "var(--bg-sunken)",
      color: active ? "var(--bg)" : "var(--fg-muted)",
      border: `1px solid ${active ? "var(--fg)" : "var(--border)"}`,
      borderRadius:12,
      fontSize:11.5, fontWeight: active ? 600 : 500, cursor:"pointer",
    }}>{label}</button>
  );
}

const PUBLISHED_PROBLEMS = [
  { id:"two-sum",       name:"Two Sum",          tags:["hashing","arrays"],  state:"in-progress", visTests:5, totTests:7, lastSeen:"in class today",       summary:"4 / 5 visible passing" },
  { id:"fizzbuzz",      name:"FizzBuzz",         tags:["control-flow"],      state:"solved",      visTests:4, totTests:4, lastSeen:"session ended 8m ago", summary:"4 / 4 passing" },
  { id:"reverse-list",  name:"Reverse a list",   tags:["recursion","lists"], state:"not-started", visTests:6, totTests:8, lastSeen:"posted 3 days ago",    summary:"" },
  { id:"binary-search", name:"Binary search",    tags:["arrays","O(log n)"], state:"not-started", visTests:5, totTests:9, lastSeen:"posted last week",     summary:"" },
  { id:"anagrams",      name:"Group anagrams",   tags:["hashing","strings"], state:"in-progress", visTests:4, totTests:6, lastSeen:"yesterday",            summary:"2 / 4 visible passing" },
  { id:"climb",         name:"Climbing stairs",  tags:["dp"],                state:"solved",      visTests:3, totTests:5, lastSeen:"Mar 3",                summary:"5 / 5 passing" },
];

function ProblemRow({ problem, last }) {
  const stateMeta = {
    "not-started": { label:"Not started",  tone:"neutral" },
    "in-progress": { label:"In progress",  tone:"warn"    },
    "solved":      { label:"Solved",       tone:"run"     },
  }[problem.state];
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14,
      padding:"12px 16px",
      borderBottom: last ? "none" : "1px solid var(--border)",
      cursor:"pointer",
    }}>
      <div style={{ width:108, flexShrink:0 }}>
        <SPill tone={stateMeta.tone} dot={problem.state !== "not-started"}>{stateMeta.label}</SPill>
      </div>
      <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:14, fontWeight:600, color:"var(--fg)" }}>{problem.name}</span>
        <div style={{ display:"flex", gap:4 }}>
          {problem.tags.map(t => <SPill key={t} tone="neutral" mono>{t}</SPill>)}
        </div>
      </div>
      <div style={{ width:160, fontSize:11.5, color:"var(--fg-muted)", textAlign:"right",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {problem.summary || problem.lastSeen}
      </div>
      <div style={{ width:64, fontFamily:"var(--font-mono)", fontSize:11.5,
                    color:"var(--fg-subtle)", textAlign:"right" }}>
        {problem.visTests}/{problem.totTests}
      </div>
      <span style={{ width:78, fontSize:12, fontWeight:600, color:"var(--accent-ink)",
                     textAlign:"right" }}>Practice →</span>
    </div>
  );
}

const PAST_SESSIONS = [
  { id:"s1", date:"Today",        time:"11:42",  problem:"FizzBuzz",        tags:["control-flow"],     duration:"14m",  result:"4 / 4",        verdict:"solved" },
  { id:"s2", date:"Tue Mar 11",   time:"09:35",  problem:"Two Sum",         tags:["hashing"],          duration:"22m",  result:"4 / 5",        verdict:"partial" },
  { id:"s3", date:"Thu Mar 6",    time:"09:30",  problem:"Group anagrams",  tags:["hashing","strings"],duration:"31m",  result:"2 / 4",        verdict:"partial" },
  { id:"s4", date:"Tue Mar 4",    time:"09:30",  problem:"Climbing stairs", tags:["dp"],               duration:"18m",  result:"5 / 5",        verdict:"solved" },
];

function PastSessionRow({ session, last }) {
  const tone = session.verdict === "solved" ? "run" : "warn";
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14,
      padding:"12px 16px",
      borderBottom: last ? "none" : "1px solid var(--border)",
      cursor:"pointer",
    }}>
      <div style={{ width:88 }}>
        <div style={{ fontSize:12.5, fontWeight:600 }}>{session.date}</div>
        <div style={{ fontSize:11, color:"var(--fg-muted)", fontFamily:"var(--font-mono)" }}>{session.time}</div>
      </div>
      <SPill tone={tone} dot>{session.verdict}</SPill>
      <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ fontSize:13.5, fontWeight:500 }}>{session.problem}</div>
        <div style={{ display:"flex", gap:4 }}>
          {session.tags.map(t => <SPill key={t} tone="neutral" mono>{t}</SPill>)}
        </div>
      </div>
      <div style={{ width:60, fontFamily:"var(--font-mono)", fontSize:11.5,
                    color:"var(--fg-muted)", textAlign:"right" }}>{session.duration}</div>
      <div style={{ width:50, fontFamily:"var(--font-mono)", fontSize:12,
                    color:"var(--fg)", textAlign:"right" }}>{session.result}</div>
      <SBtn variant="ghost" size="sm">Replay →</SBtn>
    </div>
  );
}

/* ============================================================
   10–11. STUDENT — PRACTICE MODE (no class session)
   ----------------------------------------------------------
   Mostly identical to the connected workspace, but:
     - no "Connected" pill
     - subtle "practice" indicator in the header + ribbon
     - breadcrumb is "Library" not a class name
     - the problem stays open as long as the student wants
   ============================================================ */

const STUDENT_LINES_PRACTICE = [
  "def two_sum(nums, target):",
  "  seen = {}",
  "  for i, n in enumerate(nums):",
  "    if target - n in seen:",
  "      return [seen[target - n], i]",
  "    seen[n] = i",
  "  return []",
];

function PracticeChip() {
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:6,
      height:22, padding:"0 8px",
      background:"var(--bg-sunken)",
      border:"1px dashed var(--border-strong)",
      borderRadius:11,
      fontSize:11, color:"var(--fg-muted)",
      letterSpacing:0.3,
    }}>
      <span style={{ width:6, height:6, borderRadius:3, background:"var(--fg-subtle)" }}/>
      Practice · solo
    </div>
  );
}

function StudentPracticeIdle() {
  const [activeTest, setActiveTest] = React.useState("t1");
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum"]}
      headerRight={<PracticeChip/>}
      ribbonOpen={false}
      problemMeta="practice · solo"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:STUDENT_LINES_PRACTICE, dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · practice"
      tests={window.WS.SAMPLE_TESTS.filter(t => t.visible)}
      activeTestId={activeTest}
      onSelectTest={setActiveTest}
      railTitle="Tests · 5 visible"
      railMode="run"
      railSummary="solo run — no instructor watching"
      onRunAll={() => {}}
      drawerMode="idle"
      drawerCollapsed
      drawerSummary="Practicing solo. Run a test to see output here."
      onToggleDrawer={() => {}}
    />
  );
}

function StudentPracticeFail() {
  const failingTest = window.WS.SAMPLE_TESTS.find(t => t.id === "t3");
  return (
    <window.WorkspaceShell
      skin="student"
      direction="workshop"
      breadcrumb={["Eval", "Library", "Two Sum"]}
      headerRight={<div style={{ display:"flex", gap:6, alignItems:"center" }}>
        <SPill tone="danger" dot>1 failing</SPill>
        <PracticeChip/>
      </div>}
      ribbonOpen={false}
      problemMeta="practice · solo"
      editorTabs={[{ id:"main", label:"main.py", kind:"code", lines:[
        "def two_sum(nums, target):",
        "  for i in range(len(nums)):",
        "    for j in range(len(nums)):",
        "      if nums[i] + nums[j] == target:",
        "        return [i, j]",
        "  return []",
      ], dark:true, dirty:true }]}
      activeTabId="main"
      editorFootnote="main.py · practice · 1 failing"
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
      drawerMode="failure"
      drawerFailure={failingTest}
      drawerSummary="duplicate · function returns wrong index"
      onToggleDrawer={() => {}}
    />
  );
}

window.PublicProblemAnon         = PublicProblemAnon;
window.PublicProblemInstructor   = PublicProblemInstructor;
window.PublicProblemAutostart    = PublicProblemAutostart;
window.PublicProblemStudent      = PublicProblemStudent;
window.PublicProblemSolution     = PublicProblemSolution;
window.InstrPrivateBeforeStart   = InstrPrivateBeforeStart;
window.InstrSessionFromSlide     = InstrSessionFromSlide;
window.InstrSessionLive          = InstrSessionLive;
window.StudentNewProblemBanner   = StudentNewProblemBanner;
window.StudentBannerWhileFailing = StudentBannerWhileFailing;
window.StudentBetweenSessions    = StudentBetweenSessions;
window.StudentSectionOverview    = StudentSectionOverview;
window.StudentSectionLive        = function() { return <StudentSectionOverview liveNow/>; };
window.StudentPracticeIdle       = StudentPracticeIdle;
window.StudentPracticeFail       = StudentPracticeFail;
