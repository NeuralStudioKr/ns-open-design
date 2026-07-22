/**
 * Pre-write structural sniff for AI-emitted HTML artifacts.
 *
 * Defends the project-file persistence path (`persistArtifact` →
 * `writeProjectTextFile`) against the failure mode in #50 / #1143 where the
 * model emits an `<artifact type="text/html">…</artifact>` block whose body is
 * a prose summary instead of a complete document. Without this gate, such
 * content lands on disk as a real `.html` file with `kind: html` manifest and
 * pollutes the project file panel as a phantom artifact tab.
 *
 * Policy (intentionally narrow — false positives here block real saves):
 * - non-empty after trimming BOM and leading whitespace
 * - meets a minimum length threshold
 * - the *first* non-whitespace token is `<!doctype html>` or `<html`
 *   (anchored at the start; mid-string mentions of these tags do NOT count —
 *   AI prose like "Updated the <html lang> attribute…" must be rejected)
 * - URL-bearing attributes or CSS `url(...)` / `@import` values do not point at
 *   internal project storage paths such as `.live-artifacts/`, `.od/`, or `.tmp/`
 *
 * What this gate is NOT:
 * - It is **not** an HTML linter or validator. Malformed but recognizably
 *   document-shaped HTML passes; only content that obviously isn't a document
 *   fails. The guarantee is "blocks obvious prose-as-HTML", not "validates
 *   well-formed HTML."
 * - It does **not** cover `.jsx` / `.tsx` artifacts or any other type — the
 *   `persistArtifact` caller only invokes this for `ext === '.html'`. This is
 *   not a generalized artifact-validation framework.
 * - It does **not** apply to user-driven saves via `FileViewer` /
 *   `FileWorkspace`; those go through a different code path and may
 *   legitimately save partial drafts.
 *
 * Threshold note: 64 chars rejects minimal empty-body documents like
 * `<!doctype html><html><body></body></html>` (49 chars) and
 * `<html><head></head><body></body></html>` (39 chars). That is intentional
 * for *writes* — AI-emitted artifacts in this product are expected to be
 * non-trivial deliverables. Callers must treat document-shaped shells as a
 * silent skip (not a user-facing refusal banner): models often emit an empty
 * scaffold before the real deck lands, and surfacing "저장을 거부했습니다"
 * mid-turn looks like a product failure during demos.
 */

const MIN_HTML_LENGTH = 64;
const STARTS_WITH_DOCUMENT_RE = /^(?:<!doctype\s+html\b|<html\b)/i;
const RESERVED_PROJECT_PATH_RE = /(?:^|\/|\.\/)(?:\.live-artifacts|\.od|\.tmp)(?=$|[/?#"'`\s>)])/i;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const URL_ATTRIBUTE_RE =
  /\b(href|src|srcset|poster|action|formaction|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;
const STYLE_ATTRIBUTE_RE =
  /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;
const HTML_TAG_RE = /<[a-z][^>]*>/gi;
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_URL_RE = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
const CSS_IMPORT_RE =
  /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')/gi;

export type HtmlArtifactValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateHtmlArtifact(content: string): HtmlArtifactValidationResult {
  const trimmed = content.replace(/^﻿/, '').trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty content' };
  }
  if (trimmed.length < MIN_HTML_LENGTH) {
    return { ok: false, reason: `content too short to be HTML (got ${trimmed.length} chars, need ≥${MIN_HTML_LENGTH})` };
  }
  if (!STARTS_WITH_DOCUMENT_RE.test(trimmed)) {
    return { ok: false, reason: 'content does not start with <!doctype html> or <html — looks like prose, not a complete HTML document' };
  }
  if (referencesReservedProjectPath(trimmed)) {
    return { ok: false, reason: 'content references an internal project storage path such as .live-artifacts, .od, or .tmp' };
  }
  return { ok: true };
}

/**
 * Empty-body heuristic applies to every closed document shell, including
 * multi-KB CSS chrome. Size alone never proves previewable content — a
 * 3KB stylesheet wrapping empty / SLOT-only slides used to skip this
 * check and persist as a blank white "성공" deck.
 *
 * Above STRUCTURAL_CLOSURE_CHECK_MIN we still enforce `</html>` present
 * because a mid-KB artifact that starts with `<!doctype html>` but has no
 * closing tag was mid-stream truncated. Below that floor, browsers'
 * implicit-close behavior is allowed for tiny embeds with real body text.
 */
const STRUCTURAL_CLOSURE_CHECK_MIN = 128;
const HAS_HTML_CLOSE_RE = /<\/html\s*>/i;

/**
 * Empty / scaffold HTML the model emits before real slide content.
 * Persist callers should skip silently — do not flash a refusal banner.
 *
 * Covers four failure modes observed in demos:
 *   1. classic too-short shell (39–63 chars),
 *   2. longer doctype+meta scaffolds whose `<body>` still has no visible
 *      content (charset-only heads that pass the 64-char length gate),
 *   3. mid-stream truncation where the model emitted a few KB of
 *      `<head>` / `<style>` / partial `<body>` content but never reached
 *      `</html>` — an artifact:end fired by parser.flush() on an unclosed
 *      `<artifact>` block. Rendering that in the iframe shows a blank page
 *      because most rendering engines wait for the closing tag; the run
 *      should be flagged as incomplete so auto-continue kicks in,
 *   4. closed multi-KB CSS chrome with empty / SLOT-only `<section class="slide">`
 *      bodies — previously skipped the emptiness check above 2KB and
 *      persisted as a "successful" blank white deck.
 */
export function isIncompleteHtmlDocumentShell(content: string): boolean {
  const trimmed = content.replace(/^﻿/, '').trim();
  if (trimmed.length === 0) return false;
  if (!STARTS_WITH_DOCUMENT_RE.test(trimmed)) return false;
  if (trimmed.length < MIN_HTML_LENGTH) return true;
  // Truncation gate: any doctype-anchored artifact large enough to be a
  // real deliverable must carry `</html>`. Missing closer = mid-stream
  // truncation, regardless of how much prose/CSS the head accumulated.
  if (
    trimmed.length >= STRUCTURAL_CLOSURE_CHECK_MIN
    && !HAS_HTML_CLOSE_RE.test(trimmed)
  ) {
    return true;
  }
  // Always run the emptiness / SLOT check — size alone never proves the
  // body has previewable content (large CSS + empty slides was a demo bug).
  return isEffectivelyEmptyHtmlBody(trimmed);
}

function isEffectivelyEmptyHtmlBody(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(withoutComments);
  const body = bodyMatch ? bodyMatch[1]! : withoutComments;
  const withoutNoise = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  // Media / replaced elements count as deliverable content even without text.
  // Empty containers (`<section class="slide"></section>`, SLOT-comment-only
  // sections after comment strip) must NOT — those were the demo failure mode
  // where persist succeeded and the iframe showed a blank white deck.
  if (
    /<(img|video|audio|canvas|svg|iframe|picture|object|embed)\b/i
      .test(withoutNoise)
  ) {
    return false;
  }
  const text = withoutNoise
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length === 0;
}

function referencesReservedProjectPath(content: string): boolean {
  return hasReservedProjectPathInTags(content)
    || hasReservedProjectPathInStyleBlocks(content);
}

function hasReservedProjectPathInTags(content: string): boolean {
  HTML_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_TAG_RE.exec(content)) !== null) {
    const tag = match[0] ?? '';
    if (hasReservedProjectPathAttribute(tag) || hasReservedProjectPathInStyleAttributes(tag)) {
      return true;
    }
  }
  return false;
}

