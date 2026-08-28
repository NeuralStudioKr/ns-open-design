/**
 * Persist/preview heal for AI-generated deck HTML.
 *
 * Distinct from `heal-official-magazine-layout.ts` — that module only touches
 * `data-od-official-look-css` IB magazine kit. This module handles freeform
 * AI-emitted slide markup (custom `s-cover`/`s-chapter`/`s-data` classes,
 * mid-stream truncation, brief text leaked into slot text). Rules are
 * shape-based so they can never touch author catalog HTML.
 *
 * 슬라이스 0826-N01 F7: 사용자 첨부 브리핑 렌더링 회귀 5종 대응.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './deck-slide-class.js';

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' SVG ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type SlideSpan = {
  tag: string;
  attrs: string;
  start: number;
  openEnd: number;
  bodyEnd: number;
  end: number;
};

function listAiSlideSpans(html: string): SlideSpan[] {
  const openRe = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const opens: { tag: string; attrs: string; start: number; openEnd: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (!attrsLookLikeDeckOrTemplateSlideHost(match[2] ?? '')) continue;
    opens.push({
      tag: (match[1] ?? 'section').toLowerCase(),
      attrs: match[2] ?? '',
      start: match.index,
      openEnd: match.index + match[0].length,
    });
  }
  return opens.map((open, i) => {
    const limit = i + 1 < opens.length ? opens[i + 1]!.start : html.length;
    const chunk = html.slice(open.openEnd, limit);
    const close = new RegExp(`</${open.tag}\\s*>`, 'i').exec(chunk);
    const bodyEnd = close ? open.openEnd + close.index : limit;
    const end = close ? bodyEnd + close[0].length : limit;
    return { ...open, bodyEnd, end };
  });
}

/**
 * Q1 — Drop deck slides whose body is empty after fill.
 *
 * AI sometimes emits `<section class="slide s-chapter" style="..."></section>`
 * when the outline had a placeholder chapter but no content. That paints a
 * dead 1920×1080 rectangle. Drop the slide only when the body has zero
 * visible text AND no meaningful media (svg / img / video / canvas).
 *
 * Never drop the FIRST slide — even an empty cover is preferable to a deck
 * starting mid-body.
 */
