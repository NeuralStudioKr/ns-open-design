import {
  looksLikeInstructionCopy,
  looksLikeTemplateMarketingTitle,
  stripIncompleteOpenTags,
  stripTrailingUnclosedRawBlocks,
} from '@open-design/contracts';
import { validateHtmlArtifact, isIncompleteHtmlDocumentShell } from './validate';
import {
  closeUnclosedSlideSectionsForSalvage,
  eachSlideHostOpenIndex,
  hasSalvageableDeckSlideContent,
  isClosedSoftSalvageDeckHtml,
  meetsTruncationSalvageQuality,
  startsWithSlideHost,
} from './deck-html-content';

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
const HTML_DOCUMENT_BLOCK_RE = /<html\b[\s\S]*?<\/html\s*>/gi;
const STARTS_WITH_DOCUMENT_RE = /^(?:<!doctype\s+html\b|<html\b)/i;
const STARTS_WITH_BODY_RE = /^<body\b/i;
const BODY_TAG_RE = /<body\b/gi;
const HAS_HTML_CLOSE_RE = /<\/html\s*>/i;
const HAS_BODY_CLOSE_RE = /<\/body\s*>/i;

function hasSalvageableSlideContent(html: string): boolean {
  return hasSalvageableDeckSlideContent(html);
}

function hasTruncationSalvageableContent(html: string): boolean {
  return meetsTruncationSalvageQuality(html) || hasSalvageableDeckSlideContent(html);
}

/** Strip trailing junk and close unmatched slide sections before quality sniff. */
function prepareTruncatedHtmlForSalvage(html: string): string {
  let out = html.replace(/<[^>]*$/, '');
  out = stripTrailingUnclosedRawBlocks(out);
  out = stripIncompleteOpenTags(out);
  return closeUnclosedSlideSectionsForSalvage(out);
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
  healContext?: { brief?: string | null; deckTitle?: string | null },
): string | null {
  const text = String(sourceText || '');
  if (!text.trim()) return null;

  const candidates: string[] = [];
  const bodyFirst = normalizeBodyFirstHtmlDocument(text);
  if (bodyFirst) candidates.push(bodyFirst);
  for (const bodyFirstTail of recoverBodyFirstHtmlDocumentsFromText(text)) {
    candidates.push(bodyFirstTail);
  }
  const fenced = recoverHtmlDocumentFromMarkdownFence(text);
  if (fenced) candidates.push(fenced);
  const standalone = recoverStandaloneHtmlDocument(text);
  if (standalone) candidates.push(standalone);

  collectCompleteHtmlDocumentsFromText(text, candidates, healContext);

  const withoutArtifacts = text
    .replace(/<artifact\b[\s\S]*?<\/artifact>/gi, '')
    .replace(/<artifact\b[\s\S]*$/i, '');

  collectCompleteHtmlDocumentsFromText(withoutArtifacts, candidates, healContext);

  // Truncated doctype decks (max_tokens mid-stream) never match the complete
  // document collectors above — close them when they already have real slides.
  collectTruncatedHtmlDocumentsFromText(text, candidates);
  collectTruncatedHtmlDocumentsFromText(withoutArtifacts, candidates);

  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.length > best.length ? cur : best));
}

function collectTruncatedHtmlDocumentsFromText(sourceText: string, candidates: string[]): void {
  // Split on each doctype so a later empty closed `</html>` artifact cannot
  // poison salvage of an earlier truncated deck (or vice versa).
  const segments = sourceText.match(/<!doctype\s+html[\s\S]*?(?=(?:<!doctype\s+html)|$)/gi) ?? [];
  if (segments.length === 0) {
    const doctypeTail = sourceText.match(/<!doctype\s+html[\s\S]*/i)?.[0];
    if (!doctypeTail) return;
    const salvaged = salvageTruncatedHtmlDocument(doctypeTail);
    if (salvaged) candidates.push(salvaged);
    return;
  }
  for (const segment of segments) {
    const salvaged = salvageTruncatedHtmlDocument(segment);
    if (salvaged) candidates.push(salvaged);
  }
}

