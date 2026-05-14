/* ============================================================
   v4 — Instructor surfaces
   D · Instructor home (today feed + class table)
   G · Classes list + class detail
   E · Section overview — instructor variant (tabs / progress)
   F · Per-student detail
   H · Student section list (student-side)
   ============================================================ */
const { Btn, Pill, Frame, IconBtn, Icon, Tabs, Banner, EmptyFrame, ConnectionDot, Skeleton } = window.EvalUI;
const { AppShell, PageHeader, HeaderRight } = window.V4Shell;

// ---------- D · Instructor home ----------
function InstrHomeD() {
  const [tab, setTab] = React.useState("today");
  return (
    <AppShell role="instructor" breadcrumb={["Dashboard"]} right={<HeaderRight status="live" />}
      activeSession={{ name: "Two Sum · Period 3" }}>
      <PageHeader
        eyebrow="Tuesday, October 14"
        title="Good morning, Marcus."
        sub="One session live now. Three classes meet today."
        right={<>
          <Btn variant="quiet" icon="search">Library</Btn>
          <Btn variant="accent" icon="plus">New class</Btn>
        </>}
      />

      <div style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Live strip */}
        <div style={{
          padding: "12px 14px",
          background: "linear-gradient(180deg, var(--accent-soft) 0%, var(--bg-raised) 140%)",
          border: "1px solid var(--accent-soft)",
          borderRadius: "var(--radius-lg)",
          display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 16,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, color: "var(--accent-ink)", letterSpacing: 0.6, textTransform: "uppercase" }}>
              <ConnectionDot status="live" compact />Live now · 22 / 24 connected
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, fontFamily: "var(--font-serif)", letterSpacing: -0.3 }}>
              Two Sum — Period 3 · CS A
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--fg-muted)" }}>
              <span><strong style={{ color: "var(--fg)" }}>14</strong> passing</span>
              <span><strong style={{ color: "var(--fg)" }}>6</strong> failing</span>
              <span><strong style={{ color: "var(--fg)" }}>2</strong> idle</span>
              <span>Started 11 min ago · code <span style={{ fontFamily: "var(--font-mono)" }}>K7M-2A9</span></span>
            </div>
          </div>
          <Btn variant="accent" size="md" icon="arrowR">Rejoin session</Btn>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {/* Classes table */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Tabs value={tab} onChange={setTab} items={[
                { id: "today", label: "Today", count: 3 },
                { id: "all",   label: "All classes", count: 3 },
                { id: "past",  label: "Past sessions", count: 28 },
              ]}/>
            </div>
            <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "var(--bg-sunken)" }}>
                    {["Class · section", "Meets", "Students", "Status", ""].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 4 ? "right" : "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fg-subtle)", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "CS A · Period 3", meet: "08:30", n: 24, status: "live", time: "11 min" },
                    { name: "CS A · Period 5", meet: "10:50", n: 22, status: "soon", time: "in 1h 20m" },
                    { name: "CS B · Period 7", meet: "13:15", n: 19, status: "soon", time: "in 3h 45m" },
                    { name: "CS A · Period 1", meet: "yesterday", n: 23, status: "idle", time: "ended 1d ago" },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 500 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>K7M-2A9 · join code</div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--fg-muted)" }}>{r.meet}</td>
                      <td style={{ padding: "10px 12px", color: "var(--fg-muted)" }}>{r.n}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.status === "live" ? <Pill tone="run" dot>Live · {r.time}</Pill>
                          : r.status === "soon" ? <Pill tone="info">{r.time}</Pill>
                          : <Pill tone="neutral">{r.time}</Pill>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        {r.status === "live"
                          ? <Btn variant="accent" size="sm" icon="arrowR">Rejoin</Btn>
                          : <Btn variant="quiet" size="sm" icon="play">Start session</Btn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right rail: This week + recent activity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Frame title="This week">
              <div style={{ fontSize: 11.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Sessions run</span><strong style={{ color: "var(--fg)", fontFamily: "var(--font-mono)" }}>6</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Problems shipped</span><strong style={{ color: "var(--fg)", fontFamily: "var(--font-mono)" }}>4</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Avg. solve rate</span><strong style={{ color: "var(--fg)", fontFamily: "var(--font-mono)" }}>71%</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span>Stuck students flagged</span><strong style={{ color: "var(--danger)", fontFamily: "var(--font-mono)" }}>3</strong></div>
              </div>
            </Frame>
            <Frame title="Recent activity">
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
                {[
                  ["Maya R. solved", "Two Sum", "2 min ago", "run"],
                  ["Jordan T. submitted", "Reverse List", "11 min ago", "neutral"],
                  ["You published", "Binary Search · Period 5", "1h ago", "accent"],
                  ["Aria K. flagged stuck", "Two Sum", "2h ago", "warn"],
                ].map((r, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <Pill tone={r[3]} dot>{r[3] === "warn" ? "stuck" : r[3] === "run" ? "solved" : r[3] === "accent" ? "you" : "act"}</Pill>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--fg)" }}>{r[0]}</span> <span style={{ color: "var(--fg-muted)" }}>{r[1]}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{r[2]}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Frame>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- G · Classes list ----------
function ClassesListG() {
  return (
    <AppShell role="instructor" breadcrumb={["Classes"]} right={<HeaderRight />}>
      <PageHeader title="Classes" sub="Each class groups one or more sections that meet at different times."
        right={<><Btn variant="quiet" icon="upload">Import roster</Btn><Btn variant="accent" icon="plus">New class</Btn></>}
      />
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
        {[
          { name: "CS A — Intro", desc: "Python fundamentals · semester long", sections: [["Period 1", 23, "K3X-9P2"], ["Period 3", 24, "K7M-2A9"], ["Period 5", 22, "K8B-4Q1"]], live: 1 },
          { name: "CS B — Data structures", desc: "Lists, dicts, recursion · 2nd semester", sections: [["Period 7", 19, "L2N-7T8"]], live: 0 },
          { name: "CS Honors", desc: "Algorithms · pull-out cohort", sections: [["Block A", 14, "M5R-6Y3"], ["Block B", 12, "M6V-1U7"]], live: 0 },
        ].map((c, i) => (
          <div key={i} style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, letterSpacing: -0.3 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{c.desc}</div>
              </div>
              {c.live > 0 && <Pill tone="run" dot>{c.live} live</Pill>}
            </div>
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {c.sections.map((s, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", fontSize: 12.5 }}>
                  <div>
                    <div>{s[0]}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-subtle)" }}>{s[2]}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{s[1]}</span>
                    <Btn variant="quiet" size="sm">Open →</Btn>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
              <Btn variant="ghost" icon="plus" size="sm">Section</Btn>
              <Btn variant="ghost" icon="edit" size="sm">Edit</Btn>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

// ---------- G · Class detail ----------
function ClassDetailG() {
  return (
    <AppShell role="instructor" breadcrumb={["Classes", "CS A — Intro"]} right={<HeaderRight />}>
      <PageHeader eyebrow="Class · 3 sections · 69 students"
        title="CS A — Intro" sub="Python fundamentals. Falls 2025–2026."
        right={<><Btn variant="quiet" icon="copy">Duplicate</Btn><Btn variant="accent" icon="plus">New section</Btn></>}
      />
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: 8 }}>Sections</div>
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead style={{ background: "var(--bg-sunken)" }}>
                <tr>{["Section", "Code", "Students", "Last met", "Status", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 5 ? "right" : "left", padding: "8px 12px", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fg-subtle)", fontWeight: 600 }}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Period 1", "K3X-9P2", 23, "yesterday", "idle"],
                  ["Period 3", "K7M-2A9", 24, "now",       "live"],
                  ["Period 5", "K8B-4Q1", 22, "Mon",       "idle"],
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r[0]}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{r[1]}</td>
                    <td style={{ padding: "10px 12px", color: "var(--fg-muted)" }}>{r[2]}</td>
                    <td style={{ padding: "10px 12px", color: "var(--fg-muted)" }}>{r[3]}</td>
                    <td style={{ padding: "10px 12px" }}>{r[4] === "live" ? <Pill tone="run" dot>Live</Pill> : <Pill>Idle</Pill>}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <Btn variant="quiet" size="sm">Open →</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--fg-subtle)", margin: "20px 0 8px" }}>Problem set</div>
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 12, fontSize: 12.5, color: "var(--fg-muted)" }}>
            12 problems published across this class. <a style={{ color: "var(--accent-ink)" }}>Manage in Library →</a>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Frame title="About">
            <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6 }}>
              Owner: Marcus Reeves<br/>Created: Aug 28, 2025<br/>Visibility: Lincoln HS · CS namespace
            </div>
          </Frame>
          <Frame title="Co-instructors">
            <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>None yet. <a style={{ color: "var(--accent-ink)" }}>Invite</a></div>
          </Frame>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- E · Section overview — instructor ----------
function SectionOverviewInstrE() {
  const [tab, setTab] = React.useState("students");
  const [view, setView] = React.useState("student"); // "student" | "problem"
  // Each student is summarized by solved / attempted across the term.
  const sessionResults = [
    { name: "Aria K.",   solved: 14, attempted: 17, lastSeen: "12 min ago", flag: null },
    { name: "Bao H.",    solved: 17, attempted: 17, lastSeen: "now",        flag: "streak" },
    { name: "Carmen O.", solved: 5,  attempted: 16, lastSeen: "23 min ago", flag: "stuck" },
    { name: "Devon M.",  solved: 15, attempted: 17, lastSeen: "5 min ago",  flag: null },
    { name: "Eli M.",    solved: 16, attempted: 17, lastSeen: "now",        flag: null },
    { name: "Fiona W.",  solved: 14, attempted: 15, lastSeen: "1h ago",     flag: "absent" },
    { name: "Gabe R.",   solved: 2,  attempted: 14, lastSeen: "2d ago",     flag: "stuck" },
    { name: "Harlow J.", solved: 17, attempted: 17, lastSeen: "yesterday",  flag: "streak" },
  ];
  function FlagPill({ flag }) {
    if (!flag) return null;
    if (flag === "streak")  return <Pill tone="run">7-session streak</Pill>;
    if (flag === "stuck")   return <Pill tone="danger">Struggling</Pill>;
    if (flag === "absent")  return <Pill tone="warn">Missed today</Pill>;
    return null;
  }

  // For "By problem" view: aggregate by problem across all sessions in the term.
  // (Problems can be assigned multiple times — we count submissions, not sessions.)
  const problems = [
    { name: "Two Sum",        sessions: 4, totalSubs: 92, solved: 78, avgAttempts: 2.4 },
    { name: "Reverse List",   sessions: 2, totalSubs: 47, solved: 41, avgAttempts: 1.8 },
    { name: "Binary Search",  sessions: 3, totalSubs: 71, solved: 52, avgAttempts: 3.1 },
    { name: "Anagrams",       sessions: 2, totalSubs: 46, solved: 33, avgAttempts: 2.7 },
    { name: "FizzBuzz",       sessions: 1, totalSubs: 24, solved: 23, avgAttempts: 1.2 },
    { name: "Valid Parens",   sessions: 2, totalSubs: 44, solved: 31, avgAttempts: 2.9 },
    { name: "Climbing Stairs",sessions: 1, totalSubs: 22, solved: 14, avgAttempts: 3.4 },
    { name: "Merge Intervals",sessions: 3, totalSubs: 65, solved: 38, avgAttempts: 4.1 },
  ];
  return (
    <AppShell role="instructor" breadcrumb={["Classes", "CS A · Period 3"]} right={<HeaderRight status="live" />}
      activeSession={{ name: "Two Sum · Period 3" }}>
      <PageHeader
        eyebrow="Section · 24 students · join code K7M-2A9"
        title="Period 3 — CS A"
        sub="Tuesdays, Thursdays · 08:30. Currently live."
        right={<>
          <Btn variant="quiet" icon="eye">Preview as student</Btn>
          <Btn variant="quiet" icon="copy">Copy join code</Btn>
          <Btn variant="accent" icon="play">Start session</Btn>
        </>}
        meta={<>
          <span><Icon name="users" size={11}/> 24 enrolled</span>
          <span><Icon name="layers" size={11}/> 5 problems published</span>
          <span><Icon name="history" size={11}/> 18 past sessions</span>
        </>}
      />

      <div style={{ padding: "0 24px" }}>
        <Tabs value={tab} onChange={setTab} items={[
          { id: "students", label: "Students", count: 24 },
          { id: "problems", label: "Problems", count: 5 },
          { id: "sessions", label: "Sessions", count: 18 },
        ]} right={
          <div style={{ display: "flex", gap: 6 }}>
            <Btn variant="ghost" size="sm" icon="filter">Filter</Btn>
            <Btn variant="ghost" size="sm" icon="download">Export CSV</Btn>
          </div>
        }/>
      </div>

      {/* Students tab content */}
      <div style={{ padding: 24 }}>
        <Banner tone="accent" icon="zap" title="Live session active"
          body="22 of 24 students are connected. Open the live dashboard to see real-time progress."
          action={<Btn variant="accent" size="sm">Open dashboard →</Btn>}/>

        {/* View switcher + legend */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", fontSize: 12 }}>
            {[["student","By student"],["problem","By problem"]].map(([id,label]) => (
              <button key={id} onClick={() => setView(id)}
                style={{
                  padding: "6px 12px",
                  background: view === id ? "var(--bg-raised)" : "transparent",
                  color: view === id ? "var(--fg)" : "var(--fg-muted)",
                  border: "none", borderRight: id === "student" ? "1px solid var(--border)" : "none",
                  cursor: "pointer", fontWeight: view === id ? 600 : 400,
                }}>{label}</button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
        </div>

        {view === "student" ? (
          <div style={{ marginTop: 12, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead style={{ background: "var(--bg-sunken)" }}>
                <tr>
                  {[
                    ["Student", "left"],
                    ["Solved / attempted", "left"],
                    ["", "left"],
                    ["Last seen", "left"],
                    ["", "right"],
                  ].map(([h, align], i) => (
                    <th key={i} style={{ textAlign: align, padding: "10px 12px", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fg-subtle)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionResults.map((s, i) => {
                  const ratio = s.solved / s.attempted;
                  const ratioColor = ratio >= 0.85 ? "var(--run)" : ratio >= 0.5 ? "var(--fg)" : "var(--danger)";
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: ratioColor, fontVariantNumeric: "tabular-nums" }}>
                        {s.solved} / {s.attempted}
                        <span style={{ color: "var(--fg-subtle)", marginLeft: 6, fontSize: 11 }}>{Math.round(ratio*100)}%</span>
                      </td>
                      <td style={{ padding: "8px 12px" }}><FlagPill flag={s.flag}/></td>
                      <td style={{ padding: "10px 12px", color: "var(--fg-muted)" }}>{s.lastSeen}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}><Btn variant="ghost" size="sm">Open →</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 12, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead style={{ background: "var(--bg-sunken)" }}>
                <tr>
                  {[["Problem","left"],["Times run","right"],["Submissions","right"],["Solve rate","left"],["Avg. attempts","right"],["",""]].map(([h, align], i) => (
                    <th key={i} style={{ textAlign: align, padding: "10px 12px", fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fg-subtle)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {problems.map((p, i) => {
                  const rate = p.solved / p.totalSubs;
                  const tone = rate >= 0.8 ? "var(--run)" : rate >= 0.5 ? "var(--accent)" : "var(--danger)";
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{p.sessions}×</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{p.totalSubs}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 280 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--bg-sunken)", overflow: "hidden" }}>
                            <div style={{ width: `${Math.round(rate*100)}%`, height: "100%", background: tone }}/>
                          </div>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: tone, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{Math.round(rate*100)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: p.avgAttempts > 3 ? "var(--danger)" : "var(--fg-muted)", fontVariantNumeric: "tabular-nums" }}>{p.avgAttempts.toFixed(1)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}><Btn variant="ghost" size="sm">Drill in →</Btn></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ---------- F · Per-student detail ----------
function StudentDetailF() {
  return (
    <AppShell role="instructor"
      breadcrumb={["Classes", "Period 3", "Students", "Aria K."]}
      right={<HeaderRight />}>
      <PageHeader
        eyebrow={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ConnectionDot status="warming" compact /> connected · last keystroke 12 min ago
        </span>}
        title="Aria Khoury"
        sub="aria.k@lincoln.hs · joined Sep 2"
        right={<>
          <Btn variant="quiet" icon="send">Message</Btn>
          <Btn variant="quiet" icon="eye">View as student</Btn>
        </>}
      />
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: 8 }}>Sessions in Period 3</div>
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            {[
              { date: "Today · 08:30", problem: "Two Sum",         result: "in-progress", revs: 17, time: "12m active" },
              { date: "Tue Mar 11",    problem: "Anagrams",        result: "attempted",   revs: 9,  time: "44m" },
              { date: "Thu Mar 6",     problem: "Binary Search",   result: "solved",      revs: 12, time: "31m" },
              { date: "Tue Mar 4",     problem: "Reverse List",    result: "solved",      revs: 7,  time: "18m" },
              { date: "Thu Feb 27",    problem: "FizzBuzz",        result: "solved",      revs: 3,  time: "9m"  },
              { date: "Tue Feb 25",    problem: "Two Sum",         result: "solved",      revs: 8,  time: "26m" },
              { date: "Thu Feb 20",    problem: "Valid Parens",    result: "attempted",   revs: 11, time: "38m" },
              { date: "Tue Feb 18",    problem: "Merge Intervals", result: "absent",      revs: 0,  time: "—"   },
            ].map((s, i) => {
              const tone = s.result === "solved" ? "run" : s.result === "in-progress" ? "warn" : s.result === "attempted" ? "danger" : null;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto auto auto", gap: 12, alignItems: "center", padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 12.5 }}>
                  <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{s.date}</span>
                  <span style={{ fontWeight: 500 }}>{s.problem}</span>
                  {tone ? <Pill tone={tone} dot>{s.result}</Pill> : <Pill>{s.result}</Pill>}
                  <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>{s.revs} revs · {s.time}</span>
                  <Btn variant="ghost" size="sm" icon="code">View code →</Btn>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Frame title="Summary">
            <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.7 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Sessions attended</span><strong style={{ color: "var(--fg)" }}>17 / 18</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Solved</span><strong style={{ color: "var(--run)" }}>14 / 17</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Time spent</span><strong style={{ color: "var(--fg)" }}>4h 12m</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total revisions</span><strong style={{ color: "var(--fg)", fontFamily: "var(--font-mono)" }}>57</strong></div>
            </div>
          </Frame>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- H · Student section list ----------
function StudentSectionListH() {
  return (
    <AppShell role="student" breadcrumb={["My sections"]} right={<HeaderRight />}
      activeSession={{ name: "Two Sum · Period 3" }}>
      <PageHeader
        title="My sections"
        sub="Sections you're enrolled in. A live session pulls you straight into it."
        right={<Btn variant="accent" icon="plus">Join section</Btn>}
      />
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          { name: "CS A · Period 3", teacher: "Mr. Reeves · Lincoln HS", live: true, n: 5, solved: 3, joined: "Sep 2" },
          { name: "CS B · Block A",  teacher: "Ms. Chen · Lincoln HS",  live: false, n: 8, solved: 6, joined: "Sep 8" },
        ].map((s, i) => (
          <div key={i} style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: 16,
            position: "relative", overflow: "hidden",
          }}>
            {s.live && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--accent)" }} />
            )}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 500, letterSpacing: -0.3 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 4 }}>{s.teacher}</div>
              </div>
              {s.live && <Pill tone="run" dot>Live now</Pill>}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "var(--fg-muted)" }}>
              <span><strong style={{ color: "var(--fg)" }}>{s.solved}</strong> / {s.n} solved</span>
              <span>Joined {s.joined}</span>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              {s.live ? <Btn variant="accent" icon="zap">Jump in</Btn> : <Btn variant="quiet">Open section</Btn>}
              <Btn variant="ghost">Practice problems →</Btn>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

Object.assign(window, { InstrHomeD, ClassesListG, ClassDetailG, SectionOverviewInstrE, StudentDetailF, StudentSectionListH });
