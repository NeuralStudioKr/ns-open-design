import { repairArtifactDocumentHead } from '@open-design/contracts';

/** Mirror buildSrcdoc's fragment wrap so preview detection matches iframe input. */
export function wrapPreviewHtmlShell(html: string): string {
  const repaired = repairArtifactDocumentHead(html);
  const head = repaired.trimStart().slice(0, 64).toLowerCase();
  const isFullDoc = head.startsWith('<!doctype') || head.startsWith('<html');
  if (isFullDoc) return repaired;
  const wrapped = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>${repaired}</body>
</html>`;
  return repairArtifactDocumentHead(wrapped);
}

/**
 * Detect API compact stacked decks: body-first slides the host letterboxes to
 * 1920×1080. Full framework / scroll-snap decks must stay on their native
 * layout path, but generated body > .slide decks often include local
 * <style>/<script> blocks and still need fixed slide framing.
 */
export function looksLikeCompactApiStackedDeck(html: string): boolean {
  if (!html) return false;
  if (/\bid\s*=\s*["']deck-stage["']/i.test(html)) return false;
  if (/<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\b(?:deck-shell|deck-stage)\b/i.test(html)) {
    return false;
  }
  if (/<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\bdeck-track\b/i.test(html)) return false;
  if (/<div[^>]*\bid\s*=\s*['"](?:deck-stage|deck|deck-track)['"]/i.test(html)) return false;
  if (
    /<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\bstage\b[^'"]*['"][^>]*>[\s\S]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
      html,
    )
  ) {
    return false;
  }
  if (/scroll-snap-(?:type|align|stop)\s*:/i.test(html)) return false;
  if (/overflow-x\s*:\s*(?:auto|scroll|overlay)\b/i.test(html)) return false;
  if (!/min-height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(html)) return false;
  if (
    /<body\b[^>]*>[\s\S]*<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*\bdeck\b/i.test(html)
  ) {
    return false;
  }
  return /<body\b[^>]*>(?:\s|<!--[\s\S]*?-->)*<(?:section|div)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
    html,
  );
}

/** Host-side detection that matches buildSrcdoc's wrapped preview HTML. */
export function looksLikeCompactApiStackedDeckForPreview(html: string): boolean {
  return looksLikeCompactApiStackedDeck(wrapPreviewHtmlShell(html));
}
