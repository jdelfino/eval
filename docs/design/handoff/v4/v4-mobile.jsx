/* ============================================================
   v4 — Mobile artboards
   U · Public problem view (mobile)
   V · Auth / landing (mobile)
   W · Sign-in (mobile)
   X · Section overview (student, mobile)
   ============================================================ */
const { Btn: MoBtn, Pill: MoPill, Icon: MoIcon, IconBtn: MoIB,
        MobileFrame: MoFrame, Field: MoField, Input: MoInput,
        ConnectionDot: MoDot } = window.EvalUI;

function MobileTopBar({ title, back, right }) {
  return (
    <div style={{
      height: 44, padding: "0 12px", flexShrink: 0,
      display: "flex", alignItems: "center", gap: 8,
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-raised)",
    }}>
      {back && <MoIB icon="chevL" title="Back" />}
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{title}</div>
      {right}
    </div>
  );
}

function MobileTabBar({ active = "sections" }) {
  const items = [
    { id: "sections", icon: "layers", label: "Sections" },
    { id: "practice", icon: "book",   label: "Practice" },
    { id: "history",  icon: "history", label: "History" },
    { id: "me",       icon: "users",  label: "Me" },
  ];
  return (
    <div style={{
      height: 56, flexShrink: 0,
      borderTop: "1px solid var(--border)",
      background: "var(--bg-raised)",
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
    }}>
      {items.map((i) => {
        const sel = i.id === active;
        return (
          <button key={i.id} style={{
            all: "unset", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
            color: sel ? "var(--accent-ink)" : "var(--fg-subtle)",
            cursor: "pointer",
          }}>
            <MoIcon name={i.icon} size={18} />
            <span style={{ fontSize: 10, fontWeight: sel ? 600 : 500 }}>{i.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- U · Public problem view (mobile) ----------
function PublicProblemMobileU() {
  return (
    <MoFrame width={390} height={780}>
      <MobileTopBar
        title="Two Sum"
        back
        right={<MoIB icon="more" title="More" />}
      />
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--fg-subtle)" }}>Public problem · Function</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, letterSpacing: -0.5, margin: "6px 0 4px" }}>Two Sum</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MoPill>arrays</MoPill><MoPill>hash-map</MoPill><MoPill>warmup</MoPill>
          </div>
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
          Given a list of integers <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>nums</code> and a target, return the indices of the two numbers that add up to the target.
        </div>

        <div style={{ background: "var(--bg-inverse)", color: "var(--fg-inverse)", padding: 12, borderRadius: "var(--radius)", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7 }}>
          <div>two_sum([2,7,11,15], 9)</div>
          <div style={{ color: "var(--accent)" }}># → [0, 1]</div>
        </div>

        <div style={{ background: "var(--accent-soft)", padding: 12, borderRadius: "var(--radius)", fontSize: 12.5, color: "var(--fg)" }}>
          <div style={{ fontWeight: 600, color: "var(--accent-ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <MoIcon name="info" size={12}/> Coding works best on a laptop
          </div>
          <div style={{ color: "var(--fg-muted)", marginTop: 4 }}>
            You can read the problem here, but you'll write code on a bigger screen.
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <MoBtn variant="accent" size="lg" fullWidth icon="arrowR">Open on laptop</MoBtn>
          <MoBtn variant="outline" size="lg" fullWidth icon="link">Copy link</MoBtn>
        </div>
      </div>
    </MoFrame>
  );
}

// ---------- V · Landing (mobile) ----------
function PublicLandingMobileV() {
  return (
    <MoFrame width={390} height={780}>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: "var(--accent)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--accent-fg)",
          }}>e</div>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 500 }}>Eval</span>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--accent-ink)" }}>For CS classrooms</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 30, fontWeight: 400, letterSpacing: -0.8, margin: "8px 0 10px", lineHeight: 1.1 }}>
            A workshop, not a leaderboard.
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: 0 }}>
            Live sessions, per-student progress, a problem library — without the gamified noise.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MoBtn variant="accent" size="lg" fullWidth icon="arrowR">I have a join code</MoBtn>
          <MoBtn variant="outline" size="lg" fullWidth>Sign in</MoBtn>
        </div>

        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
          The full product runs in a browser on a laptop. This page just gets you in.
        </div>

        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--fg-subtle)", display: "flex", gap: 10 }}>
          <span>© 2026 Eval</span><a>Terms</a><a>Privacy</a>
        </div>
      </div>
    </MoFrame>
  );
}

