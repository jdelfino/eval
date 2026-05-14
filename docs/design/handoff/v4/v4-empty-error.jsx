/* ============================================================
   v4 — Empty + error states
   Y · 404 (page-level)
   Z · 403 — code expired (join code dead)
   AA · 500 — server error
   AB · Offline / reconnecting
   AC · Empty section (no problems published yet)
   AD · Empty library (instructor)
   AE · Loading dashboard (skeleton)
   ============================================================ */
const { Btn: ErBtn, EmptyFrame: ErEmpty, Skeleton: ErSkel,
        Banner: ErBanner, Pill: ErPill, Icon: ErIcon } = window.EvalUI;
const { AppShell: ErShell, PageHeader: ErHeader, HeaderRight: ErHR } = window.V4Shell;

// shared full-page chrome for error states (no sidebar — they happen pre-auth or pre-context)
function ErrorPage({ children, footerNote }) {
  return (
    <window.EvalUI.ScreenShell direction="workshop">
      <header style={{
        height: 52, padding: "0 24px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-raised)",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5, background: "var(--accent)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--accent-fg)",
          }}>e</div>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500 }}>Eval</span>
        </div>
        <div style={{ flex: 1 }} />
        <a style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Help</a>
        <ErBtn variant="quiet">Sign in</ErBtn>
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
      {footerNote && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 24px", fontSize: 11, color: "var(--fg-subtle)" }}>
          {footerNote}
        </div>
      )}
    </window.EvalUI.ScreenShell>
  );
}

// ---------- Y · 404 ----------
function NotFoundY() {
  return (
    <ErrorPage footerNote="If you followed a link, the problem may have been unpublished. Ask whoever shared it.">
      <ErEmpty
        code="404 · Not found"
        icon="link"
        title="That problem isn't here anymore."
        body="It may have been unpublished, deleted, or never existed at this URL. Check the link, or pick something from the library."
        primary={<ErBtn variant="accent" icon="search">Browse library</ErBtn>}
        secondary={<ErBtn variant="quiet">Back home</ErBtn>}
      />
    </ErrorPage>
  );
}

// ---------- Z · Join code expired ----------
function JoinCodeExpiredZ() {
  return (
    <ErrorPage>
      <ErEmpty
        code="403 · Join code"
        tone="warn"
        icon="lock"
        title="That join code isn't active."
        body="K7M-2A9 has expired or been rotated. Ask your teacher for the current code, or paste a new one below."
        primary={<ErBtn variant="accent" icon="arrowR">Try a new code</ErBtn>}
        secondary={<ErBtn variant="quiet">Sign in instead</ErBtn>}
      />
    </ErrorPage>
  );
}

// ---------- AA · 500 ----------
function ServerError500AA() {
  return (
    <ErrorPage footerNote="Incident ID e_5fa2c9 · 14:02 UTC · auto-reported.">
      <ErEmpty
        code="500 · Something on our end"
        tone="danger"
        icon="alert"
        title="We hit an error loading this page."
        body="Your work is safe — sessions and code drafts persist locally. Refresh, or wait a minute and try again. If you're an instructor mid-session, students stay connected."
        primary={<ErBtn variant="accent" icon="refresh">Try again</ErBtn>}
        secondary={<ErBtn variant="quiet" icon="info">Status page</ErBtn>}
      />
    </ErrorPage>
  );
}

