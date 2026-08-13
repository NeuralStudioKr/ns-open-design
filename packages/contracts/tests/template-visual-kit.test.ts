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
    expect(kit).toContain('Template scaffold map');
    expect(kit).toContain('Replace visible content only');
    expect(kit).toContain('classes="slide slide-title"');
    expect(kit).toContain('classes="slide slide-weekly"');
    // Hard anti-emoji + BODY-FIRST rules must appear (not truncated away).
    expect(kit).toMatch(/Forbidden motif substitutes/i);
    expect(kit).toMatch(/🌼|emoji/i);
    expect(kit).toMatch(/BODY-FIRST/i);
    // Usable motif implementation, not a mid-cut first-slide SVG dump.
    expect(kit).toContain('### Motif sprites');
    expect(kit).toContain('### Decoration CSS');
    expect(kit).toContain('.deco{');
    expect(kit).toMatch(/<svg\b[\s\S]*?<\/svg>/i);
    expect(kit).not.toMatch(/<svg\b[^>]*>[^<]*…/);
    expect(kit).toContain('use Motif sprites SVG inside .deco');
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#F5F0E6`/i);
    expect(kit).toMatch(/\*\*color\*\*\s*\(text\):\s*`#2D2D2D`/i);
    expect(kit).toMatch(/light background \+ dark ink/i);
    expect(kit).toMatch(/html,\s*body,\s*\.slide\s*\{\s*background:\s*#F5F0E6/);
    expect(kit).toMatch(/cream-slides-on-dark-shell|preview-panel shell/i);
    expect(kit).toMatch(/VERBATIM|do not recolor/i);
    expect(kit).toMatch(/four corners/i);
    // The classifier must ship the real Zhangzara multi-petal daisy
    // (150×150 + #FCDF6C), not a sky-blue cloud that also has `#fff` on a
    // square canvas. Cloud-as-daisy previously made models invent ellipse
    // flowers / emoji despite cream kit tokens.
    expect(kit).not.toBeNull();
    const spriteBlockStart = kit!.indexOf('### Motif sprites');
    const spriteBlock = kit!.slice(spriteBlockStart);
    const spriteSvgs = spriteBlock.match(/<svg\b[\s\S]*?<\/svg>/gi) ?? [];
    expect(spriteSvgs.length).toBeGreaterThanOrEqual(1);
    expect(spriteBlock).toMatch(/#FCDF6C/i);
    expect(spriteBlock).toMatch(/viewBox="0 0 150 150"/i);
    expect(spriteBlock).not.toMatch(/#C6E3F6/i);
    const hasRealPetalSprite = spriteSvgs.some((svg) => {
      const pathCount = (svg.match(/<path\b/gi) ?? []).length;
      const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)?.[1]?.split(/\s+/).map(Number);
      if (!vb || vb.length < 4) return false;
      const w = vb[2] ?? 0;
      const h = vb[3] ?? 0;
      const square = w > 0 && h > 0 && Math.abs(w - h) / Math.max(w, h) < 0.1;
      return pathCount >= 6 && square && /#FCDF6C/i.test(svg);
    });
    expect(hasRealPetalSprite).toBe(true);
    expect(kit!.length).toBeLessThanOrEqual(8_800);
  });

  it('does not treat .welcome-body as the document surface', () => {
    const html = `
<style>
:root { --cream:#F5F0E6; --text-dark:#2D2D2D; --border:#2D2D2D; }
.welcome-body{background:#fff;color:#111}
.slide-title{background:#000;color:#fff}
html,body{background:var(--cream);color:var(--text-dark)}
.slide{background:var(--cream);color:var(--text-dark)}
</style>
<section class="slide"></section>
`.trim();
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Fixture' });
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#F5F0E6`/i);
    expect(kit).toMatch(/\*\*color\*\*\s*\(text\):\s*`#2D2D2D`/i);
    expect(kit).not.toMatch(/\*\*background\*\*:\s*`#fff`/i);
    expect(kit).not.toMatch(/\*\*background\*\*:\s*`#000`/i);
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
