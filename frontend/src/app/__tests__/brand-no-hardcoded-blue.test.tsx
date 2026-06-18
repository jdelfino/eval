/**
 * Brand guard: the authed app must not reintroduce the pre-redesign indigo/blue.
 *
 * The redesign brand primary is the ORANGE accent (var(--accent), exposed as the
 * `accent`/`accent-soft`/`accent-ink` Tailwind utilities and the Button `accent`
 * variant). Before the migration (eval-7lg / eval-9p4) the authed surfaces used
 * the old indigo/blue — both as Tailwind `blue-*`/`indigo-*`/`purple-*` utility
 * classes AND as inline hex (`#0d6efd` Bootstrap blue, `#2563eb`, …). Those were
 * all migrated to the accent tokens.
 *
 * Why it matters: a dev reaching for `bg-blue-600` by habit (or copy-pasting old
 * inline-hex markup) silently re-breaks brand consistency, and unit/e2e tests do
 * not catch a merely-wrong color. This static guard fails the build if a forbidden
 * blue is reintroduced into production code under src/app or src/components.
 *
 * Scope: production `.ts`/`.tsx` only (tests, mocks, and the categorical analysis
 * palette are allowlisted — see ALLOWLIST). Greens (run), reds (danger), and the
 * semantic `info` token (which may render blue-ish by design) are NOT affected —
 * this guard only forbids raw `blue/indigo/purple` Tailwind utilities and the
 * specific legacy blue hex literals, never the token utilities.
 */

import * as fs from 'fs';
import * as path from 'path';

// __dirname = frontend/src/app/__tests__  →  scan roots under frontend/src
const SRC_ROOT = path.resolve(__dirname, '../../');
const SCAN_DIRS = [path.join(SRC_ROOT, 'app'), path.join(SRC_ROOT, 'components')];

/**
 * Files intentionally exempt. `analysis.ts` defines a CATEGORICAL palette
 * (bug-category chips: "Style" = blue, etc.) — distinct semantic colors, not the
 * brand primary, so blue there is correct. Keyed by path suffix.
 */
const ALLOWLIST = ['app/(app)/instructor/constants/analysis.ts'];

// Forbidden Tailwind utilities: any state-variant prefix + a color property +
// blue/indigo/purple + a numeric shade. e.g. bg-blue-600, hover:text-indigo-500,
// focus:ring-blue-400, border-purple-200, from-indigo-600.
const TAILWIND_BLUE =
  /\b(?:[a-z-]+:)*(?:bg|text|from|to|via|border|ring|divide|outline|decoration|fill|stroke|shadow|accent|caret|placeholder)-(?:blue|indigo|purple)-\d{2,3}\b/;

// Forbidden inline hex literals: the specific legacy blue/indigo hexes the
// migration removed (Bootstrap blue + Tailwind blue/indigo shades). Case-insensitive.
const LEGACY_BLUE_HEX =
  /#(?:0d6efd|0b5ed7|2563eb|1d4ed8|1e3a8a|3b82f6|60a5fa|93c5fd|bfdbfe|dbeafe|eff6ff|4f46e5|6366f1|4338ca|818cf8|a78bfa)\b/i;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(file: string): boolean {
  const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
  return ALLOWLIST.some((suffix) => rel.endsWith(suffix.replace(/^app\//, 'app/')) || rel === suffix || file.includes(suffix));
}

describe('brand guard: no hardcoded indigo/blue in the authed app', () => {
  const files = SCAN_DIRS.flatMap(walk).filter((f) => !isAllowlisted(f));

  it('scans a non-trivial number of production files', () => {
    // Sanity: if this ever drops to ~0 the glob/path broke and the guard is a no-op.
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no blue/indigo/purple Tailwind utility classes', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = line.match(TAILWIND_BLUE);
        if (m) offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}  ${m[0]}`);
      });
    }
    // On failure Jest prints the offender list. Fix: use the accent token
    // utilities (bg-accent / text-accent-ink / bg-accent-soft …); if a color is
    // genuinely informational use the info token — never raw blue/indigo/purple.
    expect(offenders).toEqual([]);
  });

  it('has no legacy blue/indigo hex literals', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = line.match(LEGACY_BLUE_HEX);
        if (m) offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}  ${m[0]}`);
      });
    }
    // On failure Jest prints the offender list. Fix: replace legacy blue hex with
    // the accent token (var(--accent) / var(--accent-ink) / var(--accent-soft)).
    expect(offenders).toEqual([]);
  });
});
