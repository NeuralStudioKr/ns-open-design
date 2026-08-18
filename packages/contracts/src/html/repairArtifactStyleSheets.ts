/**
 * Repair deck `<style>` sheets that Motif/class chrome depends on.
 *
 * Google Fonts CSS2 URLs embed `;` inside the query (`wght@400;700`, opsz
 * axes). Naive `@import[^;]+;` strippers leave a truncated remnant such as:
 *   `1,6..96,400..900&family=Space+Grotesk:…&display=swap');`
 * The leftover quote opens an unclosed CSS string that swallows every rule
 * after it — `.pill` / `.deco-pill` / `.card` / `.pin-*` never apply.
 *
 * Important: remnant cleanup must NOT run inside an intact quoted
 * `@import url('…css2?…;…')` — the same `;` pattern appears mid-URL and a
 * false-positive strip leaves an unclosed quote that kills Motif CSS for
 * every official template (Capsule, Hermes, Daisy, Sakura, …).
 */

const IMPORT_PLACEHOLDER = (i: number) => `/*__OD_KEEP_IMPORT_${i}__*/`;

/**
 * Remnant left after a semicolon-terminated `@import` strip on a Google Fonts
 * CSS2 URL (opsz/wght axes use `;` inside the query).
 */
const GOOGLE_FONTS_IMPORT_REMNANT_CORE =
  '(?:[\\d,.@]+(?:\\.\\.[\\d,.@]+)?(?:,[\\d@.]+)*(?:;[\\d,.@]+)*)?&?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*[\'"]?\\s*\\)\\s*;?';

/**
 * Only treat leftovers at the start of a sheet or after a rule `}`.
 * Do NOT use `;` as a prefix — css2 `@import` URLs embed `;1,6..96…&family=`
 * inside a still-valid quoted url().
 */
const GOOGLE_FONTS_IMPORT_REMNANT_RE = new RegExp(
  `(^|[}\\n])\\s*(${GOOGLE_FONTS_IMPORT_REMNANT_CORE})`,
  'gi',
);

const VALID_CSS_START_RE =
  /@(?:import|charset|layer|font-face|media|keyframes|supports)\b|:root\b|html\b|body\b|\.[A-Za-z_]|#[A-Za-z_]|\/\*|\*|\[/i;

/** Intact `@import url("…")` / `url('…')` / `"…"` / `'…'` (balanced quotes). */
const BALANCED_CSS_IMPORT_RE =
  /@import\s+(?:url\s*\(\s*(?:"[^"]*"|'[^']*'|[^'")\s]+)\s*\)|(?:"[^"]*"|'[^']*'))[^;]*;?/gi;

/**
 * Strip `@import` / `@namespace` with balanced `url("…")` / `url('…')` /
 * `url(…)`, so Google Fonts CSS2 query semicolons are not treated as
 * at-rule terminators.
 */
export function stripCssAtImportsBalanced(css: string): string {
  let text = String(css ?? '');
  text = text.replace(BALANCED_CSS_IMPORT_RE, '');
  text = text.replace(/@namespace\b[^;]*;?/gi, '');
  return text;
}

/**
 * Temporarily replace intact balanced `@import` statements so remnant cleanup
 * cannot match css2 axis `;` inside their URLs.
 */
function withProtectedCssImports(css: string, mutate: (exposed: string) => string): string {
  const kept: string[] = [];
  const exposed = String(css ?? '').replace(BALANCED_CSS_IMPORT_RE, (match) => {
    const idx = kept.length;
    kept.push(match);
    return IMPORT_PLACEHOLDER(idx);
  });
  let next = mutate(exposed);
  for (let i = 0; i < kept.length; i += 1) {
    next = next.replace(IMPORT_PLACEHOLDER(i), kept[i]!);
  }
  return next;
}

/**
 * Repair one stylesheet body so Motif class rules remain parseable.
 * Idempotent on clean sheets; never corrupts intact Google Fonts `@import`.
 */
export function repairStyleSheetText(css: string): string {
  const source = String(css ?? '');
  if (!source.trim()) return source;

  return withProtectedCssImports(source, (exposed) => {
    let text = exposed;

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
  });
}

/**
 * Walk every `<style>` block and repair Motif-breaking sheet corruption.
 * Idempotent on clean sheets.
 */
export function repairArtifactStyleSheets(html: string): string {
  const source = String(html ?? '');
  if (!source || !/<style\b/i.test(source)) return source;
  return source.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs: string, css: string) => {
    // Host-injected official look CSS is already trusted; remnant heal must
    // not rewrite grain `data:image/svg+xml` or mid-sheet Motif rules.
    if (/\bdata-od-official-look-css\b/i.test(String(attrs ?? ''))) return full;
    const repaired = repairStyleSheetText(css);
    if (repaired === css) return full;
    return `<style${attrs}>${repaired}</style>`;
  });
}

const SURFACE_BLEED_ATTR = 'data-od-slide-surface-bleed';

/**
 * Cover / export paths must never honor a persisted flatten of `.slide`.
 * Letterbox `html, body` stays; per-slide washes / role colors keep winning.
 */
export function relaxPersistedDeckSlideSurfaceBleed(html: string): string {
  const source = String(html ?? '');
  if (!source || !new RegExp(`\\b${SURFACE_BLEED_ATTR}\\b`, 'i').test(source)) {
    return source;
  }
  return source.replace(
    new RegExp(
      `(<style\\b[^>]*\\b${SURFACE_BLEED_ATTR}\\b[^>]*>)([\\s\\S]*?)(<\\/style>)`,
      'gi',
    ),
    (_full, open: string, css: string, close: string) => {
      const next = String(css).replace(
        /html\s*,\s*body\s*,\s*\.slide\s*,\s*section\.slide/gi,
        'html, body',
      );
      return `${open}${next}${close}`;
    },
  );
}
