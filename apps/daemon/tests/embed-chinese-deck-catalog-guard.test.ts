/**
 * Guard: bundled deck example / design-template previews that are Chinese-primary
 * must be covered by embed-chinese-deck-policy (denylist and/or od.content_locale).
 *
 * Catches regressions like `deck-open-slide-canvas` (Korean card title with zh-CN
 * example.html) or bare folder ids (`html-ppt-presenter-mode-reveal`) slipping past.
 */

import path from 'node:path';
import url from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  isChinesePrimaryDeckTemplate,
  readOdContentLocale,
  resolveChineseDeckTemplateId,
} from '@open-design/contracts';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const examplesRoot = path.join(repoRoot, 'plugins', '_official', 'examples');
const designTemplatesRoot = path.join(repoRoot, 'design-templates');

const HAN = /[\u4e00-\u9fff]/g;
const LATIN = /[A-Za-z]/g;

function thumbChineseRatio(html: string): { ratio: number; lang: string } {
  const langMatch = html.match(/lang=["']([^"']+)/i);
  const lang = (langMatch?.[1] ?? '').trim().toLowerCase();
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const bodyMatch = stripped.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const text = (bodyMatch?.[1] ?? stripped)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  const han = (text.match(HAN) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  const denom = han + latin;
  return { ratio: denom === 0 ? 0 : han / denom, lang };
}

function isChinesePrimaryPreview(html: string): boolean {
  const { ratio, lang } = thumbChineseRatio(html);
  // lang=zh alone is insufficient (some EN zhangzara decks mis-tag lang).
  // Require measurable Chinese text in the first-slide thumb window.
  if (lang.startsWith('zh') && ratio >= 0.15) return true;
  // Mixed EN chrome + Chinese body (e.g. Swiss KPI slide) — catch mid ratios.
  if (ratio >= 0.22) return true;
  return false;
}

function isTaggedZh(contentLocale: string | null): boolean {
  if (!contentLocale) return false;
  const normalized = contentLocale.trim().toLowerCase().replace(/_/g, '-');
  return normalized === 'zh-cn' || normalized === 'zh';
}

async function resolveExampleHtml(dir: string): Promise<string | null> {
  const direct = path.join(dir, 'example.html');
  try {
    return await readFile(direct, 'utf8');
  } catch {
    /* fall through */
  }
  try {
    const assetsDir = path.join(dir, 'assets');
    const names = await readdir(assetsDir);
    const candidate = names.find((n) => /^example.*\.html$/i.test(n));
    if (!candidate) return null;
    return await readFile(path.join(assetsDir, candidate), 'utf8');
  } catch {
    return null;
  }
}

async function assertChineseDecksCovered(
  catalogRoot: string,
  kind: 'plugin' | 'design-template',
): Promise<string[]> {
  const entries = await readdir(catalogRoot, { withFileTypes: true });
  const misses: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(catalogRoot, entry.name);
    let contentLocale: string | null = null;
    let pluginOrTemplateId = entry.name;
    let mode: string | undefined;

    if (kind === 'plugin') {
      let manifest: { name?: string; od?: { mode?: string; content_locale?: string } };
      try {
        manifest = JSON.parse(await readFile(path.join(dir, 'open-design.json'), 'utf8'));
      } catch {
        continue;
      }
      mode = manifest.od?.mode;
      contentLocale = readOdContentLocale(manifest.od);
      if (typeof manifest.name === 'string') pluginOrTemplateId = manifest.name;
    } else {
      try {
        const skill = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
        const modeMatch = skill.match(/^  mode:\s*(\S+)/m);
        mode = modeMatch?.[1];
        const localeMatch = skill.match(/^  content_locale:\s*(\S+)/m);
        contentLocale = localeMatch?.[1] ?? null;
      } catch {
        continue;
      }
    }

    if (mode !== 'deck') continue;

    const html = await resolveExampleHtml(dir);
    const chinesePreview = html ? isChinesePrimaryPreview(html) : false;
    const taggedZh = isTaggedZh(contentLocale);
    if (!chinesePreview && !taggedZh) continue;

    const idsToCheck = new Set<string>([pluginOrTemplateId, entry.name]);
    const covered = [...idsToCheck].some((id) =>
      isChinesePrimaryDeckTemplate({ id, contentLocale }),
    );
    if (!covered) {
      const templateId = resolveChineseDeckTemplateId(pluginOrTemplateId);
      misses.push(
        `${kind}:${pluginOrTemplateId} (folder=${entry.name}, template=${templateId}, preview=${chinesePreview}, locale=${contentLocale ?? 'null'})`,
      );
    }
  }

  return misses;
}

describe('embed chinese-primary deck catalog guard', () => {
  it('hides every bundled deck whose preview or locale is Chinese-primary', async () => {
    const misses = [
      ...(await assertChineseDecksCovered(examplesRoot, 'plugin')),
      ...(await assertChineseDecksCovered(designTemplatesRoot, 'design-template')),
    ];
    expect(
      misses,
      `Chinese-primary deck entries missing from embed policy:\n${misses.join('\n')}`,
    ).toEqual([]);
  });
});
