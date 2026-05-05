/* ============================================================
   Eval — shared design primitives.
   Direction-agnostic; every component reads CSS variables that
   each artboard sets via applyEvalTokens(...).
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;

// ---------- Shell wrapper ----------
function ScreenShell({ direction, children, density = "compact", style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) window.applyEvalTokens(ref.current, direction);
  }, [direction]);
  return (
    <div
      ref={ref}
      data-direction={direction}
      data-density={density}
      style={{
        fontFamily: "var(--font-sans)",
        background: "var(--bg)",
        color: "var(--fg)",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------- Top app bar ----------
function AppBar({ children, breadcrumb, right, accentDot = false, direction }) {
  return (
    <header
      style={{
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-raised)",
        fontSize: 12.5,
      }}
    >
      <Logomark direction={direction} />
      {breadcrumb && (
        <nav style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-muted)", fontSize: 12.5 }}>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
              <span style={{ color: i === breadcrumb.length - 1 ? "var(--fg)" : "var(--fg-muted)" }}>
                {b}
              </span>
            </React.Fragment>
          ))}
        </nav>
      )}
      <div style={{ flex: 1 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {right}
        <CommandKHint />
        <Avatar />
      </div>
    </header>
  );
}

function Logomark({ direction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 8, borderRight: "1px solid var(--border)", height: "100%" }}>
      <div
        style={{
          width: 20, height: 20, borderRadius: 4,
          background: "var(--accent)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12,
          color: "var(--accent-fg)",
          letterSpacing: -0.5,
        }}
      >
        e
      </div>
      <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, letterSpacing: -0.2 }}>
        Eval
      </span>
    </div>
  );
}

function Avatar() {
  return (
    <div
      style={{
        width: 22, height: 22, borderRadius: 11,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        display: "grid", placeItems: "center",
        fontSize: 10, fontWeight: 600, color: "var(--fg-muted)",
      }}
    >
      MR
    </div>
  );
}

function CommandKHint() {
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 24, padding: "0 8px",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontSize: 11, color: "var(--fg-muted)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <span>Search · jump · run</span>
      <Kbd>⌘K</Kbd>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        padding: "1px 5px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        color: "var(--fg-muted)",
      }}
    >
      {children}
    </kbd>
  );
}

// ---------- Stage switcher (the novel student-stage idea) ----------
function StageSwitcher({ value, onChange, stages, accentByStage = true }) {
  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        background: "var(--bg-sunken)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 2,
        gap: 2,
      }}
    >
      {stages.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(s.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              height: 24, padding: "0 10px",
              background: active ? "var(--bg-raised)" : "transparent",
              boxShadow: active ? "var(--shadow)" : "none",
              border: "none",
              borderRadius: 4,
              fontFamily: "var(--font-sans)",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--fg)" : "var(--fg-muted)",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: 3,
                background: active && accentByStage ? s.color : "var(--fg-subtle)",
                flexShrink: 0,
                boxShadow: active ? `0 0 0 3px ${s.color}22` : "none",
              }}
            />
            {s.label}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-subtle)" }}>{s.shortcut}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Buttons ----------
function Btn({ children, variant = "ghost", size = "sm", icon, kbd, onClick, style }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    height: size === "sm" ? 24 : size === "md" ? 28 : 32,
    padding: size === "sm" ? "0 8px" : "0 10px",
    fontFamily: "var(--font-sans)",
    fontSize: size === "sm" ? 12 : 12.5,
    fontWeight: 500,
    borderRadius: "var(--radius)",
    cursor: "pointer",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };
  const variants = {
    ghost:    { background: "transparent", color: "var(--fg-muted)", border: "1px solid transparent" },
    quiet:    { background: "var(--bg-sunken)", color: "var(--fg)", border: "1px solid var(--border)" },
    primary:  { background: "var(--fg)", color: "var(--bg)", border: "1px solid var(--fg)" },
    accent:   { background: "var(--accent)", color: "var(--accent-fg)", border: "1px solid var(--accent)" },
    run:      { background: "var(--run)", color: "var(--accent-fg)", border: "1px solid var(--run)", fontWeight: 600 },
    danger:   { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)" },
    inverse:  { background: "var(--bg-inverse-raised)", color: "var(--fg-inverse)", border: "1px solid var(--border-inverse)" },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

// ---------- Pill / badge ----------
function Pill({ tone = "neutral", children, dot, mono }) {
  const tones = {
    neutral: { bg: "var(--bg-sunken)", fg: "var(--fg-muted)", border: "var(--border)" },
    accent:  { bg: "var(--accent-soft)", fg: "var(--accent-ink)", border: "var(--accent-soft)" },
    run:     { bg: "var(--run-soft)", fg: "var(--run)", border: "var(--run-soft)" },
    danger:  { bg: "var(--danger-soft)", fg: "var(--danger)", border: "var(--danger-soft)" },
    info:    { bg: "var(--info-soft)", fg: "var(--info)", border: "var(--info-soft)" },
    warn:    { bg: "var(--warn-soft)", fg: "var(--warn)", border: "var(--warn-soft)" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        height: 18, padding: "0 6px",
        background: t.bg, color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 0.1,
      }}
    >
      {dot && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.fg }} />}
      {children}
    </span>
  );
}

// ---------- Section frame (used inside artboards) ----------
function Frame({ title, sub, right, children, padded = true, height, style }) {
  return (
    <div style={{
      background: "var(--bg-raised)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      ...(height ? { height } : {}),
      ...style,
    }}>
      {(title || right) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-sunken)",
        }}>
          <div>
            {title && <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fg-muted)" }}>{title}</div>}
            {sub && <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{sub}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>{right}</div>
        </div>
      )}
      <div style={{ flex: 1, padding: padded ? 12 : 0, overflow: "auto" }}>{children}</div>
    </div>
  );
}

window.EvalUI = {
  ScreenShell, AppBar, Logomark, Avatar, CommandKHint, Kbd,
  StageSwitcher, Btn, Pill, Frame,
};
