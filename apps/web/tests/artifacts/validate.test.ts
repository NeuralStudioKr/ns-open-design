import { describe, expect, it } from 'vitest';

import { isIncompleteHtmlDocumentShell, validateHtmlArtifact } from '../../src/artifacts/validate';

describe('validateHtmlArtifact', () => {
  it('rejects an empty string', () => {
    const result = validateHtmlArtifact('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it('rejects whitespace-only content', () => {
    const result = validateHtmlArtifact('   \n\t  ');
    expect(result.ok).toBe(false);
  });

  it('rejects a one-line prose summary (the #50 phantom-artifact case)', () => {
    const prose = '查看 `html-ppt-xhs-white-editorial/index.html` — 已删第 2 页（章节分隔）和第 8 页（致谢），剩余 6 张移除顶部 chrome，仅保留右下角 `01/06`–`06/06` 页码。';
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/html/i);
  });

  it('rejects content shorter than the minimum threshold even if it contains angle brackets', () => {
    const result = validateHtmlArtifact('<p>hi</p>');
    expect(result.ok).toBe(false);
  });

  it('classifies empty document shells so callers can skip without a refusal banner', () => {
    const shell = '<html><head></head><body></body></html>';
    expect(shell.length).toBe(39);
    expect(validateHtmlArtifact(shell).ok).toBe(false);
    expect(isIncompleteHtmlDocumentShell(shell)).toBe(true);
    expect(isIncompleteHtmlDocumentShell('<p>hi</p>')).toBe(false);
    expect(isIncompleteHtmlDocumentShell('보기만 한 요약입니다.')).toBe(false);
  });

  it('classifies longer charset-only scaffolds as incomplete shells', () => {
    const shell =
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body></body></html>';
    expect(shell.length).toBeGreaterThan(64);
    expect(validateHtmlArtifact(shell).ok).toBe(true);
    expect(isIncompleteHtmlDocumentShell(shell)).toBe(true);
  });

  it('does not treat large div-only documents as incomplete shells', () => {
    const pad = 'x'.repeat(2200);
    const large =
      `<!doctype html><html><head><meta charset="utf-8"><style>.a{content:"${pad}"}</style></head>`
      + `<body><div id="root"></div></body></html>`;
    expect(large.length).toBeGreaterThan(2048);
    expect(isIncompleteHtmlDocumentShell(large)).toBe(false);
  });

  it('classifies a mid-stream truncated doctype+head+style artifact as an incomplete shell', () => {
    // Simulates parser.flush() over an unclosed <artifact> tag: the model
    // produced multiple KB of CSS inside <head> before the response was cut
    // by max_tokens (or an SSE disconnect), so no </html> ever arrived. The
    // preview iframe cannot render a deck from this; the run must fall
    // through to auto-continue instead of being counted as "완료됨".
    const paddedStyle = '.card{padding:1rem;color:#333;}'.repeat(200);
    const truncated =
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${paddedStyle}</style></head>`
      + `<body><section class="slide active"><h1>Cover</h1></section>`;
    expect(truncated.length).toBeGreaterThan(2048);
    expect(truncated.includes('</html>')).toBe(false);
    expect(isIncompleteHtmlDocumentShell(truncated)).toBe(true);
  });

  it('classifies a mid-KB head-only truncation as an incomplete shell', () => {
    // Head-only truncation between the classic 40-byte scaffold and the
    // multi-KB density (e.g. 700–1500 bytes of `<meta>` / `<style>` prose
    // with no `<body>` and no `</html>`). The 2048-byte body-emptiness
    // window catches this alongside the closure gate above so both slices
    // reject uniformly.
    const shortishTrunc =
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Deck</title>`
      + `<style>${'body{margin:0;}'.repeat(30)}</style>`;
    expect(shortishTrunc.length).toBeGreaterThan(128);
    expect(shortishTrunc.length).toBeLessThan(2048);
    expect(shortishTrunc.includes('</html>')).toBe(false);
    expect(isIncompleteHtmlDocumentShell(shortishTrunc)).toBe(true);
  });

  it('accepts a short doctype+body document that omits an explicit </html> close', () => {
    // Below the 128-byte structural-closure floor, still allow browsers'
    // implicit-close behavior — a tiny embed snippet without </html> that
    // meets the length + doctype + structural-body gates should not be
    // flagged as truncated. This keeps the truncation heuristic from
    // over-firing on hand-crafted one-liner shells shorter than any
    // realistic deck deliverable.
    const nearFloor =
      '<!doctype html><html><body><p>ok, this content is real deliverable text.</p></body>';
    expect(nearFloor.length).toBeGreaterThanOrEqual(64);
    expect(nearFloor.length).toBeLessThan(128);
    expect(nearFloor.includes('</html>')).toBe(false);
    // Structural closure gate does not fire below the 128-byte floor; the
    // body check still passes because <p> is a structural tag with text
    // content inside it.
    expect(isIncompleteHtmlDocumentShell(nearFloor)).toBe(false);
  });

  it('classifies empty slide sections / SLOT-only shells as incomplete', () => {
    // Empty <section class="slide"> used to pass because any structural tag
    // counted as content — persist then opened a blank white iframe ("완료됨"
    // with empty preview). SLOT comments are stripped before the emptiness
    // check, so comment-only slides must also fail.
    const emptySection =
      '<!doctype html><html><head><meta charset="utf-8"></head><body><section class="slide"></section></body></html>';
    expect(isIncompleteHtmlDocumentShell(emptySection)).toBe(true);

    const slotOnly =
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<section class="slide"><!-- SLOT: slide 1 content --></section>'
      + '<section class="slide"><!-- SLOT: slide 2 content --></section>'
      + '</body></html>';
    expect(isIncompleteHtmlDocumentShell(slotOnly)).toBe(true);

    const filled =
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<section class="slide"><h1>Cover</h1><p>Real copy for the deck.</p></section>'
      + '</body></html>';
    expect(isIncompleteHtmlDocumentShell(filled)).toBe(false);
  });

  it('rejects a long prose blob that lacks any HTML structural markers', () => {
    const prose = '这是一段很长的中文总结，'.repeat(20);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects long prose that mentions an inline <html ...> tag mid-sentence (mrcfps finding)', () => {
    const prose = 'Updated the <html lang> attribute and cleaned up the footer layout for mobile previews.';
    expect(prose.length).toBeGreaterThan(64);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects long prose that mentions <!doctype html> mid-sentence', () => {
    const prose = 'I added a <!doctype html> declaration at the top and rewrote the body section to match the brief.';
    expect(prose.length).toBeGreaterThan(64);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects content where the first non-whitespace token is a non-document tag like <p>', () => {
    const fragment = '<p>This is a paragraph that happens to contain enough chars and a stray <html> mention.</p>';
    const result = validateHtmlArtifact(fragment);
    expect(result.ok).toBe(false);
  });

  it('rejects links to reserved project storage paths', () => {
    const html = '<!doctype html><html><body><iframe src=".live-artifacts/artifact-1/index.html"></iframe><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/internal project storage path/i);
  });

  it('rejects root reserved project storage paths in URL attributes', () => {
    const html = '<!doctype html><html><body><a href="/.live-artifacts">Preview</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/internal project storage path/i);
  });

  it('rejects unquoted URL attributes that reference reserved storage', () => {
    const html = '<!doctype html><html><body><img src=./.od/thumb.png alt="Preview"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects CSS url references to reserved storage', () => {
    const html = '<!doctype html><html><head><style>.card{background-image:url("/.tmp/preview.png")}</style></head><body><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects CSS import references to reserved storage', () => {
    const html = '<!doctype html><html><head><style>@import "/.od/foo.css";@import url(./.tmp/theme.css);</style></head><body><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects inline style url references to reserved storage', () => {
    const html = '<!doctype html><html><body><div style="background-image:url(./.tmp/preview.png)">Preview</div><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects srcset candidates that reference reserved storage', () => {
    const html = '<!doctype html><html><body><img srcset="assets/preview.png 1x, /.live-artifacts/artifact-1/preview.png 2x" alt="Preview"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('accepts plain text mentions of reserved directory names', () => {
    const html = '<!doctype html><html><body><p>The .od folder and .tmp files are mentioned as documentation text only, not linked paths.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts external URLs with reserved-looking path segments', () => {
    const html = '<!doctype html><html><body><a href="https://example.test/.od/reference.html">External docs</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts local URLs that only mention reserved paths in query or hash', () => {
    const html = '<!doctype html><html><head><style>.card{background-image:url("/docs?example=/.od/ref")}</style></head><body><a href="/docs?example=/.od/ref">Query docs</a><a href="/docs#/.tmp/ref">Hash docs</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts text-node mentions of CSS url syntax for reserved names', () => {
    const html = '<!doctype html><html><body><p>Documentation can mention CSS examples like url("/.tmp/foo.png") without linking to project storage.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts text-node mentions of HTML attribute syntax for reserved names', () => {
    const html = '<!doctype html><html><body><p>Documentation can mention examples like href="/.od/reference.html" without linking to project storage.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts data URLs with reserved-looking payload text', () => {
    const html = '<!doctype html><html><body><img src="data:text/plain,/.od/foo" alt="Inline payload"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts data URLs with reserved-looking payload text in srcset', () => {
    const html = '<!doctype html><html><body><img srcset="data:text/plain,/.od/foo 1x" alt="Inline payload"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts the supported live artifact preview API route', () => {
    const html = '<!doctype html><html><body><iframe src="/api/live-artifacts/artifact-1/preview"></iframe><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts a complete <!doctype html> document', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><h1>hello</h1></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts content with a leading <html> tag (no doctype)', () => {
    const html = '<html><head><title>x</title></head><body><div>content here long enough</div></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('is case-insensitive on the doctype / html tag check', () => {
    const html = '<!DOCTYPE HTML><HTML><BODY><DIV>hello world content</DIV></BODY></HTML>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('tolerates leading whitespace and BOM before the doctype', () => {
    const html = '﻿\n  <!doctype html>\n<html><body>real document body content</body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });
});
