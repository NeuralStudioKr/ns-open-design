import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  deckHasPerSlideSurfacePaint,
  repairDeckSlideSurfaceBleed,
} from '../../src/artifacts/deck-slide-surface';
import { sanitizeManualEditFullSource } from '../../src/edit-mode/source-patches';

const EXAMPLES_DIR = fileURLToPath(
  new URL('../../../../plugins/_official/examples/', import.meta.url),
);

const FLATTEN_SLIDE_BLEED_RE =
  /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:[^}]*!important/i;

/** Truncated css2 leftover at the start of a <style> — not a valid <link href>. */
function styleSheetHasCss2ImportDebris(html: string): boolean {
  for (const match of String(html ?? '').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const text = (match[1] ?? '').trimStart();
    if (/^[\d,.][\s\S]{0,120}display=swap/i.test(text) || /^1,6\.\.96/i.test(text)) {
      return true;
    }
  }
  return false;
}

function decodePersistEntities(html: string): string {
  return String(html ?? '').replace(/&amp;/g, '&');
}

type OfficialDeckExample = {
  folder: string;
  examplePath: string;
};

async function listOfficialDeckExamples(): Promise<OfficialDeckExample[]> {
  const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  const out: OfficialDeckExample[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    const manifestPath = path.join(EXAMPLES_DIR, folder, 'open-design.json');
    const examplePath = path.join(EXAMPLES_DIR, folder, 'example.html');
    let manifestRaw: string;
    try {
      manifestRaw = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }
    if (!/"mode"\s*:\s*"deck"/i.test(manifestRaw)) continue;
    try {
      await readFile(examplePath, 'utf8');
    } catch {
      continue;
    }
    out.push({ folder, examplePath });
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder));
}

describe('official deck persist/preview catalog', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'DOMParser');
  });

  it('does not flatten per-slide surfaces or drop Motif/font look on any official example', async () => {
    const files = await listOfficialDeckExamples();
    expect(files.length).toBeGreaterThan(40);

    const failures: string[] = [];
    for (const { folder, examplePath } of files) {
      const html = await readFile(examplePath, 'utf8');
      if (/<iframe\b/i.test(html) && !/<style\b[^>]*>[\s\S]*:root/i.test(html)) {
        continue;
      }

      const bled = repairDeckSlideSurfaceBleed(html);
      if (deckHasPerSlideSurfacePaint(html) && FLATTEN_SLIDE_BLEED_RE.test(bled)) {
        failures.push(`${folder}: surface-bleed flattened per-slide paint with !important`);
      }
      if (styleSheetHasCss2ImportDebris(bled)) {
        failures.push(`${folder}: css2 import remnant survived bleed heal`);
      }

      const persisted = sanitizeManualEditFullSource(html);
      if (styleSheetHasCss2ImportDebris(persisted)) {
        failures.push(`${folder}: css2 import remnant survived persist sanitize`);
      }
      if (
        /fonts\.googleapis\.com\/css2/i.test(html)
        && !/fonts\.googleapis\.com\/css2/i.test(decodePersistEntities(persisted))
      ) {
        failures.push(`${folder}: persist dropped Google Fonts css2 link/import`);
      }

      const motifHits = [...html.matchAll(
        /\.(?:pill|deco-pill|petal|pin-\d|hc-scanline|xp-blob|gd-orb|sunglow|slide-weekly|slide-red|s-cover)[\s.{]/gi,
      )].map((match) => match[0]);
      for (const token of [...new Set(motifHits)].slice(0, 6)) {
        if (token && !persisted.includes(token) && !bled.includes(token)) {
          failures.push(`${folder}: Motif token ${token} missing after persist/bleed`);
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 90_000);
});