export function dropEmptyLikelyDeckSlides(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    if (visibleText(body).length >= 2) continue;
    if (/<(?:svg|img|video|canvas|iframe|picture|figure)\b/i.test(body)) continue;
    // Preserve motif-only decorative shells (background-image / gradient inline styles).
    if (/\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i.test(slide.attrs)) {
      continue;
    }
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

/**
 * Q2 — Un-nest block children (div/section/aside/p) that got parsed inside
 * a heading.
 *
 * MiniMax cover fills often emit
 *   `<h1>...text...<div style="...">lede</div></h1>`
 * which is invalid: heading elements cannot contain flow blocks. Browsers
 * auto-close the h1 before the div in some cases and swallow the div text
 * as heading in others, so the lede paints inside the huge title font.
 *
 * Fix: close the heading before the first block child; keep the block as a
 * sibling AFTER the heading.
 */
export function unnestHeadingBlockChildren(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const headingRe = /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  while ((match = headingRe.exec(out)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const blockRe = /<(div|section|aside|p|ul|ol|figure|table|blockquote|main|article|header|footer)\b[^>]*>/i;
    const first = blockRe.exec(inner);
    if (!first || first.index == null) continue;
    if (first.index === 0) continue;
    const before = inner.slice(0, first.index);
    const after = inner.slice(first.index);
    if (!visibleText(before)) continue;
    patches.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: `<${tag}${attrs}>${before}</${tag}>${after}`,
    });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

/**
 * Q3 — Shrink `repeat(N, 1fr)` grids when far fewer children were emitted.
 *
 * AI outlines "네 가지 리츄얼" and picks a 4-column grid, then only fills
 * the first card. The remaining 75% width becomes an empty band. Shrink
 * columns to match the actual child count so the visible cards fill the
 * row instead. Never grow — filling missing content is not our job.
 *
 * Only shrinks when count of block children (`div`/`section`/`article`)
 * inside the grid is ≥1 and strictly less than the declared column count.
 */
export function shrinkOverAllocatedRepeatGrid(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*["'][^"']*grid-template-columns\s*:\s*repeat\s*\(\s*(\d+)\s*,[^)]+\)[^"']*["'][^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const declared = Number.parseInt(match[3] ?? '0', 10);
    if (!Number.isFinite(declared) || declared < 2) continue;
    const start = match.index;
    const openEnd = start + openTag.length;
    // Find matching close for this tag to bound the grid children.
    const scanRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    scanRe.lastIndex = openEnd;
    let depth = 1;
    let closeStart = -1;
    let closeEnd = -1;
    let tok: RegExpExecArray | null;
    while ((tok = scanRe.exec(out)) !== null) {
      if (tok[0]!.startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          closeStart = tok.index;
          closeEnd = tok.index + tok[0].length;
          break;
        }
      } else if (!tok[0]!.endsWith('/>')) {
        depth += 1;
      }
    }
    if (closeStart < 0) continue;
    const inner = out.slice(openEnd, closeStart);
    // Count DIRECT (depth-1) block children only — a card whose body
    // contains its own `<div>` rows must not inflate the child count.
    const tokenRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*(\/)?>/gi;
    let d = 0;
    let directChildren = 0;
    let tokChild: RegExpExecArray | null;
    while ((tokChild = tokenRe.exec(inner)) !== null) {
      const closing = tokChild[1] === '/';
      const tagName = (tokChild[2] ?? '').toLowerCase();
      const selfClose = tokChild[3] === '/';
      const isBlock = /^(div|section|article|li|figure|aside|header|footer|main|nav|ul|ol|p|table)$/.test(
        tagName,
      );
      if (closing) {
        d = Math.max(0, d - 1);
        continue;
      }
      if (d === 0 && isBlock) directChildren += 1;
      if (!selfClose) d += 1;
    }
    if (directChildren === 0 || directChildren >= declared) continue;
    const nextOpen = openTag.replace(
      /(grid-template-columns\s*:\s*repeat\s*\(\s*)(\d+)(\s*,[^)]+\))/i,
      (_m, head: string, _n: string, tail: string) => `${head}${directChildren}${tail}`,
    );
    patches.push({ start, end: openEnd, replacement: nextOpen });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

/**
 * Q4 — Strip AI mid-stream tag soup left after the model was cut off.
 *
 * `<div>Shado</div></div></h></div></div></section>` — a truncated
 * "Shadowing" and stray `</h>` (no digit). The stray tag either does not
 * exist in HTML, or forms an orphan single-letter close (`</h>` / `<h>`).
 * Removing them stops the browser from silently opening a phantom element
 * that swallows all following content.
 *
 * Never touch valid `h1`..`h6` — those are numbered.
 */
export function scrubTruncatedAiTagSoup(html: string): string {
  return String(html ?? '')
    .replace(/<\/?h(?![1-6])(?=[\s>/])>/gi, '')
    .replace(/<\/?h\s*>/gi, '');
}

/**
 * Q5-a — Restore missing space between Hangul noun and particle after AI
 * `<br>` splits and cleanups.
 *
 * `발화 회로 를 단련` — an authored `<br>` between "회로" and "를" leaves a
 * stray space once the `<br>` is stripped, causing the particle to detach
 * visually. Collapse the single space back into the noun so the postposition
 * reattaches (`회로를`). We only fix the well-known Korean particles.
 */
export function normalizeHangulParticleGaps(html: string): string {
  return String(html ?? '').replace(
    /([\uac00-\ud7af])\s+(를|을|이|가|은|는|에|의|와|과|도|로|으로|께|께서|한테|에서|부터|까지|만|보다|처럼|같이|마다|뿐|씩|이나|나|든지|라도|이든|든|밖에)(?=[\s<.,!?'")\]}]|$)/g,
    '$1$2',
  );
}

/**
 * Q5-b — Blank slots whose only text matches the raw user brief.
 *
 * Cover meta rows (`<div class="v">`) and footer confidentials
 * (`<span class="conf">`) sometimes leak the brief verbatim, which is
 * indistinguishable from a caption. When the brief text matches the slot
 * text (whitespace normalized), replace it with an empty inner so the slot
 * still holds layout but no raw prompt copy leaks into the page.
 */
export function scrubBriefLeakFromMetaSlots(html: string, brief?: string | null): string {
  const source = String(html ?? '');
  const briefText = String(brief ?? '').replace(/\s+/g, ' ').trim();
  if (!source || briefText.length < 4) return source;
  const briefEscaped = briefText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slotClasses = ['v', 'conf', 'kicker', 'brief', 'summary', 'note', 'lede', 'tagline'];
  let out = source;
  for (const cls of slotClasses) {
    const re = new RegExp(
      `(<(div|span|p)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>)\\s*(?:${briefEscaped})\\s*(<\\/\\2>)`,
      'gi',
    );
    out = out.replace(re, '$1$3');
  }
  return out;
}

/**
 * Combined heal for AI-generated deck HTML. Idempotent — every helper is
 * shape-based so a second pass is a no-op.
 */
/**
 * Q6 — Strip leftover instruction tails (`에 대한`, `예시에`) from headings
 * and short slots. Do not invent replacement copy.
 */
export function polishTruncatedInstructionTitles(html: string): string {
  return String(html ?? '').replace(
    /<(h[1-3]|p|div|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      if (/<(?:div|ul|ol|section|article|aside|table)\b/i.test(inner)) return full;
      const text = visibleText(inner);
      if (!/에\s*대한$|예시에?$/u.test(text)) return full;
      const next = String(inner)
        .replace(/(?:<br\s*\/?>\s*)?[,，]?\s*예시에?\s*대한\s*$/u, '')
        .replace(/(?:<br\s*\/?>\s*)?\s*에\s*대한\s*$/u, '')
        .replace(/(?:<br\s*\/?>\s*)+$/g, '')
        .trim();
      if (!next || next === inner) return full;
      return `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}

export function healAiGeneratedDeckMarkup(html: string, brief?: string | null): string {
  let out = String(html ?? '');
  if (!out.trim()) return out;
  out = scrubTruncatedAiTagSoup(out);
  out = unnestHeadingBlockChildren(out);
  out = polishTruncatedInstructionTitles(out);
  out = shrinkOverAllocatedRepeatGrid(out);
  out = normalizeHangulParticleGaps(out);
  out = scrubBriefLeakFromMetaSlots(out, brief);
  out = dropEmptyLikelyDeckSlides(out);
  return out;
}

// silence unused import when the module is bundled without callers
void escapeHtml;
