/**
 * Minimal unified line-diff utility.
 *
 * Produces a unified-diff-style text comparing two strings line by line:
 *   - context lines are prefixed with two spaces ("  ")
 *   - removed lines (present in `before`, absent in `after`) with "- "
 *   - added lines (present in `after`, absent in `before`) with "+ "
 *
 * Used by the Solution viewer (G7) to diff a student's last revision against the
 * reference solution, and by the Replay modal (G7-T6) to diff adjacent
 * revisions. Kept deliberately small (an LCS over lines) — it is presentation
 * text only, fed verbatim into a CodeBlock; no patch-application semantics.
 */

/**
 * Compute the unified line-diff between `before` and `after`.
 *
 * @param before - The original text (the "-" side).
 * @param after - The new text (the "+" side).
 * @returns A newline-joined unified diff. When the inputs are identical the
 *   result is the unchanged text rendered entirely as context lines.
 */
export function lineDiff(before: string, after: string): string {
  const a = splitLines(before);
  const b = splitLines(after);

  // Longest-common-subsequence table over lines.
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) {
    out.push(`- ${a[i]}`);
    i++;
  }
  while (j < m) {
    out.push(`+ ${b[j]}`);
    j++;
  }

  return out.join('\n');
}

/**
 * Split text into lines, treating empty input as zero lines (not one empty
 * line) so an empty side contributes nothing to the diff.
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split('\n');
}
