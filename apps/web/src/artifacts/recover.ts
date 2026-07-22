import { validateHtmlArtifact } from './validate';

type RecoverHtmlArtifactInput = {
  artifactHtml: string;
  identifier?: string;
  sourceText?: string;
};

const HTML_OPEN_RE = /<html\b/gi;
const HTML_CLOSE_RE = /<\/html\s*>/gi;
const ADJACENT_DOCTYPE_RE = /<!doctype\s+html\b[^>]*>\s*$/i;
const HTML_FENCE_RE = /```(?:html|HTML)\s*\n([\s\S]*?)\n```/g;
const DOCTYPE_HTML_BLOCK_RE = /<!doctype\s+html[\s\S]*?<\/html\s*>/gi;
const STARTS_WITH_DOCUMENT_RE = /^(?:<!doctype\s+html\b|<html\b)/i;
const HAS_HTML_CLOSE_RE = /<\/html\s*>/i;
const HAS_BODY_CLOSE_RE = /<\/body\s*>/i;
const HAS_MEDIA_CONTENT_RE = /<(?:img|video|audio|canvas|svg|iframe|picture|object|embed)\b/i;
// Visible text inside a content-ish tag (not merely nested empty containers).
const HAS_VISIBLE_TEXT_CONTENT_RE =
  /<(?:h[1-6]|p|li|td|th|dt|dd|blockquote|figcaption|label|button|a|span|strong|em|b|i|code|pre)\b[^>]*>\s*[^<\s][\s\S]*?<\/(?:h[1-6]|p|li|td|th|dt|dd|blockquote|figcaption|label|button|a|span|strong|em|b|i|code|pre)\s*>/i;

function hasSalvageableSlideContent(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  if (HAS_MEDIA_CONTENT_RE.test(withoutComments)) return true;
  if (HAS_VISIBLE_TEXT_CONTENT_RE.test(withoutComments)) return true;
  // Fallback: any non-trivial text node left after stripping tags/scripts/styles.
  const text = withoutComments
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length >= 8;
}

function findLastArtifactOpen(sourceText: string, identifier?: string): number {
  if (!identifier) return sourceText.lastIndexOf('<artifact');

  const escapedIdentifier = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taggedOpenRe = new RegExp(
    `<artifact\\b(?=[^>]*\\bidentifier\\s*=\\s*(?:"${escapedIdentifier}"|'${escapedIdentifier}'))[^>]*>`,
    'gi',
  );
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = taggedOpenRe.exec(sourceText)) !== null) {
    last = match.index;
  }
  return last !== -1 ? last : sourceText.lastIndexOf('<artifact');
}

function lastIndexOfRegex(re: RegExp, text: string): number {
  re.lastIndex = 0;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    last = match.index;
  }
  return last;
}

export function recoverHtmlArtifactFromPrecedingDocument({
  artifactHtml,
  identifier,
  sourceText,
}: RecoverHtmlArtifactInput): string | null {
  if (!sourceText) return null;
  if (validateHtmlArtifact(artifactHtml).ok) return null;

  const artifactOpen = findLastArtifactOpen(sourceText, identifier);
  if (artifactOpen === -1) return null;

  const beforeArtifact = sourceText.slice(0, artifactOpen);
  if (!/<\/html\s*>\s*$/i.test(beforeArtifact)) return null;

  const htmlOpenStart = lastIndexOfRegex(HTML_OPEN_RE, beforeArtifact);
  const htmlClose = lastIndexOfRegex(HTML_CLOSE_RE, beforeArtifact);
  if (htmlOpenStart === -1 || htmlClose === -1 || htmlClose < htmlOpenStart) return null;

  const closeMatch = beforeArtifact.slice(htmlClose).match(/^<\/html\s*>/i);
  if (!closeMatch) return null;

  const beforeHtmlOpen = beforeArtifact.slice(0, htmlOpenStart);
  const adjacentDoctype = beforeHtmlOpen.match(ADJACENT_DOCTYPE_RE);
  const htmlStart = adjacentDoctype
    ? htmlOpenStart - adjacentDoctype[0].length
    : htmlOpenStart;

  const candidate = beforeArtifact.slice(htmlStart, htmlClose + closeMatch[0].length).trim();
  return validateHtmlArtifact(candidate).ok ? candidate : null;
}

