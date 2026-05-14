/* ============================================================
   Eval — v4 primitives. Extends primitives.jsx with new chrome
   (Sidebar, MobileChrome), feedback (Modal, Toast, Banner,
   ConnectionDot), structure (EmptyFrame, Skeleton, IconBtn,
   Tabs, Field, KeyCap), and small surfaces. All read CSS vars
   set by ScreenShell + applyEvalTokens.
   ============================================================ */

const { Btn: V3Btn, Pill, Frame, Kbd, Avatar } = window.EvalUI;

// ---------- Icon (line, 16px, currentColor) ----------
// Hand-rolled minimal set; never write complex SVGs.
const ICON_PATHS = {
  home:        "M3 8l5-5 5 5v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z",
  layers:      "M8 2L2 5l6 3 6-3-6-3zm-6 6l6 3 6-3M2 11l6 3 6-3",
  book:        "M3 3h7a3 3 0 0 1 3 3v7H6a3 3 0 0 1-3-3V3zm10 0h0M3 3v10",
  users:       "M5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 13c0-2 1.5-3 3-3s3 1 3 3m1 0c0-2 1.5-3 3-3s3 1 3 3",
  zap:         "M9 2L3 9h4l-1 5 6-7H8l1-5z",
  search:      "M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z",
  chevR:       "M6 3l4 5-4 5",
  chevL:       "M10 3L6 8l4 5",
  chevD:       "M3 6l5 4 5-4",
  chevU:       "M3 10l5-4 5 4",
  plus:        "M8 3v10M3 8h10",
  x:           "M3 3l10 10M13 3L3 13",
  check:       "M3 8l3 3 7-7",
  alert:       "M8 2l6 11H2L8 2zM8 6v3M8 11.5v.5",
  info:        "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-9v.5M8 7v4",
  play:        "M4 3l9 5-9 5V3z",
  pause:       "M5 3v10M11 3v10",
  square:      "M3 3h10v10H3z",
  menu:        "M2 4h12M2 8h12M2 12h12",
  more:        "M3 8h.01M8 8h.01M13 8h.01",
  settings:    "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2",
  bell:        "M4 11V7a4 4 0 1 1 8 0v4l1 2H3l1-2zM6 14h4",
  lock:        "M4 7h8v6H4zM6 7V5a2 2 0 1 1 4 0v2",
  globe:       "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8h13M8 1.5C5 4 5 12 8 14.5M8 1.5c3 2.5 3 10.5 0 13",
  copy:        "M5 5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2M3 5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  edit:        "M11 2l3 3-8 8H3v-3l8-8zM10 3l3 3",
  trash:       "M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4l1 9h4l1-9",
  download:    "M8 2v8M5 7l3 3 3-3M3 13h10",
  arrowR:      "M3 8h10M9 4l4 4-4 4",
  arrowL:      "M13 8H3M7 4L3 8l4 4",
  upload:      "M8 11V3M5 6l3-3 3 3M3 13h10",
  refresh:     "M2.5 8a5.5 5.5 0 0 1 9.5-3.5L13 6M13.5 8a5.5 5.5 0 0 1-9.5 3.5L3 10M13 3v3h-3M3 13v-3h3",
  wifi:        "M2 6a9 9 0 0 1 12 0M4 9a6 6 0 0 1 8 0M6 12a3 3 0 0 1 4 0M8 14h.01",
  link:        "M7 9a3 3 0 0 1 0-4l2-2a3 3 0 1 1 4 4l-1 1M9 7a3 3 0 0 1 0 4l-2 2a3 3 0 1 1-4-4l1-1",
  flag:        "M3 14V2M3 2h9l-2 3 2 3H3",
  send:        "M14 2L2 8l5 1 1 5 6-12z",
  filter:      "M2 3h12l-5 6v5l-2-1V9L2 3z",
  sort:        "M5 3v10M2 10l3 3 3-3M11 13V3M14 6l-3-3-3 3",
  eye:         "M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  history:     "M8 4v4l3 2M8 1.5a6.5 6.5 0 1 0 6.5 6.5M2 4l-.5 3 3 .5",
  star:        "M8 2l1.8 4 4.2.5-3 3 .8 4.5-4-2-4 2 .8-4.5-3-3 4.2-.5L8 2z",
};

function Icon({ name, size = 14, stroke = 1.6, style }) {
  const d = ICON_PATHS[name];
  if (!d) return <span style={{ width: size, height: size, ...style }} />;
  const fillRoutes = new Set([]); // currently none
  return (
    <svg width={size} height={size} viewBox="0 0 16 16"
      fill={fillRoutes.has(name) ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: "inline-block", ...style }}>
      <path d={d} />
    </svg>
  );
}

