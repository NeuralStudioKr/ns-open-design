import { stripArtifactPreviewBodyTextLeaks } from "./artifactPreviewTextLeaks.js";

/**
 * Truncated viewport meta tails agents stream as visible text. Matches
 * `device-width, …`, the shorter `-width, …` suffix, and bare `width, …`
 * fragments — but not valid `content="width=device-width, …"` attributes.
 */
export const ARTIFACT_VIEWPORT_TEXT_LEAK_RE =
  /(?<![\w=])(?:device-)?-?width\s*,\s*initial-scale=[^<\n]+"?\s*\/?>/gi;

const CORRUPTED_HEAD_VIEWPORT_CAPTURE_RE =
  /<head(\s[^>]*)?>\s*((?:device-)?-?width)\s*,\s*initial-scale=([\d.]+)\s*"?\s*\/?>/gi;

const HEAD_VIEWPORT_FRAGMENT_RE =
  /^\s*(?:device-)?-?width\s*,\s*initial-scale=[^<\n]+"?\s*\/?>\s*/im;

const BODY_VIEWPORT_FRAGMENT_RE =
  /(<body[^>]*>)\s*(?:device-)?-?width\s*,\s*initial-scale=[^<\n]+"?\s*\/?>\s*/gi;

/** Raw CSS variable lines leaked into body when `<style>` opens late during streaming. */
const LEAKED_CSS_TOKEN_BLOCK_RE =
  /(?:^|>)\s*--(?:bg|fg|muted|accent|accent2|surface|surface2|border|success|warn|shell|font|mono)\s*:[^<]{0,400}\}\s*/gim;

/** Truncated deck-framework script bodies that render as visible text. */
const LEAKED_DECK_SCRIPT_SNIPPET_RE =
  /(?:^|>)\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)[\s\S]{0,1200}?onKey\(e\)\s*\{[\s\S]{0,200}?/gim;

function stripLeakedViewportFragments(doc: string): string {
  let out = doc.replace(HEAD_VIEWPORT_FRAGMENT_RE, "");
  out = out.replace(BODY_VIEWPORT_FRAGMENT_RE, "$1");
  out = out.replace(ARTIFACT_VIEWPORT_TEXT_LEAK_RE, "");
  out = out.replace(LEAKED_CSS_TOKEN_BLOCK_RE, (match) => (match.startsWith(">") ? ">" : ""));
  out = out.replace(LEAKED_DECK_SCRIPT_SNIPPET_RE, (match) => (match.startsWith(">") ? ">" : ""));
  return out;
}

export function repairArtifactDocumentHead(html: string): string {
  if (!html) return html;

  let doc = stripArtifactPreviewBodyTextLeaks(stripLeakedViewportFragments(html));
  if (!/<head/i.test(doc)) return doc;

  doc = doc.replace(
    CORRUPTED_HEAD_VIEWPORT_CAPTURE_RE,
    '<head$1>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=$3" />',
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
