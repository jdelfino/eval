/* ============================================================
   v4 — Modals & overlays
   N · Start Session (from dashboard) — class/section picker
   O · Solution viewer (student opens reference)
   P · Replay revisions (instructor-side)
   Q · Generate solution (author, AI assist)
   R · Confirm destructive (delete section)
   S · Publish to section (author → section)
   T · Create class / section (instructor onboarding)
   ============================================================ */
const { Btn: MBtn, IconBtn: MIB, Icon: MIcon, Modal: MModal, Pill: MPill,
        Field: MField, Input: MInput, CodeBlock: MCode, Banner: MBanner,
        Tabs: MTabs, ConnectionDot: MDot, Skeleton: MSkel } = window.EvalUI;

// thin frame that sits behind the modal so it reads as an overlay over a real surface
function ModalStage({ children, label, surface }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      position: "relative",
      background: "var(--bg)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      isolation: "isolate",
    }}>
      {/* faint hint of the underlying screen */}
      <div style={{
        position: "absolute", inset: 0,
        opacity: 0.55, filter: "blur(0.4px)",
        pointerEvents: "none",
      }}>
        {surface}
      </div>
      {children}
      {label && (
        <div style={{
          position: "absolute", bottom: 8, left: 8, zIndex: 60,
          fontSize: 10, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)",
          padding: "2px 6px", background: "var(--bg-raised)",
          border: "1px solid var(--border)", borderRadius: 3,
        }}>{label}</div>
      )}
    </div>
  );
}

// shared faux-dashboard surface used as the under-modal background
function DashSurface() {
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg)" }}>
      <div style={{ height: 40, borderBottom: "1px solid var(--border)", background: "var(--bg-raised)", padding: "0 14px", display: "flex", alignItems: "center", fontSize: 12, color: "var(--fg-muted)" }}>
        Dashboard
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ height: 18, width: 220, background: "var(--bg-sunken)", borderRadius: 4 }} />
        <div style={{ marginTop: 12, height: 60, background: "var(--accent-soft)", borderRadius: "var(--radius-lg)" }} />
        <div style={{ marginTop: 16, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", height: 280 }} />
      </div>
    </div>
  );
}

function WorkspaceSurface() {
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg)" }}>
      <div style={{ height: 40, borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", height: "calc(100% - 40px)" }}>
        <div style={{ background: "var(--bg-inverse)", margin: 14, borderRadius: "var(--radius)" }} />
        <div style={{ margin: 14, marginLeft: 0, background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }} />
      </div>
    </div>
  );
}

// ---------- N · Start Session (from dashboard) ----------
function StartSessionModalN() {
  const [problem] = React.useState("Two Sum");
  const [section, setSection] = React.useState("p3");
  return (
    <ModalStage surface={<DashSurface/>}>
      <MModal
        title="Start a session"
        sub="Pick a problem and a section. The session opens immediately and pulls every connected student in."
        width={560}
        footer={<>
          <MBtn variant="ghost">Cancel</MBtn>
          <MBtn variant="quiet" icon="eye">Preview as student</MBtn>
          <MBtn variant="accent" icon="play">Start session</MBtn>
        </>}
        onClose={() => {}}
      >
        <MField label="Problem">
          <div style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius)",
            background: "var(--bg)",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11 }}>TS</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{problem}</div>
              <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Function · Python · 5 visible · 3 hidden tests</div>
            </div>
            <MBtn variant="quiet" size="sm" icon="search">Browse library</MBtn>
          </div>
        </MField>

        <MField label="Section" hint="Sections you teach. The active session will live on the projector for this section.">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { id: "p1", name: "CS A · Period 1", note: "23 enrolled · last met yesterday" },
              { id: "p3", name: "CS A · Period 3", note: "24 enrolled · meeting now" },
              { id: "p5", name: "CS A · Period 5", note: "22 enrolled · meets at 10:50" },
              { id: "p7", name: "CS B · Period 7", note: "19 enrolled · meets at 13:15" },
            ].map((s) => {
              const sel = section === s.id;
              return (
                <button key={s.id} onClick={() => setSection(s.id)} style={{
                  all: "unset", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: "var(--radius)",
                  border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
                  background: sel ? "var(--accent-soft)" : "var(--bg)",
                  cursor: "pointer",
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 8,
                    border: `4px solid ${sel ? "var(--accent)" : "var(--border-strong)"}`,
                    background: sel ? "var(--accent-fg)" : "var(--bg)",
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{s.note}</div>
                  </div>
                  {s.id === "p3" && <MPill tone="info" dot>meeting now</MPill>}
                </button>
              );
            })}
          </div>
        </MField>

        <div style={{ marginTop: 4, padding: 12, background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fg-muted)" }}>Join code</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>K7M-2A9</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fg-muted)" }}>Connected students</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--run)" }}>22 / 24</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fg-muted)" }}>What students see</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-muted)" }}>banner → jump-in</span>
          </div>
        </div>
      </MModal>
    </ModalStage>
  );
}