// ---------- Re-exported / improved Btn (carries icon name now) ----------
function Btn({ children, variant = "ghost", size = "sm", icon, kbd, onClick, style, fullWidth, disabled, title }) {
  const h = size === "sm" ? 24 : size === "md" ? 28 : size === "lg" ? 34 : 24;
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: h, padding: size === "lg" ? "0 14px" : size === "md" ? "0 10px" : "0 8px",
    fontFamily: "var(--font-sans)",
    fontSize: size === "lg" ? 13 : size === "sm" ? 12 : 12.5,
    fontWeight: 500,
    borderRadius: "var(--radius)",
    cursor: disabled ? "default" : "pointer",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    width: fullWidth ? "100%" : undefined,
    opacity: disabled ? 0.55 : 1,
  };
  const variants = {
    ghost:    { background: "transparent", color: "var(--fg-muted)", border: "1px solid transparent" },
    quiet:    { background: "var(--bg-sunken)", color: "var(--fg)", border: "1px solid var(--border)" },
    outline:  { background: "var(--bg-raised)", color: "var(--fg)", border: "1px solid var(--border-strong)" },
    primary:  { background: "var(--fg)", color: "var(--bg)", border: "1px solid var(--fg)" },
    accent:   { background: "var(--accent)", color: "var(--accent-fg)", border: "1px solid var(--accent)" },
    run:      { background: "var(--run)", color: "var(--accent-fg)", border: "1px solid var(--run)", fontWeight: 600 },
    danger:   { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" },
    dangerFill: { background: "var(--danger)", color: "var(--accent-fg)", border: "1px solid var(--danger)" },
    inverse:  { background: "var(--bg-inverse-raised)", color: "var(--fg-inverse)", border: "1px solid var(--border-inverse)" },
    link:     { background: "transparent", color: "var(--accent-ink)", border: "1px solid transparent", textDecoration: "underline", textDecorationColor: "var(--accent-soft)", textUnderlineOffset: 3 },
  };
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {icon && (typeof icon === "string" ? <Icon name={icon} /> : <span style={{ display: "inline-flex" }}>{icon}</span>)}
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

function IconBtn({ icon, title, onClick, style, active, size = 24 }) {
  return (
    <button title={title} onClick={onClick}
      style={{
        width: size, height: size, padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: active ? "var(--bg-sunken)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg-muted)",
        border: "1px solid " + (active ? "var(--border)" : "transparent"),
        borderRadius: "var(--radius)",
        cursor: "pointer",
        ...style,
      }}>
      <Icon name={icon} size={14} />
    </button>
  );
}

// ---------- Sidebar ----------
function Sidebar({ collapsed = false, items, namespace, user, activeSession, onToggle, footer }) {
  const W = collapsed ? 56 : 232;
  return (
    <aside style={{
      width: W, flexShrink: 0,
      borderRight: "1px solid var(--border)",
      background: "var(--bg-raised)",
      display: "flex", flexDirection: "column",
      transition: "width .15s",
    }}>
      {/* logomark + namespace */}
      <div style={{
        height: 48, padding: collapsed ? "0 12px" : "0 12px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          background: "var(--accent)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14,
          color: "var(--accent-fg)", flexShrink: 0,
        }}>e</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>Eval</div>
            <button style={{
              all: "unset", display: "flex", alignItems: "center", gap: 4,
              fontSize: 11, color: "var(--fg-muted)", cursor: "pointer",
              maxWidth: "100%",
            }} title={namespace}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namespace}</span>
              <Icon name="chevD" size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Active-session banner (lives here today) */}
      {activeSession && (
        <div style={{
          margin: collapsed ? 6 : 10,
          padding: collapsed ? 6 : "8px 10px",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-soft)",
          borderRadius: "var(--radius)",
          display: "flex", alignItems: collapsed ? "center" : "flex-start",
          gap: 8, flexDirection: collapsed ? "column" : "row",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: 4,
            background: "var(--run)", flexShrink: 0,
            boxShadow: "0 0 0 3px var(--run-soft)",
            marginTop: collapsed ? 0 : 4,
          }} />
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent-ink)", letterSpacing: 0.2, textTransform: "uppercase" }}>Live session</div>
              <div style={{ fontSize: 12, color: "var(--fg)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeSession.name}</div>
              <a style={{ fontSize: 11, color: "var(--accent-ink)", textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer", marginTop: 4, display: "inline-block" }}>Rejoin →</a>
            </div>
          )}
        </div>
      )}

      {/* nav */}
      <nav style={{ flex: 1, padding: 6, overflow: "auto" }}>
        {items.map((it, i) => (
          it.label === "—" ? (
            <div key={i} style={{ height: 1, background: "var(--border)", margin: "6px 8px" }} />
          ) : it.section ? (
            !collapsed && <div key={i} style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--fg-subtle)", padding: "10px 10px 4px" }}>{it.section}</div>
          ) : (
            <a key={i} title={collapsed ? it.label : undefined} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: collapsed ? "0 16px" : "0 10px",
              height: 30, borderRadius: "var(--radius)",
              fontSize: 12.5, fontWeight: it.active ? 600 : 500,
              color: it.active ? "var(--fg)" : "var(--fg-muted)",
              background: it.active ? "var(--bg-sunken)" : "transparent",
              cursor: "pointer", textDecoration: "none",
              position: "relative",
            }}>
              {it.active && !collapsed && (
                <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: "var(--accent)" }} />
              )}
              <Icon name={it.icon} size={14} style={{ color: it.active ? "var(--accent)" : "var(--fg-subtle)" }} />
              {!collapsed && <span style={{ flex: 1 }}>{it.label}</span>}
              {!collapsed && it.count != null && <span style={{ fontSize: 10, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{it.count}</span>}
              {!collapsed && it.badge && <Pill tone={it.badge.tone}>{it.badge.text}</Pill>}
            </a>
          )
        ))}
      </nav>

      {/* footer: user + collapse */}
      <div style={{
        padding: 8, borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 12,
          background: "var(--bg-sunken)", border: "1px solid var(--border)",
          display: "grid", placeItems: "center",
          fontSize: 10, fontWeight: 600, color: "var(--fg-muted)",
          flexShrink: 0,
        }}>{user?.initials || "—"}</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{user?.role}</div>
            </div>
            <IconBtn icon="settings" title="Settings" />
          </>
        )}
        <IconBtn icon={collapsed ? "chevR" : "chevL"} onClick={onToggle} title={collapsed ? "Expand" : "Collapse"} />
      </div>
      {footer}
    </aside>
  );
}

