import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTemplateClonedDeckHtml,
  listTemplateCloneSlideShells,
  recoverShortDeckByPaddingToSeed,
  resolveTemplateCloneSlidesForDeterministicFill,
  salvageMalformedMiniMaxSlideMarkup,
} from '../../src/template-clone-fill.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const EXAMPLES = join(REPO_ROOT, 'plugins/_official/examples');
const FIXTURES = join(REPO_ROOT, 'packages/contracts/tests/fixtures');
const BRIEF = 'Teamver 소개';

export const LOOP558_KITS = [
  { id: 'block-frame', dir: 'html-ppt-zhangzara-block-frame' },
  { id: 'cobalt-grid', dir: 'html-ppt-zhangzara-cobalt-grid' },
  { id: 'product-launch', dir: 'html-ppt-product-launch' },
  { id: 'grove', dir: 'html-ppt-zhangzara-grove' },
  { id: 'studio', dir: 'html-ppt-zhangzara-studio' },
] as const;

const LEFTOVER = [
  { key: '개요', re: /(?<![가-힣])개요(?![가-힣])/ },
  { key: '핵심 포인트', re: /핵심\s*포인트/ },
  { key: '탐색실행확장', re: /탐색[\s\S]{0,80}실행[\s\S]{0,80}확장/ },
  { key: '실무자', re: /(?<![가-힣])실무자(?![가-힣])/ },
  { key: 'Halo', re: /\bHalo\b/ },
  { key: '$', re: /\$\s*(?:179|279|399)/ },
  { key: 'WHO WE ARE', re: /WHO WE ARE/ },
  { key: 'landscape', re: /The landscape has shifted/ },
  { key: '73%', re: /73\s*%/ },
  { key: '4.8×', re: /4\.8\s*[×xX]/ },
  { key: '고객경험', re: /고객경험/ },
] as const;

function visible(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keepFirstSlides(html: string, keep: number): string {
  const matches = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .filter((match) => /\bslide\b/i.test(match[1] ?? ''));
  if (matches.length <= keep) return html;
  const first = matches[0]!;
  const last = matches[keep - 1]!;
  const start = first.index ?? 0;
  const end = (last.index ?? 0) + last[0].length;
  const head = html.slice(0, start);
  const kept = html.slice(start, end);
  const after = html.slice(end);
  const closer = /<\/(?:div|main|body|html)>/i.exec(after);
  const tail = closer ? after.slice(closer.index) : '</body></html>';
  return `${head}${kept}${tail}`;
}

function leftoverHits(html: string): string[] {
  const text = visible(html);
  return LEFTOVER.filter((row) => row.re.test(text)).map((row) => row.key);
}

function slideSentences(html: string): string[] {
  return listTemplateCloneSlideShells(html).map((shell) => {
    const chunk = visible(html.slice(shell.start, shell.end));
    return chunk.slice(0, 80);
  });
}

function uniqueRatio(sentences: string[]): number {
  if (sentences.length === 0) return 0;
  return new Set(sentences.map((s) => s.replace(/\s+/g, ' ').trim())).size / sentences.length;
}

function padCount(html: string): number {
  return (html.match(/data-teamver-pad="short-response"/g) ?? []).length;
}

function slotCounts(html: string): Record<string, number> {
  return {
    vbig: (html.match(/\bvbig\b/g) ?? []).length,
    qr: (html.match(/\bqr-block\b|\bclass="[^"]*\bqr\b/g) ?? []).length,
    chart: (html.match(/\bbar-col\b|\bchart-wrapper\b|\bchart-svg\b/g) ?? []).length,
    groveStat: (html.match(/\bgrove-stat\b/g) ?? []).length,
    statCard: (html.match(/\bstat-card\b/g) ?? []).length,
  };
}

function hangulSpacingOk(html: string): boolean {
  const text = visible(html);
  return !/고객경험|파일떴|희대다/.test(text);
}

export type Loop558QualityRow = {
  kit: string;
  path: string;
  slides: number;
  leftover: string[];
  unique: number;
  pad: number;
  hangulOk: boolean;
  slots: Record<string, number>;
  previewSlides: number;
};

export function scoreDeck(kit: string, path: string, html: string, previewSlides: number): Loop558QualityRow {
  return {
    kit,
    path,
    slides: listTemplateCloneSlideShells(html).length,
    leftover: leftoverHits(html),
    unique: Number(uniqueRatio(slideSentences(html)).toFixed(2)),
    pad: padCount(html),
    hangulOk: hangulSpacingOk(html),
    slots: slotCounts(html),
    previewSlides,
  };
}

function writeFixture(name: string, html: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const dest = join(FIXTURES, name);
  writeFileSync(dest, html, 'utf8');
  return dest;
}

export function runLoop558OfflineRepro(): Loop558QualityRow[] {
  const rows: Loop558QualityRow[] = [];
  for (const kit of LOOP558_KITS) {
    const seed = readFileSync(join(EXAMPLES, kit.dir, 'example.html'), 'utf8');
    const previewSlides = listTemplateCloneSlideShells(seed).length;
    const outline = resolveTemplateCloneSlidesForDeterministicFill({
      userInstruction: BRIEF,
      deckTitle: BRIEF,
      slideCount: previewSlides,
    });
    const filled = buildTemplateClonedDeckHtml(seed, outline, {
      title: BRIEF,
      brief: BRIEF,
      padToSeedSlideCount: true,
      maxSlides: previewSlides,
    });
    const healed = salvageMalformedMiniMaxSlideMarkup(filled || seed, BRIEF);
    const fillPath = writeFixture(`loop558-live-${kit.id}.html`, healed);
    rows.push(scoreDeck(kit.id, dirname(fillPath) === FIXTURES ? `loop558-live-${kit.id}.html` : fillPath, healed, previewSlides));

    const two = keepFirstSlides(seed, 2);
    const recovered = recoverShortDeckByPaddingToSeed({
      seedHtml: seed,
      modelHtml: two,
      brief: BRIEF,
      deckTitle: BRIEF,
      forcePad: true,
    });
    const padded = salvageMalformedMiniMaxSlideMarkup(recovered?.html || two, BRIEF);
    const padName = `loop558-live-${kit.id}-pad.html`;
    writeFixture(padName, padded);
    rows.push(scoreDeck(`${kit.id}-pad`, padName, padded, previewSlides));
  }
  return rows;
}
