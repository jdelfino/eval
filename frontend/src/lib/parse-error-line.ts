/**
 * Parses the error line number from a Python traceback string.
 *
 * Python tracebacks can have multiple frames, e.g.:
 *   File "<student code>", line 10
 *     ...
 *   File "<student code>", line 3
 *     ...
 * NameError: ...
 *
 * We take the LAST match — the most specific (innermost) error location.
 *
 * @param errorText - The stderr / error text from code execution
 * @returns The last matched line number (1-based), or null if no match found
 */
export function parseErrorLineNumber(errorText: string): number | null {
  const pattern = /File "<student code>", line (\d+)/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(errorText)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return null;
  }

  return parseInt(lastMatch[1], 10);
}