function collectCompleteHtmlDocumentsFromText(
  sourceText: string,
  candidates: string[],
  healContext?: { brief?: string | null; deckTitle?: string | null },
): void {
  const addCandidate = (candidate: string) => {
    const normalized = candidate.replace(/^﻿/, '').trim();
    if (/<\/?artifact\b/i.test(normalized)) return;
    if (!validateHtmlArtifact(normalized).ok) return;
    // Include closed soft-salvage decks (strict incomplete ratio still fails).
    if (
      !isIncompleteHtmlDocumentShell(normalized, healContext?.brief, healContext?.deckTitle)
      || isClosedSoftSalvageDeckHtml(normalized)
    ) {
      candidates.push(normalized);
    }
  };

  DOCTYPE_HTML_BLOCK_RE.lastIndex = 0;
  let doctypeMatch: RegExpExecArray | null;
  while ((doctypeMatch = DOCTYPE_HTML_BLOCK_RE.exec(sourceText)) !== null) {
    addCandidate(doctypeMatch[0] || '');
  }

  HTML_DOCUMENT_BLOCK_RE.lastIndex = 0;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = HTML_DOCUMENT_BLOCK_RE.exec(sourceText)) !== null) {
    const html = htmlMatch[0] || '';
    const beforeHtml = sourceText.slice(0, htmlMatch.index);
    const adjacentDoctype = beforeHtml.match(ADJACENT_DOCTYPE_RE);
    addCandidate(adjacentDoctype ? `${adjacentDoctype[0]}${html}` : html);
  }
}

function recoverBodyFirstHtmlDocumentsFromText(sourceText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const addTail = (index: number) => {
    if (index < 0 || seen.has(String(index))) return;
    seen.add(String(index));
    const normalized = normalizeBodyFirstHtmlDocument(sourceText.slice(index));
    if (normalized) out.push(normalized);
  };

  BODY_TAG_RE.lastIndex = 0;
  let bodyMatch: RegExpExecArray | null;
  while ((bodyMatch = BODY_TAG_RE.exec(sourceText)) !== null) {
    addTail(bodyMatch.index);
  }

  for (const index of eachSlideHostOpenIndex(sourceText)) {
    addTail(index);
  }

  return out;
}

/**
 * Teamver API deck prompts intentionally say "body-first" to avoid a huge
 * head/CSS prelude. Some models interpret that literally and emit an artifact
 * body that starts with `<body>` or the first slide host
 * (`section|div.slide`, not chrome like `.slide-inner`),
 * without the outer `<!doctype html><html>`. Wrap only slide-looking content
 * with real text/media so prose or empty SLOT skeletons still fail.
 */
