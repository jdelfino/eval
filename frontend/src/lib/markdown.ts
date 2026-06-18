/**
 * Markdown utilities.
 *
 * Problem/session descriptions are authored in Markdown and rendered richly in
 * the workspace (see Ribbon's statement panel). But compact previews — e.g. the
 * section-detail problem/session cards (line-clamped to 1–2 lines) — must show a
 * clean plain-text snippet, not literal `#`, `##`, backticks, or ``` fences.
 * `toPlainText` strips the common Markdown syntax to readable prose for those
 * previews. It is intentionally lightweight (regex-based, classroom-grade) — not
 * a full CommonMark parser.
 */

/**
 * Strip common Markdown syntax to a single-line plain-text snippet suitable for
 * a line-clamped preview. Removes fenced/inline code markers, headings, emphasis,
 * blockquotes, list markers, horizontal rules, and link/image syntax (keeping the
 * link text), then collapses whitespace.
 */
export function toPlainText(markdown: string | null | undefined): string {
  if (!markdown) return '';
  let text = markdown;

  // Fenced code blocks ```lang\n...\n``` → keep the inner code text, drop the fences.
  text = text.replace(/```[^\n`]*\n?([\s\S]*?)```/g, (_m, code) => code);
  // Any stray remaining fences.
  text = text.replace(/```/g, '');
  // Inline code `x` → x
  text = text.replace(/`([^`]+)`/g, '$1');
  // Images ![alt](url) → alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links [text](url) → text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Headings: leading #'s
  text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  // Blockquotes: leading >
  text = text.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  // Unordered list markers: leading -, *, +
  text = text.replace(/^[ \t]{0,3}[-*+][ \t]+/gm, '');
  // Ordered list markers: leading 1. 2) etc.
  text = text.replace(/^[ \t]{0,3}\d+[.)][ \t]+/gm, '');
  // Horizontal rules (--- *** ___ on their own line)
  text = text.replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '');
  // Bold/italic/strikethrough emphasis markers (leave the inner text).
  text = text.replace(/(\*\*\*|\*\*|\*|___|__|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2');
  // Collapse all whitespace (incl. newlines) to single spaces; trim.
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
