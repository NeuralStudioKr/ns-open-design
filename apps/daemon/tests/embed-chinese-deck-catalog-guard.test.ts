/**
 * Guard: bundled deck example previews that are Chinese-primary must be
 * covered by embed-chinese-deck-policy (denylist and/or od.content_locale).
 *
 * Catches regressions like `deck-open-slide-canvas` (Korean card title
 * "Open-Slide 1920 캔버스 덱" with zh-CN example.html) slipping past denylist.
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
  if (ratio >= 0.35) return true;
  return false;
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

describe('embed chinese-primary deck catalog guard', () => {
  it('hides every bundled deck example whose preview is Chinese-primary', async () => {
    const entries = await readdir(examplesRoot, { withFileTypes: true });
    const misses: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(examplesRoot, entry.name);
      let manifest: { name?: string; od?: { mode?: string; content_locale?: string } };
      try {
        manifest = JSON.parse(await readFile(path.join(dir, 'open-design.json'), 'utf8'));
      } catch {
        continue;
      }
      if (manifest.od?.mode !== 'deck') continue;

      const html = await resolveExampleHtml(dir);
      const contentLocale = readOdContentLocale(manifest.od);
      const chinesePreview = html ? isChinesePrimaryPreview(html) : false;
      const taggedZh = contentLocale
        ? contentLocale.trim().toLowerCase().replace(/_/g, '-') === 'zh-cn'
          || contentLocale.trim().toLowerCase() === 'zh'
        : false;

      if (!chinesePreview && !taggedZh) continue;

      const pluginId = typeof manifest.name === 'string' ? manifest.name : entry.name;
      const templateId = resolveChineseDeckTemplateId(pluginId);
      const covered = isChinesePrimaryDeckTemplate({
        id: pluginId,
        contentLocale,
      });
      if (!covered) {
        misses.push(`${pluginId} (template=${templateId}, preview=${chinesePreview}, locale=${contentLocale ?? 'null'})`);
      }
    }

    expect(misses, `Chinese-primary deck examples missing from embed policy:\n${misses.join('\n')}`).toEqual([]);
  });
});
