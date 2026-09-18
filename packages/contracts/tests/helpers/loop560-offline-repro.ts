import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classAttrFromOpenTag,
  classAttrHasDeckSlideToken,
} from '../../src/html/deck-slide-class.js';
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

export const LOOP560_KITS = [
  { id: 'daisy', dir: 'html-ppt-zhangzara-daisy-days' },
  { id: 'broadside', dir: 'html-ppt-zhangzara-broadside' },
  { id: 'playful', dir: 'html-ppt-zhangzara-playful' },
] as const;

const LEFTOVER = [
  { key: '개요', re: /(?<![가-힣])개요(?![가-힣])/ },
  { key: '핵심 포인트', re: /핵심\s*포인트/ },
  { key: '탐색실행확장', re: /탐색[\s\S]{0,80}실행[\s\S]{0,80}확장/ },
  { key: '실무자', re: /(?<![가-힣])실무자(?![가-힣])/ },
  { key: '파일럿', re: /(?<![가-힣])파일럿(?![가-힣])/ },
  { key: '영문데모', re: /Daisy Days|Welcome to Today|A Wise Educator|Creative Direction|What We Will Cover Today|The Collective|hello@example\.studio|this is the broadside style|\[Studio X\]\s*Guidelines/ },
  { key: '$3.5B', re: /\$3\.5B/ },
  { key: '3x', re: /\b3\s*[×xX]\b/ },
  { key: '#1', re: /#1\s*App Store/ },
  { key: '47', re: /(?<![가-힣\w])47(?![가-힣\w])/ },
  { key: '98%', re: /\b98\s*%/ },
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

function realSlideShells(html: string) {
  return listTemplateCloneSlideShells(html).filter((shell) => (
    classAttrHasDeckSlideToken(classAttrFromOpenTag(shell.attrs))
  ));
}

function keepFirstSlides(html: string, keep: number): string {
  const sectionMatches = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .filter((match) => classAttrHasDeckSlideToken(classAttrFromOpenTag(match[1] ?? '')));
  if (sectionMatches.length > keep) {
    let out = html;
    for (let i = sectionMatches.length - 1; i >= keep; i -= 1) {
      const match = sectionMatches[i]!;
      const start = match.index ?? 0;
      out = `${out.slice(0, start)}${out.slice(start + match[0].length)}`;
    }
    return out;
  }
  const shells = realSlideShells(html);
  if (shells.length <= keep) return html;
  let out = html;
  for (let i = shells.length - 1; i >= keep; i -= 1) {
    const block = shells[i]!.full;
    const start = out.lastIndexOf(block);
    if (start < 0) continue;
    out = `${out.slice(0, start)}${out.slice(start + block.length)}`;
  }
  return out;
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
    dayCard: (html.match(/\bday-card\b/g) ?? []).length,
    infoCard: (html.match(/\binfo-card\b/g) ?? []).length,
    stat: (html.match(/\bstat-card\b|\bstat-item\b/g) ?? []).length,
    pie: (html.match(/\bpie-item\b/g) ?? []).length,
    emptySlot: (html.match(/>(?:\s|&nbsp;)*<\/(?:h[1-3]|p|div|span)>/g) ?? []).length,
  };
}

function hangulSpacingOk(html: string): boolean {
  const text = visible(html);
  return !/고객경험|파일떴|희대다/.test(text);
}

export type Loop560QualityRow = {
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

export function scoreDeck(kit: string, path: string, html: string, previewSlides: number): Loop560QualityRow {
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

export function runLoop560OfflineRepro(): Loop560QualityRow[] {
  const rows: Loop560QualityRow[] = [];
  for (const kit of LOOP560_KITS) {
    const seed = readFileSync(join(EXAMPLES, kit.dir, 'example.html'), 'utf8');
    const previewSlides = realSlideShells(seed).length || listTemplateCloneSlideShells(seed).length;
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
    const fillName = `loop560-live-${kit.id}.html`;
    writeFixture(fillName, healed);
    rows.push(scoreDeck(kit.id, dirname(fillName) === FIXTURES ? fillName : fillName, healed, previewSlides));

    const twoOutline = resolveTemplateCloneSlidesForDeterministicFill({
      userInstruction: BRIEF,
      deckTitle: BRIEF,
      slideCount: 2,
    });
    const twoFilled = buildTemplateClonedDeckHtml(seed, twoOutline, {
      title: BRIEF,
      brief: BRIEF,
      padToSeedSlideCount: false,
      maxSlides: 2,
    }) || keepFirstSlides(seed, 2);
    const recovered = recoverShortDeckByPaddingToSeed({
      seedHtml: seed,
      modelHtml: twoFilled,
      brief: BRIEF,
      deckTitle: BRIEF,
      forcePad: true,
    });
    const padded = salvageMalformedMiniMaxSlideMarkup(recovered?.html || twoFilled, BRIEF);
    const padName = `loop560-live-${kit.id}-pad.html`;
    writeFixture(padName, padded);
    rows.push(scoreDeck(`${kit.id}-pad`, padName, padded, previewSlides));
  }
  return rows;
}