// ---------- Modal ----------
function Modal({ title, sub, children, footer, width = 520, onClose, tone, danger }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      background: "oklch(0.18 0.012 80 / 0.42)",
      backdropFilter: "blur(2px)",
      display: "grid", placeItems: "center",
      padding: 20,
    }}>
      <div style={{
        width, maxWidth: "100%", maxHeight: "100%",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <header style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          {tone && (
            <div style={{
              width: 28, height: 28, borderRadius: 14,
              background: tone === "danger" ? "var(--danger-soft)"
                : tone === "warn" ? "var(--warn-soft)"
                : tone === "info" ? "var(--info-soft)"
                : "var(--accent-soft)",
              color: tone === "danger" ? "var(--danger)"
                : tone === "warn" ? "var(--warn)"
                : tone === "info" ? "var(--info)"
                : "var(--accent-ink)",
              display: "grid", placeItems: "center",
              flexShrink: 0,
            }}>
              <Icon name={tone === "danger" ? "alert" : tone === "warn" ? "alert" : "info"} size={14} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.2 }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{sub}</div>}
          </div>
          <IconBtn icon="x" onClick={onClose} title="Close" />
        </header>
        <div style={{ flex: 1, padding: 16, overflow: "auto", fontSize: 13, lineHeight: 1.5 }}>
          {children}
        </div>
        {footer && (
          <footer style={{
            padding: 12, borderTop: "1px solid var(--border)",
            background: "var(--bg-sunken)",
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          }}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ---------- Toast / Banner ----------
function Toast({ tone = "neutral", title, body, action, onDismiss, icon }) {
  const tones = {
    neutral: { fg: "var(--fg)",      bg: "var(--bg-raised)",  border: "var(--border-strong)" },
    success: { fg: "var(--run)",     bg: "var(--bg-raised)",  border: "var(--run-soft)" },
    warn:    { fg: "var(--warn)",    bg: "var(--bg-raised)",  border: "var(--warn-soft)" },
    danger:  { fg: "var(--danger)",  bg: "var(--bg-raised)",  border: "var(--danger-soft)" },
    info:    { fg: "var(--info)",    bg: "var(--bg-raised)",  border: "var(--info-soft)" },
  };
  const t = tones[tone];
  return (
    <div style={{
      width: 360, maxWidth: "100%",
      background: t.bg, border: `1px solid ${t.border}`,
      borderLeft: `3px solid ${t.fg}`,
      borderRadius: "var(--radius)",
      boxShadow: "var(--shadow-lg)",
      padding: "10px 12px",
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <Icon name={icon || (tone === "success" ? "check" : tone === "danger" ? "alert" : tone === "warn" ? "alert" : "info")}
        size={14} style={{ color: t.fg, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</div>
        {body && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>{body}</div>}
        {action && <div style={{ marginTop: 6 }}>{action}</div>}
      </div>
      {onDismiss && <IconBtn icon="x" onClick={onDismiss} title="Dismiss" />}
    </div>
  );
}

function Banner({ tone = "info", icon, title, body, action, onDismiss }) {
  const tones = {
    info:    { bg: "var(--info-soft)",   fg: "var(--info)",   ink: "var(--fg)" },
    warn:    { bg: "var(--warn-soft)",   fg: "var(--warn)",   ink: "var(--fg)" },
    danger:  { bg: "var(--danger-soft)", fg: "var(--danger)", ink: "var(--fg)" },
    accent:  { bg: "var(--accent-soft)", fg: "var(--accent-ink)", ink: "var(--fg)" },
    run:     { bg: "var(--run-soft)",    fg: "var(--run)",    ink: "var(--fg)" },
  };
  const t = tones[tone];
  return (
    <div style={{
      background: t.bg, color: t.ink,
      padding: "8px 12px",
      borderRadius: "var(--radius)",
      display: "flex", alignItems: "center", gap: 10,
      fontSize: 12.5,
    }}>
      <Icon name={icon || "info"} size={14} style={{ color: t.fg, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        {body && <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>{body}</span>}
      </div>
      {action}
      {onDismiss && <IconBtn icon="x" onClick={onDismiss} />}
    </div>
  );
}

// ---------- Connection status dot ----------
function ConnectionDot({ status = "live", compact = false }) {
  const map = {
    live:     { color: "var(--run)",    soft: "var(--run-soft)",    label: "Live" },
    warming:  { color: "var(--warn)",   soft: "var(--warn-soft)",   label: "Warming up" },
    offline:  { color: "var(--danger)", soft: "var(--danger-soft)", label: "Offline" },
    idle:     { color: "var(--fg-subtle)", soft: "var(--bg-sunken)", label: "Idle" },
  };
  const s = map[status] || map.idle;
  if (compact) return (
    <span title={s.label} style={{
      display: "inline-block", width: 7, height: 7, borderRadius: 4,
      background: s.color, boxShadow: `0 0 0 3px ${s.soft}`,
    }} />
  );
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      height: 22, padding: "0 8px",
      borderRadius: 11,
      background: s.soft, color: s.color,
      fontSize: 11, fontWeight: 500,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
      {s.label}
    </span>
  );
}

// ---------- Empty / error frame ----------
function EmptyFrame({ icon = "layers", title, body, primary, secondary, tone = "neutral", code }) {
  const tones = {
    neutral: { iconBg: "var(--bg-sunken)", iconFg: "var(--fg-subtle)" },
    danger:  { iconBg: "var(--danger-soft)", iconFg: "var(--danger)" },
    warn:    { iconBg: "var(--warn-soft)", iconFg: "var(--warn)" },
    info:    { iconBg: "var(--info-soft)", iconFg: "var(--info)" },
    accent:  { iconBg: "var(--accent-soft)", iconFg: "var(--accent-ink)" },
  };
  const t = tones[tone];
  return (
    <div style={{
      flex: 1, padding: 32,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", gap: 14,
    }}>
      {code && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          letterSpacing: 0.4, color: "var(--fg-subtle)",
        }}>{code}</div>
      )}
      <div style={{
        width: 44, height: 44, borderRadius: 22,
        background: t.iconBg, color: t.iconFg,
        display: "grid", placeItems: "center",
      }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2, fontFamily: "var(--font-serif)" }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.5 }}>{body}</div>}
      </div>
      {(primary || secondary) && (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {secondary}
          {primary}
        </div>
      )}
    </div>
  );
}

// ---------- Skeleton ----------
function Skeleton({ w = "100%", h = 12, r = 4, style }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, var(--bg-sunken) 0%, var(--bg) 50%, var(--bg-sunken) 100%)",
      backgroundSize: "200% 100%",
      animation: "evalShimmer 1.4s ease-in-out infinite",
      ...style,
    }} />
  );
}
// inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('eval-shimmer')) {
  const s = document.createElement('style');
  s.id = 'eval-shimmer';
  s.textContent = "@keyframes evalShimmer { 0% { background-position: 100% 50%; } 100% { background-position: -100% 50%; } }";
  document.head.appendChild(s);
}

