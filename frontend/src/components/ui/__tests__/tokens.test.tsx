/**
 * Tests for the CSS variable token layer (eval-cej.1).
 *
 * Contract: globals.css defines `:root` CSS custom properties for every design
 * token in docs/design/handoff/v3/tokens.js (workshop direction), and
 * tailwind.config.js maps Tailwind utility names to those variables.
 *
 * Why it matters: downstream redesign markup (G1–G5) relies on these variables
 * existing with the exact names and values from the token source of truth.
 * If a variable is missing or misspelled, the redesign surfaces break silently —
 * elements render with no color or wrong font.
 *
 * What breaks if violated:
 * - Missing variable → the token check fails immediately, catching typos before
 *   any UI component is built.
 * - Tailwind map missing → `bg-surface-1` classes silently fall back to Tailwind
 *   defaults; the redesign chrome renders with wrong colors.
 */

import * as fs from 'fs';
import * as path from 'path';

// __dirname = frontend/src/components/ui/__tests__
// globals.css is at frontend/src/app/globals.css (3 levels up from __tests__, then into app/)
const GLOBALS_CSS_PATH = path.resolve(
  __dirname,
  '../../../app/globals.css'
);

// tailwind.config.js is at frontend/tailwind.config.js (4 levels up from __tests__)
const TAILWIND_CONFIG_PATH = path.resolve(
  __dirname,
  '../../../../tailwind.config.js'
);

/**
 * Extracts all CSS custom property declarations from `:root { ... }` blocks
 * in a CSS string. Returns a Map of variable name → value.
 */
function parseRootVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  // Match one or more :root { ... } blocks (handles multiple blocks)
  const rootBlockRe = /:root\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rootBlockRe.exec(css)) !== null) {
    const block = match[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRe.exec(block)) !== null) {
      vars.set(propMatch[1].trim(), propMatch[2].trim());
    }
  }
  return vars;
}

// ─── Test Case 1: :root variables defined in globals.css ────────────────────

describe('globals.css :root tokens', () => {
  let rootVars: Map<string, string>;

  beforeAll(() => {
    const css = fs.readFileSync(GLOBALS_CSS_PATH, 'utf-8');
    rootVars = parseRootVars(css);
  });

  // Spot-check a representative set of tokens from tokens.js workshop direction
  const expectedVars: Record<string, string> = {
    '--accent-fg':  'oklch(0.99 0.005 80)',
    '--accent':     'oklch(0.58 0.14 55)',
    '--bg':         'oklch(0.985 0.005 80)',
    '--fg':         'oklch(0.20 0.012 80)',
    '--fg-muted':   'oklch(0.46 0.010 80)',
    '--run':        'oklch(0.62 0.16 145)',
    '--danger':     'oklch(0.56 0.19 25)',
    '--info':       'oklch(0.56 0.13 245)',
    '--warn':       'oklch(0.68 0.14 85)',
    '--radius':     '6px',
    '--radius-lg':  '10px',
    '--font-sans':  "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    '--font-mono':  "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
    '--font-serif': "'IBM Plex Serif', Georgia, serif",
  };

  test.each(Object.entries(expectedVars))(
    '%s is defined in :root with the correct value',
    (varName, expectedValue) => {
      expect(rootVars.has(varName)).toBe(true);
      expect(rootVars.get(varName)).toBe(expectedValue);
    }
  );

  it('defines all background surface tokens', () => {
    const bgVars = ['--bg', '--bg-raised', '--bg-sunken', '--bg-inverse',
                    '--bg-inverse-raised', '--bg-inverse-sunken'];
    for (const v of bgVars) {
      expect(rootVars.has(v)).toBe(true);
    }
  });

  it('defines all border tokens', () => {
    const borderVars = ['--border', '--border-strong', '--border-inverse'];
    for (const v of borderVars) {
      expect(rootVars.has(v)).toBe(true);
    }
  });

  it('defines all foreground tokens', () => {
    const fgVars = ['--fg', '--fg-muted', '--fg-subtle',
                    '--fg-inverse', '--fg-inverse-muted'];
    for (const v of fgVars) {
      expect(rootVars.has(v)).toBe(true);
    }
  });

  it('defines all semantic state tokens', () => {
    const stateVars = ['--accent', '--accent-fg', '--accent-soft', '--accent-ink',
                       '--run', '--run-soft',
                       '--danger', '--danger-soft',
                       '--info', '--info-soft',
                       '--warn', '--warn-soft'];
    for (const v of stateVars) {
      expect(rootVars.has(v)).toBe(true);
    }
  });

  it('defines shadow tokens', () => {
    expect(rootVars.has('--shadow')).toBe(true);
    expect(rootVars.has('--shadow-lg')).toBe(true);
  });
});

// ─── Test Case 2: Tailwind config maps utilities to CSS variables ────────────

describe('tailwind.config.js token mappings', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(TAILWIND_CONFIG_PATH) as {
    theme: {
      extend: {
        colors?: Record<string, unknown>;
        fontFamily?: Record<string, unknown>;
        borderRadius?: Record<string, unknown>;
      };
    };
  };

  const colors = config.theme.extend.colors ?? {};
  const fontFamily = config.theme.extend.fontFamily ?? {};
  const borderRadius = config.theme.extend.borderRadius ?? {};

  it('maps bg token colors to var(--bg*) variables', () => {
    // The token layer should expose semantic color names as Tailwind utilities
    // so designers can write `bg-surface-1` instead of `bg-[var(--bg)]`.
    expect(colors).toHaveProperty('bg');
    expect(colors).toHaveProperty('bg-raised');
    expect(colors).toHaveProperty('bg-sunken');
    expect(colors).toHaveProperty('bg-inverse');
  });

  it('maps fg token colors to var(--fg*) variables', () => {
    expect(colors).toHaveProperty('fg');
    expect(colors).toHaveProperty('fg-muted');
    expect(colors).toHaveProperty('fg-subtle');
    expect(colors).toHaveProperty('fg-inverse');
  });

  it('maps accent, run, danger, info, warn to var() values', () => {
    expect(colors).toHaveProperty('accent');
    expect(colors).toHaveProperty('run');
    expect(colors).toHaveProperty('danger');
    expect(colors).toHaveProperty('info');
    expect(colors).toHaveProperty('warn');
  });

  it('maps fontFamily.sans to var(--font-sans)', () => {
    expect(fontFamily).toHaveProperty('sans');
    expect(String(fontFamily.sans)).toContain('var(--font-sans)');
  });

  it('maps fontFamily.mono to var(--font-mono)', () => {
    expect(fontFamily).toHaveProperty('mono');
    expect(String(fontFamily.mono)).toContain('var(--font-mono)');
  });

  it('maps borderRadius.lg to var(--radius-lg)', () => {
    expect(borderRadius).toHaveProperty('lg');
    expect(String(borderRadius.lg)).toContain('var(--radius-lg)');
  });

  it('maps borderRadius DEFAULT to var(--radius)', () => {
    expect(borderRadius).toHaveProperty('DEFAULT');
    expect(String(borderRadius.DEFAULT)).toContain('var(--radius)');
  });
});