// ---------- O · Solution viewer (student opens reference) ----------
function SolutionViewerModalO() {
  const [tab, setTab] = React.useState("py");
  return (
    <ModalStage surface={<WorkspaceSurface/>}>
      <MModal
        title="Reference solution · Two Sum"
        sub="Released by Mr. Reeves after you solved this problem. Read it like a worked example, not a model answer."
        width={680}
        tone="info"
        footer={<>
          <MBtn variant="ghost" icon="copy">Copy</MBtn>
          <span style={{ flex: 1 }} />
          <MBtn variant="quiet">Back to my code</MBtn>
          <MBtn variant="accent">Got it</MBtn>
        </>}
        onClose={() => {}}
      >
        <MBanner tone="info" icon="info" title="You solved this on your second attempt"
          body="Your solution passed 5 / 5 visible tests + 3 / 3 hidden." />

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <MTabs value={tab} onChange={setTab} items={[
            { id: "py",   label: "solution.py" },
            { id: "note", label: "Notes" },
            { id: "diff", label: "vs. your r12" },
          ]}/>
        </div>

        {tab === "py" && (
          <MCode>
{`def two_sum(nums, target):
    """One pass over nums, store value→index in a dict.
       O(n) time, O(n) space."""
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return None`}
          </MCode>
        )}
        {tab === "note" && (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-muted)" }}>
            <p style={{ margin: "0 0 8px" }}><strong style={{ color: "var(--fg)" }}>Why a single pass?</strong> The brute-force <code style={{ fontFamily: "var(--font-mono)" }}>O(n²)</code> nested loop checks every pair. We can avoid the inner loop by remembering what we've seen.</p>
            <p style={{ margin: "8px 0" }}><strong style={{ color: "var(--fg)" }}>Edge cases.</strong> No solution → return <code style={{ fontFamily: "var(--font-mono)" }}>None</code>. Duplicate values are fine; <code style={{ fontFamily: "var(--font-mono)" }}>seen</code> stores the first index, and we always check before writing.</p>
            <p style={{ margin: "8px 0 0" }}><strong style={{ color: "var(--fg)" }}>Why not return tuples?</strong> The grader expects a list. Tuples would fail the equality check.</p>
          </div>
        )}
        {tab === "diff" && (
          <MCode>
{`  def two_sum(nums, target):
-     for i in range(len(nums)):
-         for j in range(i + 1, len(nums)):
-             if nums[i] + nums[j] == target:
-                 return [i, j]
-     return None
+     seen = {}
+     for i, n in enumerate(nums):
+         if target - n in seen:
+             return [seen[target - n], i]
+         seen[n] = i
+     return None`}
          </MCode>
        )}
      </MModal>
    </ModalStage>
  );
}