// ---------- Tabs ----------
function Tabs({ value, onChange, items, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      borderBottom: "1px solid var(--border)",
      gap: 0,
    }}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange?.(it.id)} style={{
            all: "unset", cursor: "pointer",
            padding: "8px 12px",
            fontSize: 12.5, fontWeight: active ? 600 : 500,
            color: active ? "var(--fg)" : "var(--fg-muted)",
            borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
            marginBottom: -1,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {it.label}
            {it.count != null && (
              <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--fg-subtle)" }}>{it.count}</span>
            )}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ---------- Field (input + label + help) ----------
function Field({ label, hint, error, children, right }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      {label && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>{label}</span>
          {right}
        </div>
      )}
      {children}
      {(hint || error) && (
        <div style={{ fontSize: 11, marginTop: 4, color: error ? "var(--danger)" : "var(--fg-subtle)" }}>
          {error || hint}
        </div>
      )}
    </label>
  );
}

function Input({ value, placeholder, mono, error, type = "text", style, onChange, prefix, suffix, autoFocus }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      height: 30, padding: "0 8px",
      background: "var(--bg)",
      border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`,
      borderRadius: "var(--radius)",
      ...style,
    }}>
      {prefix && <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>{prefix}</span>}
      <input type={type} placeholder={placeholder} defaultValue={value} autoFocus={autoFocus}
        onChange={onChange}
        style={{
          all: "unset", flex: 1, fontSize: 13,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          color: "var(--fg)", minWidth: 0,
        }} />
      {suffix && <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>{suffix}</span>}
    </div>
  );
}

// ---------- Mobile chrome (status-bar phone frame) ----------
function MobileFrame({ children, width = 390, height = 780, label }) {
  return (
    <div style={{
      width, height,
      background: "var(--bg-inverse)",
      borderRadius: 36,
      padding: 8,
      boxShadow: "0 30px 80px -20px oklch(0.18 0.012 80 / 0.25), inset 0 0 0 1px oklch(0.30 0.014 80)",
      position: "relative",
    }}>
      <div style={{
        width: "100%", height: "100%",
        background: "var(--bg)", color: "var(--fg)",
        borderRadius: 28,
        overflow: "hidden",
        position: "relative",
        display: "flex", flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}>
        {/* status bar */}
        <div style={{
          height: 28, padding: "0 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          color: "var(--fg)",
        }}>
          <span>9:41</span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <Icon name="wifi" size={11} />
            <span style={{
              width: 22, height: 9, border: "1px solid var(--fg)", borderRadius: 2, position: "relative",
              padding: 1,
            }}>
              <span style={{ display: "block", height: "100%", width: "70%", background: "var(--fg)", borderRadius: 1 }} />
            </span>
          </div>
        </div>
        {/* content */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
        {/* home indicator */}
        <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 110, height: 4, borderRadius: 2, background: "var(--fg)", opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ---------- Code line (used for replay diff) ----------
function CodeBlock({ children, style }) {
  return (
    <pre style={{
      margin: 0,
      fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.6,
      background: "var(--bg-inverse)", color: "var(--fg-inverse)",
      padding: 12, borderRadius: "var(--radius)",
      overflow: "auto",
      ...style,
    }}>{children}</pre>
  );
}

// ---------- AppBar that integrates with Sidebar (lighter than v3 AppBar) ----------
function AppBarLite({ breadcrumb, right, sticky = true }) {
  return (
    <header style={{
      height: 40, flexShrink: 0,
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 14px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-raised)",
      fontSize: 12.5,
      position: sticky ? "sticky" : "static",
      top: 0, zIndex: 5,
    }}>
      {breadcrumb && (
        <nav style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)" }}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
              <span style={{ color: i === breadcrumb.length - 1 ? "var(--fg)" : "var(--fg-muted)", fontWeight: i === breadcrumb.length - 1 ? 500 : 400 }}>
                {b}
              </span>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {right}
      </div>
    </header>
  );
}

window.EvalUI4 = {
  Icon, ICON_PATHS, Btn, IconBtn, Sidebar, Modal, Toast, Banner,
  ConnectionDot, EmptyFrame, Skeleton, Tabs, Field, Input,
  MobileFrame, CodeBlock, AppBarLite,
};

// also enrich global EvalUI so old code can keep using window.EvalUI.Btn but
// new variants work
Object.assign(window.EvalUI, { Icon, IconBtn, Modal, Toast, Banner, ConnectionDot, EmptyFrame, Skeleton, Tabs, Field, Input, MobileFrame, CodeBlock, AppBarLite, Sidebar, Btn });