function hasReservedProjectPathAttribute(tag: string): boolean {
  URL_ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_ATTRIBUTE_RE.exec(tag)) !== null) {
    const attributeName = match[1]?.toLowerCase();
    const candidate = match[2] ?? match[3] ?? match[4] ?? '';
    if (candidateReferencesReservedProjectPath(candidate, attributeName === 'srcset')) {
      return true;
    }
  }
  return false;
}

function hasReservedProjectPathInStyleAttributes(tag: string): boolean {
  STYLE_ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLE_ATTRIBUTE_RE.exec(tag)) !== null) {
    const cssText = match[1] ?? match[2] ?? match[3] ?? '';
    if (cssTextReferencesReservedProjectPath(cssText)) {
      return true;
    }
  }
  return false;
}

function hasReservedProjectPathInStyleBlocks(content: string): boolean {
  STYLE_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STYLE_BLOCK_RE.exec(content)) !== null) {
    const cssText = match[1] ?? '';
    if (cssTextReferencesReservedProjectPath(cssText)) {
      return true;
    }
  }
  return false;
}

function cssTextReferencesReservedProjectPath(cssText: string): boolean {
  for (const pattern of [CSS_URL_RE, CSS_IMPORT_RE]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cssText)) !== null) {
      const candidate = match.slice(1).find((value) => value !== undefined) ?? '';
      if (candidateReferencesReservedProjectPath(candidate, false)) {
        return true;
      }
    }
  }
  return false;
}

function candidateReferencesReservedProjectPath(candidate: string, splitCandidates: boolean): boolean {
  const paths = splitCandidates ? srcsetCandidateUrls(candidate) : [firstUrlToken(candidate)];
  return paths.some((path) => {
    if (!isLocalPathLike(path)) {
      return false;
    }
    return RESERVED_PROJECT_PATH_RE.test(pathnameOnly(path));
  });
}

function pathnameOnly(path: string): string {
  const separator = path.search(/[?#]/);
  if (separator === -1) {
    return path;
  }
  return path.slice(0, separator);
}

function srcsetCandidateUrls(srcset: string): string[] {
  const candidates: string[] = [];
  let start = 0;
  let sawCandidate = false;
  let dataUrlCandidate = false;
  let sawWhitespaceAfterUrl = false;

  for (let index = 0; index < srcset.length; index += 1) {
    const char = srcset[index]!;
    if (!sawCandidate) {
      if (char === ',' || /\s/.test(char)) {
        start = index + 1;
        continue;
      }
      sawCandidate = true;
      dataUrlCandidate = /^data:/i.test(srcset.slice(index));
    }
    if (/\s/.test(char)) {
      sawWhitespaceAfterUrl = true;
      continue;
    }
    if (char === ',' && (!dataUrlCandidate || sawWhitespaceAfterUrl)) {
      candidates.push(srcset.slice(start, index));
      start = index + 1;
      sawCandidate = false;
      dataUrlCandidate = false;
      sawWhitespaceAfterUrl = false;
    }
  }

  candidates.push(srcset.slice(start));
  return candidates.map(firstUrlToken).filter(Boolean);
}

function firstUrlToken(value: string): string {
  return value.trim().split(/\s+/)[0] ?? '';
}

function isLocalPathLike(path: string): boolean {
  return path.length > 0
    && !path.startsWith('#')
    && !path.startsWith('//')
    && !URL_SCHEME_RE.test(path);
}