// ---------- W · Sign-in (mobile) ----------
function SignInMobileW() {
  return (
    <MoFrame width={390} height={780}>
      <MobileTopBar title="Sign in" back />
      <div style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "var(--accent-soft)", padding: 12, borderRadius: "var(--radius)", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: "var(--accent-ink)" }}>
          <MoIcon name="info" size={14} style={{ marginTop: 2 }}/>
          <div>Joining a class? <a style={{ textDecoration: "underline" }}>Use a join code →</a></div>
        </div>

        <MoBtn variant="outline" size="lg" fullWidth icon="globe">Continue with Google</MoBtn>
        <MoBtn variant="outline" size="lg" fullWidth icon="users">Continue with Clever</MoBtn>
        <MoBtn variant="outline" size="lg" fullWidth icon="lock">School SSO</MoBtn>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0", color: "var(--fg-subtle)", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} /><span>or email link</span><div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <MoField label="Email">
          <MoInput placeholder="you@school.edu" />
        </MoField>
        <MoBtn variant="accent" size="lg" fullWidth icon="send">Send sign-in link</MoBtn>

        <div style={{ marginTop: "auto", fontSize: 11, color: "var(--fg-subtle)", textAlign: "center" }}>
          We'll email you a one-time link. No password.
        </div>
      </div>
    </MoFrame>
  );
}

// ---------- X · Section overview (student, mobile) ----------
function StudentSectionMobileX() {
  return (
    <MoFrame width={390} height={780}>
      <MobileTopBar
        title="Period 3"
        back
        right={<MoIB icon="bell" title="Notifications" />}
      />
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* live banner */}
        <div style={{
          margin: 12, padding: "12px 14px",
          background: "var(--accent)", color: "var(--accent-fg)",
          borderRadius: "var(--radius-lg)",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "var(--shadow-lg)",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent-fg)", boxShadow: "0 0 0 3px oklch(1 0 0 / 0.2)" }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.85 }}>Live now</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Two Sum</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Mr. Reeves · started 11m ago</div>
          </div>
          <MoIcon name="arrowR" size={16} />
        </div>

        <div style={{ padding: "0 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--fg-subtle)", margin: "8px 4px" }}>Practice</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { name: "Reverse List",   status: "solved",      meta: "all visible · 7 revisions" },
              { name: "Binary Search",  status: "solved",      meta: "all visible · 12 revisions" },
              { name: "Anagrams",       status: "in-progress", meta: "1/4 visible passing" },
              { name: "FizzBuzz",       status: "not-started", meta: "no work yet" },
            ].map((p, i) => (
              <div key={i} style={{
                background: "var(--bg-raised)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "10px 12px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 4,
                  background: p.status === "solved" ? "var(--run-soft)" : p.status === "in-progress" ? "var(--warn-soft)" : "var(--bg-sunken)",
                  color: p.status === "solved" ? "var(--run)" : p.status === "in-progress" ? "var(--warn)" : "var(--fg-subtle)",
                  display: "grid", placeItems: "center",
                }}>
                  <MoIcon name={p.status === "solved" ? "check" : p.status === "in-progress" ? "edit" : "square"} size={12}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{p.meta}</div>
                </div>
                <MoIcon name="chevR" size={12} style={{ color: "var(--fg-subtle)" }}/>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--fg-subtle)", margin: "16px 4px 6px" }}>Past sessions</div>
          {[
            ["Mon", "Binary Search", "solved"],
            ["Last Thu", "Reverse List", "solved"],
            ["Last Tue", "Hello, World", "solved"],
          ].map(([d, n, s], i) => (
            <div key={i} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div>{n}</div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{d}</div>
              </div>
              <MoPill tone="run" dot>solved</MoPill>
            </div>
          ))}
        </div>
      </div>
      <MobileTabBar active="sections"/>
    </MoFrame>
  );
}

Object.assign(window, { PublicProblemMobileU, PublicLandingMobileV, SignInMobileW, StudentSectionMobileX });
