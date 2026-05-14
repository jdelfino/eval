/* ============================================================
   v4 chrome — AppShell wraps Sidebar + AppBarLite + content,
   Mock data shared by surfaces.
   ============================================================ */
const { ScreenShell } = window.EvalUI;
const V4 = window.EvalUI4;

const NAV_INSTRUCTOR = [
  { section: "Teach" },
  { icon: "home",    label: "Dashboard",  active: true },
  { icon: "users",   label: "Classes",    count: 3 },
  { icon: "layers",  label: "Sections",   count: 7 },
  { icon: "book",    label: "Library",    count: 142 },
  { section: "Live" },
  { icon: "zap",     label: "Sessions",   count: 1, badge: { tone: "run", text: "1 live" } },
  { icon: "history", label: "Past sessions" },
  { label: "—" },
  { icon: "settings", label: "Settings" },
  { icon: "info",     label: "Help" },
];
const NAV_STUDENT = [
  { section: "My work" },
  { icon: "layers",  label: "My sections", active: true, count: 2 },
  { icon: "book",    label: "Practice",    count: 142 },
  { icon: "history", label: "History" },
  { label: "—" },
  { icon: "info",    label: "Help" },
];

function AppShell({ direction = "workshop", role = "instructor", collapsed, breadcrumb, right, activeSession, children, contentBg }) {
  const items = role === "instructor" ? NAV_INSTRUCTOR : NAV_STUDENT;
  const user = role === "instructor"
    ? { initials: "MR", name: "Marcus Reeves", role: "Instructor" }
    : { initials: "EM", name: "Eli Martinez", role: "Student · Period 3" };
  return (
    <ScreenShell direction={direction} style={{ flexDirection: "row" }}>
      <V4.Sidebar
        collapsed={collapsed}
        items={items}
        namespace={role === "instructor" ? "Lincoln HS · CS" : "Lincoln HS"}
        user={user}
        activeSession={activeSession}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: contentBg || "var(--bg)" }}>
        <V4.AppBarLite breadcrumb={breadcrumb} right={right} />
        <div style={{ flex: 1, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </ScreenShell>
  );
}

// ---------- Page header (used inside content area) ----------
function PageHeader({ eyebrow, title, sub, right, meta }) {
  return (
    <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
      {eyebrow && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--fg-subtle)", marginBottom: 4 }}>{eyebrow}</div>}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 500, letterSpacing: -0.6, margin: 0, color: "var(--fg)" }}>{title}</h1>
          {sub && <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 4 }}>{sub}</div>}
          {meta && <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "var(--fg-muted)" }}>{meta}</div>}
        </div>
        {right && <div style={{ display: "flex", gap: 8 }}>{right}</div>}
      </div>
    </div>
  );
}

// shared header right-side cluster
function HeaderRight({ status = "live" }) {
  return (
    <>
      <V4.ConnectionDot status={status} />
      <V4.IconBtn icon="search" title="Search ⌘K" />
      <V4.IconBtn icon="bell" title="Notifications" />
    </>
  );
}

window.V4Shell = { AppShell, PageHeader, HeaderRight };
