/**
 * Repair common agent-emitted `<head>` corruption where a truncated viewport
 * meta tag becomes visible body text (e.g. `<head>device-width, initial-scale=1" />`).
 */
const CORRUPTED_HEAD_VIEWPORT_RE =
  /<head(\s[^>]*)?>\s*device-width\s*,\s*initial-scale=([\d.]+)\s*"?\s*\/?>/gi;

const HEAD_VIEWPORT_FRAGMENT_RE =
  /^\s*device-width\s*,\s*initial-scale=[^<\n]+"?\s*\/?>\s*/im;

const BODY_VIEWPORT_FRAGMENT_RE =
  /(<body[^>]*>)\s*device-width\s*,\s*initial-scale=[^<\n]+"?\s*\/?>\s*/gi;

function stripLeakedViewportFragments(doc: string): string {
  let out = doc.replace(HEAD_VIEWPORT_FRAGMENT_RE, "");
  out = out.replace(BODY_VIEWPORT_FRAGMENT_RE, "$1");
  return out;
}

export function repairArtifactDocumentHead(html: string): string {
  if (!html) return html;

  let doc = stripLeakedViewportFragments(html);
  if (!/<head/i.test(doc)) return doc;

  doc = doc.replace(
    CORRUPTED_HEAD_VIEWPORT_RE,
    '<head$1>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=$2" />',
  );

  doc = doc.replace(/<head([^>]*)>([\s\S]*?)<\/head>/i, (_match, attrs, inner) => {
    let headInner = inner.replace(HEAD_VIEWPORT_FRAGMENT_RE, "");
    if (!/<meta\s+charset/i.test(headInner)) {
      headInner = `\n  <meta charset="utf-8" />${headInner}`;
    }
    if (!/<meta\s+name=["']viewport["']/i.test(headInner)) {
      headInner = `${headInner}\n  <meta name="viewport" content="width=device-width, initial-scale=1" />`;
    }
    return `<head${attrs}>${headInner}</head>`;
  });

  return stripLeakedViewportFragments(doc);
}
