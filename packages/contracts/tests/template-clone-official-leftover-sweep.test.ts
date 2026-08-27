/**
 * 0826-N01 F5 — every official *deck* example cloned with an empty
 * Korean-topic outline must not keep catalog demo proper nouns.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTemplateClonedDeckHtml } from '../src/template-clone-fill';

const EXAMPLES_ROOT = resolve(__dirname, '../../../plugins/_official/examples');
const TITLE = '영어 회화 표현 공부 팁, 예시에';

const DEMO_PROPER_NOUNS = [
  /Hartfield/i,
  /NorthPeak/i,
  /Project Atlas/i,
  /WACC\s*\(/i,
  /Filebase/i,
  /Northwind/i,
  /Daisy Days/i,
  /pitch-agent/i,
  /Margaret Eun/i,
  /Board approval/i,
  /fictional illustrative/i,
  /Synthetic Open Design demo dataset/i,
  /ib-check-deck/i,
  /Maison Nocturne/i,
  /Maya Chen/i,
  /Apex Group/i,
  /Lorem ipsum/i,
  /Mina Kovac/i,
  /OPERATION HALCYON/i,
  /Quartz\. Confluence/i,
  /hermes-agent/i,
  /Team Structure/i,
  /pnpm vitest auth/i,
];

function listDeckExamples(): string[] {
  const names = readdirSync(EXAMPLES_ROOT);
  const decks: string[] = [];
  for (const name of names) {
    const htmlPath = join(EXAMPLES_ROOT, name, 'example.html');
    try {
      if (!statSync(htmlPath).isFile()) continue;
    } catch {
      continue;
    }
    const html = readFileSync(htmlPath, 'utf8');
    if (!/<(?:section|div)\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?slide(?:\s[^"']*)?["']/i.test(html)) continue;
    decks.push(name);
  }
  return decks.sort();
}

function visibleBody(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
}

describe('official deck leftover sweep (0826-N01 F5)', () => {
  const decks = listDeckExamples();

  it('finds official slide decks to sweep', () => {
    expect(decks.length).toBeGreaterThan(8);
  });

  for (const name of decks) {
    it(`${name} empty Clone drops catalog demo nouns`, () => {
      const html = readFileSync(join(EXAMPLES_ROOT, name, 'example.html'), 'utf8');
      const cloned = buildTemplateClonedDeckHtml(html, [], {
        title: TITLE,
        maxSlides: 6,
      });
      if (!cloned) return;
      const visible = visibleBody(cloned!);
      const hits = DEMO_PROPER_NOUNS.filter((re) => re.test(visible)).map((re) => String(re));
      expect(hits, name).toEqual([]);
    });
  }
});
