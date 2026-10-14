/**
 * 1007-N01 슬라이스 J — official-rich / how-to 스트림이 `</html></artifact>`
 * 없이 끊겨도, 이미 받은 제목 슬라이드가 있으면 구조 태그만 닫아 persist 한다.
 * 합성 카피·스켈레톤 주입 없음.
 */

const SLIDE_HOST_RE =
  /<(?:section|div|main|article)\b[^>]*(?:class\s*=\s*["'][^"']*\bslide\b|data-slide(?:-index)?\s*=)/i;
const TITLE_RE = /<h[1-3]\b/i;

export function isCompleteDeckArtifactText(text: string): boolean {
  const raw = String(text ?? '');
  if (/<question-form\b[\s\S]*<\/question-form\s*>/i.test(raw)) return true;
  const open = /<artifact\b([^>]*)>/i.exec(raw);
  if (!open) return false;
  const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(open[1] ?? '')?.[1]?.toLowerCase();
  if (!type || !['deck', 'deck-patch', 'element-patch'].includes(type)) return false;
  const bodyStart = (open.index ?? 0) + open[0].length;
  const closeIndex = raw.toLowerCase().indexOf('</artifact>', bodyStart);
  if (closeIndex < 0) return false;
  const body = raw.slice(bodyStart, closeIndex);
  if (type === 'deck') {
    return /<!doctype\s+html\b|<html\b/i.test(body)
      && /<\/html\s*>/i.test(body)
      && SLIDE_HOST_RE.test(body);
  }
  if (type === 'deck-patch') {
    return /<(?:section|div|main|article)\b[^>]*(?:class\s*=\s*["'][^"']*\bslide\b|data-slide-index\s*=)/i.test(body);
  }
  return /<patch\b[^>]*>[\s\S]*<\/patch\s*>/i.test(body);
}

export function incompleteDeckHasSalvageableSlides(text: string): boolean {
  const raw = String(text ?? '');
  if (!SLIDE_HOST_RE.test(raw)) return false;
  return TITLE_RE.test(raw);
}

/**
 * Close missing `</body></html></artifact>` (and wrap a bare HTML document)
 * so a truncated official-rich stream can persist. Returns null when there
 * are no titled slides — head-only dumps must keep the existing retry path.
 */
export function closeIncompleteDeckArtifactForSalvage(text: string): string | null {
  const raw = String(text ?? '');
  if (isCompleteDeckArtifactText(raw)) return raw;
  if (!incompleteDeckHasSalvageableSlides(raw)) return null;

  let out = raw;
  const hasArtifact = /<artifact\b/i.test(out);
  const hasHtml = /<html\b/i.test(out) || /<!doctype\s+html/i.test(out);
  const hasBody = /<body\b/i.test(out);

  if (hasBody && !/<\/body\s*>/i.test(out)) out += '</body>';
  if (hasHtml && !/<\/html\s*>/i.test(out)) out += '</html>';
  if (hasArtifact && !/<\/artifact\s*>/i.test(out)) out += '</artifact>';
  if (!hasArtifact && hasHtml && /<\/html\s*>/i.test(out)) {
    out = `<artifact type="deck" identifier="deck">${out}</artifact>`;
  }

  return isCompleteDeckArtifactText(out) ? out : null;
}