export function normalizeBodyFirstHtmlDocument(content: string | null | undefined): string | null {
  const trimmed = String(content ?? '').replace(/^﻿/, '').trim();
  if (trimmed.length < 64) return null;
  if (STARTS_WITH_DOCUMENT_RE.test(trimmed)) return null;
  const startsWithBody = STARTS_WITH_BODY_RE.test(trimmed);
  const startsWithSlide = startsWithSlideHost(trimmed);
  if (!startsWithBody && !startsWithSlide) return null;

  // Close unclosed slide sections first — mid-first-slide truncation otherwise
  // fails the content sniff because only `</section>`-closed slides count.
  const cleaned = prepareTruncatedHtmlForSalvage(trimmed);
  if (!hasTruncationSalvageableContent(cleaned)) return null;

  const body = startsWithBody
    ? `${cleaned.replace(/<\/html\s*>\s*$/i, '')}${HAS_BODY_CLOSE_RE.test(cleaned) ? '' : '</body>'}`
    : `<body>${cleaned}${HAS_BODY_CLOSE_RE.test(cleaned) ? '' : '</body>'}`;
  const html = `<!doctype html><html lang="ko">${body}${HAS_HTML_CLOSE_RE.test(body) ? '' : '</html>'}`;
  return validateHtmlArtifact(html).ok && hasTruncationSalvageableContent(html) ? html : null;
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
  const bodyFirst = normalizeBodyFirstHtmlDocument(trimmed);
  if (bodyFirst) return bodyFirst;
  if (trimmed.length < 128) return null;
  if (!STARTS_WITH_DOCUMENT_RE.test(trimmed)) return null;
  if (HAS_HTML_CLOSE_RE.test(trimmed) && HAS_BODY_CLOSE_RE.test(trimmed)) return null;

  // Drop trailing partial tags / unclosed raw blocks / stutter openers, then
  // close unmatched slide sections BEFORE the content sniff. Mid-first-slide
  // max_tokens cuts otherwise look empty (only closed </section> counted).
  let out = prepareTruncatedHtmlForSalvage(trimmed);
  if (!hasTruncationSalvageableContent(out)) return null;

  if (!HAS_BODY_CLOSE_RE.test(out)) {
    if (HAS_HTML_CLOSE_RE.test(out)) {
      // Premature </html> without </body> — insert body closer before html
      // closer so we never emit `</html></body>`.
      out = out.replace(/<\/html\s*>/i, '</body></html>');
    } else if (!/<body\b/i.test(out)) {
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
  // Still refuse empty / SLOT-only shells that only got closers appended.
  if (!hasTruncationSalvageableContent(out)) return null;
  return out;
}

const GENERIC_TEMPLATE_FILL_TITLE_RE =
  /^(?:x|ok|deck|untitled|slide|presentation(?:\s+template)?|daisy days|html ppt|zhangzara|template)\b/i;

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function visibleHeadingCandidate(html: string): string {
  const withoutChrome = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const heading =
    /<h[1-3]\b[^>]*>([\s\S]*?)(?:<\/h[1-3]>|$)/i.exec(withoutChrome)?.[1]
    ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(withoutChrome)?.[1]
    ?? '';
  return decodeBasicHtmlEntities(heading.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function isUnusableCoverTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length < 2) return true;
  if (GENERIC_TEMPLATE_FILL_TITLE_RE.test(trimmed)) return true;
  if (looksLikeTemplateMarketingTitle(trimmed) || looksLikeInstructionCopy(trimmed)) return true;
  return false;
}

function build1920CoverDraftHtml(title: string): string | null {
  const escaped = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = [
    '<!doctype html><html lang="ko"><body style="margin:0">',
    '<section class="slide" style="width:1920px;height:1080px;box-sizing:border-box;',
    'overflow:visible;display:flex;flex-direction:column;justify-content:center;',
    'padding:80px 88px">',
    `<h1>${escaped}</h1>`,
    '</section></body></html>',
  ].join('');
  return validateHtmlArtifact(html).ok ? html : null;
}

export type SalvageCoverDraftOptions = {
  fallbackTitle?: string | null;
  lastResortTitle?: string | null;
};

/** Persist last-resort when brief/project titles are instruction or unusable chrome. */
export const LAST_RESORT_DECK_COVER_TITLE = '슬라이드';

/** Always-on 1920 cover when head-only salvage cannot read a document shell. */
export function buildLastResortCoverDraft(title?: string | null): string | null {
  const heading = decodeBasicHtmlEntities(String(title ?? '').trim());
  const usable = heading.length >= 2 && !isUnusableCoverTitle(heading)
    ? heading
    : LAST_RESORT_DECK_COVER_TITLE;
  return build1920CoverDraftHtml(usable);
}

/**
 * Head-only / kit-CSS shells never reached a slide. Persist used to skip
 * those as `incomplete-html-document-shell` → `incomplete_output`. Prefer
 * a real brief title (not Daisy chrome), then a caller fallback, then a
 * last-resort cover so top-up can append instead of auto-continue rewriting
 * from `<head>`.
 */
export function salvageTemplateFillShellAsCoverDraft(
  content: string | null | undefined,
  options?: SalvageCoverDraftOptions,
): string | null {
  const trimmed = String(content ?? '').replace(/^﻿/, '').trim();
  if (!trimmed || trimmed.length < 24) return null;
  if (!/<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(trimmed)) return null;
  if (hasTruncationSalvageableContent(trimmed) || hasSalvageableSlideContent(trimmed)) {
    return null;
  }
  // Head-only / kit-CSS shells never reached a slide. Empty / SLOT hosts
  // already did — inventing a last-resort cover would mark those as success.
  if (eachSlideHostOpenIndex(trimmed).length > 0) return null;

  const fromHtml = visibleHeadingCandidate(trimmed);
  const fallback = decodeBasicHtmlEntities(String(options?.fallbackTitle ?? '').trim());
  const lastResort = decodeBasicHtmlEntities(String(options?.lastResortTitle ?? '').trim());
  const heading = [fromHtml, fallback].find((title) => !isUnusableCoverTitle(title))
    || (lastResort.length >= 2 ? lastResort : '');
  if (!heading) return null;

  return build1920CoverDraftHtml(heading);
}

/**
 * Persist last mile for MiniMax/BYOK head-kit aborts. Cover draft returns
 * null when unclosed `<style>` CSS looks like body copy, or the fragment is
 * shorter than 24 chars. Always emit a 1920 cover so top-up can append
 * instead of `skipped-incomplete` / `incomplete-html-document-shell`.
 */
export function resolveDeckHtmlForIncompleteShellPersist(
  html: string,
  options?: SalvageCoverDraftOptions,
): string | null {
  const cover = salvageTemplateFillShellAsCoverDraft(html, {
    fallbackTitle: options?.fallbackTitle,
    lastResortTitle: options?.lastResortTitle || LAST_RESORT_DECK_COVER_TITLE,
  });
  if (cover) return cover;
  return buildLastResortCoverDraft(
    options?.lastResortTitle || options?.fallbackTitle || LAST_RESORT_DECK_COVER_TITLE,
  );
}