export function recoverStandaloneHtmlDocument(sourceText: string | null | undefined): string | null {
  const candidate = String(sourceText || '').replace(/^﻿/, '').trim();
  if (!/<\/html\s*>$/i.test(candidate)) return null;
  return validateHtmlArtifact(candidate).ok ? candidate : null;
}

export function recoverHtmlDocumentFromMarkdownFence(sourceText: string | null | undefined): string | null {
  const text = String(sourceText || '');
  HTML_FENCE_RE.lastIndex = 0;
  let recovered: string | null = null;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_FENCE_RE.exec(text)) !== null) {
    const candidate = (match[1] || '').replace(/^﻿/, '').trim();
    if (!/<\/html\s*>$/i.test(candidate)) continue;
    if (!validateHtmlArtifact(candidate).ok) continue;
    recovered = candidate;
    count += 1;
  }
  return count === 1 ? recovered : null;
}

/**
 * Scan the full assistant text for every complete HTML document (fences,
 * standalone tail, or embedded doctype blocks inside/outside artifacts) and
 * return the longest candidate that passes the write gate.
 */
export function recoverBestHtmlDocumentFromText(
  sourceText: string | null | undefined,
): string | null {
  const text = String(sourceText || '');
  if (!text.trim()) return null;

  const candidates: string[] = [];
  const fenced = recoverHtmlDocumentFromMarkdownFence(text);
  if (fenced) candidates.push(fenced);
  const standalone = recoverStandaloneHtmlDocument(text);
  if (standalone) candidates.push(standalone);

  const withoutArtifacts = text
    .replace(/<artifact\b[\s\S]*?<\/artifact>/gi, '')
    .replace(/<artifact\b[\s\S]*$/i, '');

  DOCTYPE_HTML_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DOCTYPE_HTML_BLOCK_RE.exec(withoutArtifacts)) !== null) {
    const candidate = (match[0] || '').replace(/^﻿/, '').trim();
    if (validateHtmlArtifact(candidate).ok) candidates.push(candidate);
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.length > best.length ? cur : best));
}

/**
 * Close a mid-stream truncated HTML deck that already has real body content
 * but never reached `</html>` (typical when the model hits max_tokens).
 *
 * Returns null when the document is empty/shell-only or already closed —
 * those cases still need auto-continue / rejection, not a silent close.
 */
export function salvageTruncatedHtmlDocument(content: string | null | undefined): string | null {
  const trimmed = String(content ?? '').replace(/^﻿/, '').trim();
  if (trimmed.length < 128) return null;
  if (!STARTS_WITH_DOCUMENT_RE.test(trimmed)) return null;
  if (HAS_HTML_CLOSE_RE.test(trimmed) && HAS_BODY_CLOSE_RE.test(trimmed)) return null;
  // Strip SLOT / placeholder comments before the content sniff — otherwise a
  // skeleton with only `<!-- SLOT: slide N -->` looks "long enough" to salvage
  // into a closed blank deck.
  if (!hasSalvageableSlideContent(trimmed)) return null;

  let out = trimmed;
  // Drop a trailing partial tag the stream was cut mid-attribute on
  // (e.g. `<section class="sli`). Browsers forgive this, but closing
  // after an open `<` can confuse some parsers.
  out = out.replace(/<[^>]*$/, '');

  if (!HAS_BODY_CLOSE_RE.test(out)) {
    if (!/<body\b/i.test(out)) {
      // Head-only truncation with some content outside body — wrap remainder.
      const headClose = /<\/head\s*>/i.exec(out);
      if (headClose) {
        const insertAt = headClose.index + headClose[0].length;
        out = `${out.slice(0, insertAt)}<body>${out.slice(insertAt)}</body>`;
      } else {
        out = `${out}<body></body>`;
      }
    } else {
      out = `${out}</body>`;
    }
  }
  if (!HAS_HTML_CLOSE_RE.test(out)) {
    out = `${out}</html>`;
  }

  if (!validateHtmlArtifact(out).ok) return null;
  // Still refuse empty shells that only got closers appended.
  if (!hasSalvageableSlideContent(out)) return null;
  return out;
}