// ---------- P · Replay revisions ----------
function ReplayModalP() {
  const revisions = [
    { r: 13, t: "now",      ok: false, note: "fails on duplicates" },
    { r: 12, t: "1m ago",   ok: false, note: "off-by-one on empty" },
    { r: 11, t: "3m ago",   ok: false, note: "first failing run" },
    { r: 10, t: "5m ago",   ok: true,  note: "no tests run yet" },
    { r: 9,  t: "8m ago",   ok: true,  note: "wrote inner loop" },
    { r: 8,  t: "11m ago",  ok: true,  note: "renamed vars" },
  ];
  const [active, setActive] = React.useState(11);
  return (
    <ModalStage surface={<WorkspaceSurface/>}>
      <MModal
        title="Replay · Maya R. — Two Sum"
        sub="Step through Maya's revisions to see how this code arrived. r11 is the first failing run."
        width={780}
        footer={<>
          <MBtn variant="ghost" icon="download">Export script</MBtn>
          <span style={{ flex: 1 }} />
          <MBtn variant="quiet">Close</MBtn>
          <MBtn variant="accent" icon="send">Send to Maya</MBtn>
        </>}
        onClose={() => {}}
      >
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16, height: 380 }}>
          {/* revisions list */}
          <div style={{ overflow: "auto", borderRight: "1px solid var(--border)", paddingRight: 8 }}>
            {revisions.map((r) => {
              const sel = r.r === active;
              return (
                <button key={r.r} onClick={() => setActive(r.r)} style={{
                  all: "unset", display: "block", width: "100%",
                  padding: "8px 10px", borderRadius: "var(--radius)",
                  background: sel ? "var(--bg-sunken)" : "transparent",
                  cursor: "pointer", marginBottom: 2,
                  borderLeft: `3px solid ${sel ? "var(--accent)" : "transparent"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <MPill tone={r.ok ? "run" : "danger"} mono>r{r.r}</MPill>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{r.t}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 4, lineHeight: 1.4 }}>{r.note}</div>
                </button>
              );
            })}
          </div>
          {/* diff */}
          <div style={{ overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <MPill tone="danger" mono>r{active}</MPill>
              <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>vs. r{active - 1}</span>
              <span style={{ flex: 1 }} />
              <MIB icon="play" title="Auto-play" />
              <MIB icon="chevL" title="Previous" />
              <MIB icon="chevR" title="Next" />
            </div>
            <MCode>
{`  def two_sum(nums, target):
      seen = {}
      for i, n in enumerate(nums):
-         if target - n in seen:
+         if n in seen:
              return [seen[target - n], i]
          seen[n] = i
      return None`}
            </MCode>
            <div style={{ marginTop: 10, padding: 10, background: "var(--danger-soft)", borderRadius: "var(--radius)", fontSize: 12 }}>
              <strong style={{ color: "var(--danger)" }}>Test failed: </strong>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>two_sum([3,3], 6) → [None, 1]</span>
              <span style={{ color: "var(--fg-muted)" }}> · expected </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>[0, 1]</span>
            </div>
          </div>
        </div>
      </MModal>
    </ModalStage>
  );
}

// ---------- Q · Generate solution (author) ----------
function GenerateSolutionModalQ() {
  return (
    <ModalStage surface={<WorkspaceSurface/>}>
      <MModal
        title="Generate a solution"
        sub="From the problem statement, draft a reference solution you can edit. Generated code never publishes automatically."
        width={620}
        tone="accent"
        footer={<>
          <MBtn variant="ghost">Cancel</MBtn>
          <span style={{ flex: 1 }} />
          <MBtn variant="quiet" icon="refresh">Regenerate</MBtn>
          <MBtn variant="accent" icon="check">Use as solution.py</MBtn>
        </>}
        onClose={() => {}}
      >
        <MField label="Statement (read-only)">
          <div style={{ padding: 10, background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
            Given a list of integers <code style={{ fontFamily: "var(--font-mono)" }}>nums</code> and a target, return the indices of the two numbers that add up to the target. Each input has exactly one solution.
          </div>
        </MField>

        <MField label="Hints for the model" hint="Optional. Tone, constraints, idioms.">
          <MInput placeholder="Prefer a one-pass dict; comment the time complexity." />
        </MField>

        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--fg-muted)", marginTop: 4, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" defaultChecked /> Include docstring
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" defaultChecked /> Add type hints
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" /> Show two approaches
          </label>
        </div>

        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Draft</div>
        <MCode>
{`def two_sum(nums: list[int], target: int) -> list[int] | None:
    """Return indices i, j such that nums[i] + nums[j] == target.
       O(n) time using a single pass over nums."""
    seen: dict[int, int] = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return None`}
        </MCode>
        <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 11, color: "var(--fg-subtle)" }}>
          <MIcon name="info" size={11}/> Generated by Eval · 1.4s · 92 tokens. You're responsible for what you publish.
        </div>
      </MModal>
    </ModalStage>
  );
}

// ---------- R · Confirm destructive ----------
function ConfirmDeleteModalR() {
  return (
    <ModalStage surface={<DashSurface/>}>
      <MModal
        title="Delete Period 5?"
        sub="This permanently removes the section, its 22 student enrollments, and 18 past sessions. Problems in the library are not affected."
        width={460}
        tone="danger"
        footer={<>
          <MBtn variant="ghost">Cancel</MBtn>
          <MBtn variant="dangerFill" icon="trash">Delete section</MBtn>
        </>}
        onClose={() => {}}
      >
        <div style={{ padding: 12, background: "var(--danger-soft)", borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--danger)" }}>This can't be undone.</div>
          Students will lose access to their work in this section. Their accounts and enrollments in other sections stay intact.
        </div>
        <MField label={`Type "K8B-4Q1" to confirm`} style={{ marginTop: 12 }}>
          <MInput mono placeholder="K8B-4Q1" />
        </MField>
      </MModal>
    </ModalStage>
  );
}

// ---------- S · Publish to section ----------
function PublishModalS() {
  const [pickedSections, setPickedSections] = React.useState({ p3: true, p5: true });
  const togg = (k) => setPickedSections({ ...pickedSections, [k]: !pickedSections[k] });
  return (
    <ModalStage surface={<WorkspaceSurface/>}>
      <MModal
        title="Publish Two Sum"
        sub="Publishing makes this problem visible to students for solo practice. It does NOT start a session."
        width={560}
        footer={<>
          <MBtn variant="ghost">Cancel</MBtn>
          <span style={{ flex: 1 }} />
          <MBtn variant="quiet" icon="eye">Preview</MBtn>
          <MBtn variant="accent" icon="upload">Publish to 2 sections</MBtn>
        </>}
        onClose={() => {}}
      >
        <MField label="Visibility">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { id: "all", label: "Everyone with the link", note: "Anyone (incl. anon) can view; only enrolled students can run." },
              { id: "section", label: "Specific sections only", note: "Most teachers pick this. Students see it in Practice." },
              { id: "draft", label: "Keep as draft", note: "Only co-instructors can see it." },
            ].map((o, i) => (
              <label key={o.id} style={{
                display: "flex", gap: 10, padding: "8px 10px",
                border: `1px solid ${i === 1 ? "var(--accent)" : "var(--border)"}`,
                background: i === 1 ? "var(--accent-soft)" : "var(--bg)",
                borderRadius: "var(--radius)", cursor: "pointer",
              }}>
                <input type="radio" name="vis" defaultChecked={i === 1} style={{ marginTop: 3 }}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>{o.note}</div>
                </div>
              </label>
            ))}
          </div>
        </MField>

        <MField label="Sections">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              ["p1", "CS A · Period 1", 23],
              ["p3", "CS A · Period 3", 24],
              ["p5", "CS A · Period 5", 22],
              ["p7", "CS B · Period 7", 19],
            ].map(([k, n, c]) => (
              <label key={k} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px", borderRadius: "var(--radius)",
                cursor: "pointer", background: pickedSections[k] ? "var(--bg-sunken)" : "transparent",
              }}>
                <input type="checkbox" checked={!!pickedSections[k]} onChange={() => togg(k)} />
                <div style={{ flex: 1, fontSize: 13 }}>{n}</div>
                <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{c}</span>
              </label>
            ))}
          </div>
        </MField>

        <MField label="Reveal solution to students" hint="If on, students see your solution.py after they pass all visible tests. Hidden tests don't gate this.">
          <div style={{ display: "flex", gap: 6 }}>
            <MBtn variant="quiet" size="md">Never</MBtn>
            <MBtn variant="accent" size="md" icon="check">After they solve</MBtn>
            <MBtn variant="quiet" size="md">Immediately</MBtn>
          </div>
        </MField>
      </MModal>
    </ModalStage>
  );
}

// ---------- T · Create class ----------
function CreateClassModalT() {
  return (
    <ModalStage surface={<DashSurface/>}>
      <MModal
        title="New class"
        sub="A class is a long-running container. Sections are the meeting times that share its problem set."
        width={520}
        footer={<>
          <MBtn variant="ghost">Cancel</MBtn>
          <MBtn variant="accent" icon="plus">Create class</MBtn>
        </>}
        onClose={() => {}}
      >
        <MField label="Class name" hint="What students will see in their section list.">
          <MInput placeholder="CS A — Intro" autoFocus />
        </MField>
        <MField label="Description (optional)">
          <MInput placeholder="Python fundamentals · semester long" />
        </MField>
        <MField label="Add sections now" hint="You can add more later. Join codes generate automatically.">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["Period 1", "Period 3", "Period 5"].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <MIcon name="layers" size={12} style={{ color: "var(--fg-subtle)" }}/>
                <span style={{ flex: 1, fontSize: 12.5 }}>{s}</span>
                <MIB icon="x" title="Remove"/>
              </div>
            ))}
            <button style={{ all: "unset", padding: "6px 10px", fontSize: 12.5, color: "var(--accent-ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <MIcon name="plus" size={11}/> Add section
            </button>
          </div>
        </MField>
      </MModal>
    </ModalStage>
  );
}

Object.assign(window, {
  StartSessionModalN, SolutionViewerModalO, ReplayModalP, GenerateSolutionModalQ,
  ConfirmDeleteModalR, PublishModalS, CreateClassModalT,
});
