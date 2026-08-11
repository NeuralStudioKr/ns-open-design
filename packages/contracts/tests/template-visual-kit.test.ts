import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { pickPluginPreviewHtmlPath } from '../src/plugin-preview-path.js';
import {
  appendTemplateVisualKit,
  extractTemplateVisualKitFromHtml,
} from '../src/template-visual-kit.js';

describe('extractTemplateVisualKitFromHtml', () => {
  it('extracts Daisy Days cream/pastel tokens, deco CSS, and complete motif sprites', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const kit = extractTemplateVisualKitFromHtml(html, {
      title: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(kit).toBeTruthy();
    expect(kit).toContain('## Template visual kit (from example.html)');
    expect(kit).toContain('#F5F0E6');
    expect(kit).toContain('#7ECDC0');
    expect(kit).toContain('Fredoka One');
    expect(kit).toContain('Quicksand');
    expect(kit).toContain('Decoration CSS');
    expect(kit).toContain('--shadow');
    expect(kit).toContain('Motif sprites');
    expect(kit).toContain('Do not invent emoji flowers');
    expect(kit).toContain('Do NOT replace them with an active design-system palette');
    // Hard anti-emoji rules must appear (not truncated away).
    expect(kit).toMatch(/Forbidden motif substitutes/i);
    expect(kit).toMatch(/🌼|emoji/i);
    // Usable motif implementation, not a mid-cut first-slide SVG dump.
    expect(kit).toContain('### Motif sprites');
    expect(kit).toContain('### Decoration CSS');
    expect(kit).toContain('.deco{');
    expect(kit).toMatch(/<svg\b[\s\S]*?<\/svg>/i);
    expect(kit).not.toMatch(/<svg\b[^>]*>[^<]*…/);
    expect(kit).toContain('use Motif sprites SVG inside .deco');
    // The classifier must ship at least ONE real multi-petal daisy sprite,
    // not just the small bear-face or the 4-arc rainbow. Zhangzara Daisy
    // Days ships 10-path SVGs on a 150×150 square viewBox with white petals
    // and a butter-yellow center. Prior classifier bugs bucketed those as
    // non-daisy and picked the 300-char pink-face SVG instead — the model
    // then had no real daisy to copy and fell back to 🌸 emoji.
    expect(kit).not.toBeNull();
    const spriteBlockStart = kit!.indexOf('### Motif sprites');
    const spriteBlock = kit!.slice(spriteBlockStart);
    const spriteSvgs = spriteBlock.match(/<svg\b[\s\S]*?<\/svg>/gi) ?? [];
    expect(spriteSvgs.length).toBeGreaterThanOrEqual(2);
    const hasRealPetalSprite = spriteSvgs.some((svg) => {
      const pathCount = (svg.match(/<path\b/gi) ?? []).length;
      const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)?.[1]?.split(/\s+/).map(Number);
      if (!vb || vb.length < 4) return false;
      const w = vb[2] ?? 0;
      const h = vb[3] ?? 0;
      const square = w > 0 && h > 0 && Math.abs(w - h) / Math.max(w, h) < 0.1;
      return pathCount >= 6 && square;
    });
    expect(hasRealPetalSprite).toBe(true);
  });

  it('appendTemplateVisualKit is idempotent', () => {
    const kit = '## Template visual kit (from example.html)\n\n:root{ --cream:#F5F0E6 }';
    const once = appendTemplateVisualKit('## Visual summary\n\nCheerful pastel', kit);
    const twice = appendTemplateVisualKit(once, kit);
    expect(twice).toBe(once);
    expect(once.match(/## Template visual kit/g)?.length).toBe(1);
  });
});

describe('pickPluginPreviewHtmlPath', () => {
  it('prefers od.preview.entry then context.assets', () => {
    expect(
      pickPluginPreviewHtmlPath({
        od: {
          preview: { type: 'html', entry: './example.html' },
          context: { assets: ['./other.html'] },
        },
      }),
    ).toBe('example.html');
  });
});
