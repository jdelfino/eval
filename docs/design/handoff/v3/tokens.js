/* ============================================================
   Eval Design System — shared tokens for both directions.
   Loaded as a plain script. Defines window.EvalTokens.
   ============================================================ */

window.EvalTokens = {
  // -------- WORKSHOP (warm-academic, light-default) — primary direction --------
  workshop: {
    name: "Workshop",
    tagline: "Warm, pedagogical, considered. Light app chrome with a deep editor.",
    fontSans: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
    fontSerif: "'IBM Plex Serif', Georgia, serif",
    bg:        "oklch(0.985 0.005 80)",   // paper
    bgRaised:  "oklch(0.998 0.003 80)",   // pure-near-white card
    bgSunken:  "oklch(0.965 0.008 80)",   // panel sunk
    bgInverse: "oklch(0.18 0.012 80)",    // editor / inverse
    bgInverseRaised: "oklch(0.22 0.014 80)",
    bgInverseSunken: "oklch(0.14 0.010 80)",
    border:    "oklch(0.91 0.008 80)",
    borderStrong: "oklch(0.84 0.010 80)",
    borderInverse: "oklch(0.30 0.014 80)",
    fg:        "oklch(0.20 0.012 80)",
    fgMuted:   "oklch(0.46 0.010 80)",
    fgSubtle:  "oklch(0.62 0.008 80)",
    fgInverse: "oklch(0.96 0.006 80)",
    fgInverseMuted: "oklch(0.74 0.008 80)",
    accent:    "oklch(0.58 0.14 55)",     // deep amber / ember
    accentFg:  "oklch(0.99 0.005 80)",
    accentSoft:"oklch(0.93 0.04 60)",
    accentInk: "oklch(0.34 0.10 55)",
    run:       "oklch(0.62 0.16 145)",    // signal green for run
    runSoft:   "oklch(0.94 0.05 145)",
    danger:    "oklch(0.56 0.19 25)",
    dangerSoft:"oklch(0.94 0.05 25)",
    info:      "oklch(0.56 0.13 245)",
    infoSoft:  "oklch(0.94 0.04 245)",
    warn:      "oklch(0.68 0.14 85)",
    warnSoft:  "oklch(0.95 0.05 85)",
    radius:    "6px",
    radiusLg:  "10px",
    shadow:    "0 1px 0 0 oklch(0.91 0.008 80), 0 1px 2px 0 oklch(0.20 0.012 80 / 0.04)",
    shadowLg:  "0 1px 0 0 oklch(0.91 0.008 80), 0 8px 24px -8px oklch(0.20 0.012 80 / 0.08)",
    densityRow: 32,
    densityRowComfy: 40,
  },
};

// Helper: apply a direction's tokens as CSS variables on a scope element.
window.applyEvalTokens = function applyEvalTokens(el, dirKey) {
  const t = window.EvalTokens[dirKey];
  if (!el || !t) return;
  const map = {
    "--font-sans": t.fontSans,
    "--font-mono": t.fontMono,
    "--font-serif": t.fontSerif,
    "--bg": t.bg,
    "--bg-raised": t.bgRaised,
    "--bg-sunken": t.bgSunken,
    "--bg-inverse": t.bgInverse,
    "--bg-inverse-raised": t.bgInverseRaised,
    "--bg-inverse-sunken": t.bgInverseSunken,
    "--border": t.border,
    "--border-strong": t.borderStrong,
    "--border-inverse": t.borderInverse,
    "--fg": t.fg,
    "--fg-muted": t.fgMuted,
    "--fg-subtle": t.fgSubtle,
    "--fg-inverse": t.fgInverse,
    "--fg-inverse-muted": t.fgInverseMuted,
    "--accent": t.accent,
    "--accent-fg": t.accentFg,
    "--accent-soft": t.accentSoft,
    "--accent-ink": t.accentInk,
    "--run": t.run,
    "--run-soft": t.runSoft,
    "--danger": t.danger,
    "--danger-soft": t.dangerSoft,
    "--info": t.info,
    "--info-soft": t.infoSoft,
    "--warn": t.warn,
    "--warn-soft": t.warnSoft,
    "--radius": t.radius,
    "--radius-lg": t.radiusLg,
    "--shadow": t.shadow,
    "--shadow-lg": t.shadowLg,
  };
  for (const [k, v] of Object.entries(map)) el.style.setProperty(k, v);
};