// ---------- AB · Offline / reconnecting (mid-session) ----------
function OfflineAB() {
  return (
    <ErShell role="student" breadcrumb={["My sections", "Period 3", "Two Sum"]}
      right={<>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, padding: "0 8px", height: 22, borderRadius: 11, background: "var(--danger-soft)", color: "var(--danger)", fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--danger)" }}/>
          Offline · reconnecting
        </span>
      </>}
      activeSession={{ name: "Two Sum · Period 3" }}>
      <ErHeader
        eyebrow="Live session · Period 3"
        title="Two Sum"
        sub="You'll keep editing locally. We'll sync your work when the connection comes back."
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <ErBanner tone="danger" icon="wifi" title="No connection"
          body="Last synced 38s ago. Your code is saved on this device." />
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What still works</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["Editing", true],
              ["Reading the statement", true],
              ["Local test runs (visible)", true],
              ["Hidden tests", false],
              ["Submitting", false],
              ["Syncing to your teacher", false],
            ].map(([label, ok], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <ErIcon name={ok ? "check" : "x"} size={12} style={{ color: ok ? "var(--run)" : "var(--danger)" }} />
                <span style={{ color: ok ? "var(--fg)" : "var(--fg-subtle)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ErBtn variant="quiet" icon="refresh">Retry now</ErBtn>
          <ErBtn variant="ghost">Continue offline</ErBtn>
        </div>
      </div>
    </ErShell>
  );
}

// ---------- AC · Empty section (instructor, no problems yet) ----------
function EmptySectionAC() {
  return (
    <ErShell role="instructor" breadcrumb={["Classes", "CS A · Period 3"]} right={<ErHR/>}>
      <ErHeader
        eyebrow="Section · 24 students · join code K7M-2A9"
        title="Period 3 — CS A"
        sub="No problems are published to this section yet. Publish one, or start an ad-hoc session."
        right={<>
          <ErBtn variant="quiet" icon="copy">Copy join code</ErBtn>
          <ErBtn variant="accent" icon="play">Start session</ErBtn>
        </>}
      />
      <div style={{ padding: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[
          { title: "Pull from your library", body: "142 problems you've already authored. Tag them by unit or topic.", icon: "book", action: "Browse library", primary: true },
          { title: "Author a new problem", body: "Start from a blank statement, or generate a draft from a description.", icon: "edit", action: "New problem" },
          { title: "Use a starter pack", body: "Five Python warm-ups · Recursion intro · Linked-list basics · Dictionaries 101.", icon: "layers", action: "Browse packs" },
          { title: "Import from a colleague", body: "Co-instructors at Lincoln HS · CS can share problem sets across classes.", icon: "users", action: "Open shared" },
        ].map((c, i) => (
          <div key={i} style={{
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", padding: 18,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: c.primary ? "var(--accent-soft)" : "var(--bg-sunken)",
              color: c.primary ? "var(--accent-ink)" : "var(--fg-muted)",
              display: "grid", placeItems: "center",
            }}>
              <ErIcon name={c.icon} size={16}/>
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, letterSpacing: -0.2 }}>{c.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, flex: 1 }}>{c.body}</div>
            <div>
              <ErBtn variant={c.primary ? "accent" : "quiet"} icon="arrowR">{c.action}</ErBtn>
            </div>
          </div>
        ))}
      </div>
    </ErShell>
  );
}

// ---------- AD · Empty library ----------
function EmptyLibraryAD() {
  return (
    <ErShell role="instructor" breadcrumb={["Library"]} right={<ErHR/>}>
      <ErHeader title="Library" sub="Every problem you've authored, ever. Tagged, filterable, reusable across classes." right={<ErBtn variant="accent" icon="plus">New problem</ErBtn>}/>
      <ErEmpty
        icon="book"
        tone="accent"
        title="Your library is empty."
        body="Author a problem from scratch, or grab a vetted starter pack to get going. Anything you publish to a section ends up here, tagged."
        primary={<ErBtn variant="accent" icon="plus">Author a problem</ErBtn>}
        secondary={<ErBtn variant="quiet" icon="layers">Starter packs</ErBtn>}
      />
    </ErShell>
  );
}

// ---------- AE · Loading dashboard (skeleton) ----------
function LoadingDashboardAE() {
  return (
    <ErShell role="instructor" breadcrumb={["Dashboard"]} right={<ErHR/>}>
      <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--border)" }}>
        <ErSkel w={120} h={10} />
        <ErSkel w={260} h={26} style={{ marginTop: 10 }}/>
        <ErSkel w={420} h={12} style={{ marginTop: 10 }}/>
      </div>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft)", borderRadius: "var(--radius-lg)", padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <ErSkel w={10} h={10} r={5}/>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <ErSkel w={200} h={12}/>
            <ErSkel w={120} h={10}/>
          </div>
          <ErSkel w={120} h={28} r={6}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14 }}>
            {[1,2,3,4].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 1 ? "1px solid var(--border)" : "none" }}>
                <ErSkel w={140} h={12}/>
                <div style={{ flex: 1 }}/>
                <ErSkel w={50} h={10}/>
                <ErSkel w={70} h={20} r={10}/>
                <ErSkel w={80} h={24} r={6}/>
              </div>
            ))}
          </div>
          <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <ErSkel w={80} h={10}/>
            {[1,2,3,4].map((i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                <ErSkel w={90} h={10}/>
                <ErSkel w={30} h={10}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErShell>
  );
}

Object.assign(window, {
  NotFoundY, JoinCodeExpiredZ, ServerError500AA, OfflineAB,
  EmptySectionAC, EmptyLibraryAD, LoadingDashboardAE,
});
