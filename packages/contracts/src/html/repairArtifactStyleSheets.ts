/**
 * Repair deck `<style>` sheets that Motif/class chrome depends on.
 *
 * Google Fonts CSS2 URLs embed `;` inside the query (`wght@400;700`, opsz
 * axes). Naive `@import[^;]+;` strippers leave a truncated remnant such as:
 *   `1,6..96,400..900&family=Space+Grotesk:…&display=swap');`
 * The leftover quote opens an unclosed CSS string that swallows every rule
 * after it — `.pill` / `.deco-pill` / `.card` never apply. Capsule fills
 * then look like bare text labels on a flat page.
 */

/**
 * Remnant left after a semicolon-terminated `@import` strip on a Google Fonts
 * CSS2 URL (opsz/wght axes use `;` inside the query).
 */
const GOOGLE_FONTS_IMPORT_REMNANT_CORE =
  '(?:[\\d,.@]+(?:\\.\\.[\\d,.@]+)?(?:,[\\d@.]+)*(?:;[\\d,.@]+)*)?&?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*[\'"]?\\s*\\)\\s*;?';

const GOOGLE_FONTS_IMPORT_REMNANT_RE = new RegExp(
  `(^|[\\s;}])(${GOOGLE_FONTS_IMPORT_REMNANT_CORE})`,
  'gi',
);

const VALID_CSS_START_RE =
  /@(?:import|charset|layer|font-face|media|keyframes|supports)\b|:root\b|html\b|body\b|\.[A-Za-z_]|#[A-Za-z_]|\/\*|\*|\[/i;

/**
 * Strip `@import` / `@namespace` with balanced `url("…")` / `url('…')` /
 * `url(…)`, so Google Fonts CSS2 query semicolons are not treated as
 * at-rule terminators.
 */
export function stripCssAtImportsBalanced(css: string): string {
  let text = String(css ?? '');
  text = text.replace(
    /@import\s+(?:url\s*\(\s*(?:"[^"]*"|'[^']*'|[^'")\s]+)\s*\)|(?:"[^"]*"|'[^']*'))[^;]*;?/gi,
    '',
  );
  text = text.replace(/@namespace\b[^;]*;?/gi, '');
  return text;
}

/**
 * Repair one stylesheet body so Motif class rules remain parseable.
 */
export function repairStyleSheetText(css: string): string {
  let text = String(css ?? '');
  if (!text.trim()) return text;

  // Drop truncated Google Fonts remnants (start or after a prior rule).
  text = text.replace(GOOGLE_FONTS_IMPORT_REMNANT_RE, '$1');

  // If the sheet still opens with font-URL garbage / an unclosed quote before
  // the first real rule, cut to the first valid CSS start.
  const validStart = text.search(VALID_CSS_START_RE);
  if (validStart > 0) {
    const head = text.slice(0, validStart);
    if (
      /family=|display=swap|fonts\.googleapis|[\d,]+\.\.[\d,]+/i.test(head)
      || /['"]/.test(head)
    ) {
      text = text.slice(validStart);
    }
  }

  return text;
}

/**
 * Walk every `<style>` block and repair Motif-breaking sheet corruption.
 * Idempotent on clean sheets.
 */
export function repairArtifactStyleSheets(html: string): string {
  const source = String(html ?? '');
  if (!source || !/<style\b/i.test(source)) return source;
  return source.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs: string, css: string) => {
    const repaired = repairStyleSheetText(css);
    if (repaired === css) return full;
    return `<style${attrs}>${repaired}</style>`;
  });
}
