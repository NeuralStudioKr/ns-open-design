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
    // Anti-emoji intent — copy changed from "Do not invent emoji flowers"
    // to a broader "loses the template look" phrasing in the verbatim rule.
    expect(kit).toMatch(/loses the template look|emoji/i);
    expect(kit).toContain('Do NOT replace them with an active design-system palette');
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
    // Slide-surface binding: without this, models routinely picked the
    // ink/stroke token (`#2D2D2D`) as a slide background and shipped
    // dark-on-dark unreadable decks (Daisy Days user report 2026-08-13).
    // The section must resolve the actual `body { background: var(--cream) }`
    // binding into a concrete `#F5F0E6` hex and pair it with a dark text
    // color for correct contrast.
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#F5F0E6`/i);
    expect(kit).toMatch(/\*\*color\*\*\s*\(text\):\s*`#2D2D2D`/i);
    expect(kit).toMatch(/light background \+ dark ink/i);
    // The HARD_RULES footer must call out the surface-binding contract so
    // the concrete `Slide surface` block above cannot be misread as
    // decoration-only guidance.
    expect(kit).toMatch(/Surface binding is authoritative/i);
    expect(kit).toMatch(/failed deliverable/i);
    // Dual-binding requirement (Daisy Days 2026-08-13 follow-up: model
    // painted `.slide` cream but left `body` on a dark app-shell default,
    // so the list thumbnail rendered cream — .slide is forced
    // `position:absolute; inset:0` there — but the project preview panel
    // showed a dark shell around the cream slides). The kit must show a
    // concrete example binding the surface hex on BOTH `html`/`body` AND
    // `.slide`, and the HARD_RULES footer must forbid the split-shell
    // shape.
    expect(kit).toMatch(/bind BOTH the outer document AND every/i);
    expect(kit).toMatch(/html\s*,\s*body\s*\{\s*background:\s*#F5F0E6/);
    expect(kit).toMatch(/\.slide\s*\{\s*background:\s*#F5F0E6/);
    expect(kit).toMatch(/cream-slides-on-dark-shell/i);
    // Verbatim-copy / do-not-recolor rule (Daisy Days 2026-08-13
    // preview-panel follow-up: model shipped ONE lonely daisy in one
    // corner, recolored to coral instead of white+yellow+dark-stroke,
    // because the classifier picked the sky-blue cloud sprite as
    // "daisy" and the model then interpreted the sprite's white fill
    // as "too washed out" and swapped in coral). Kit must call out
    // both failures.
    expect(kit).toMatch(/VERBATIM|byte-for-byte/i);
    expect(kit).toMatch(/do NOT recolor|do not recolor/i);
    expect(kit).toMatch(/all four corners|4-corner|four corners/i);
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
      // Real Daisy Days daisy has the butter-yellow center hex
      // (#FCDF6C or #FDE366) AND white petal fills — the sky-blue
      // cloud sprite (128×128, `.cl0 #C6E3F6`, `.cl2 #fff`) that
      // previously slipped into this bucket has neither butter-yellow
      // nor a dark stroke color, so requiring the yellow center is
      // enough to distinguish them.
      const hasYellowCenter = /#fcdf6c|#fde366/i.test(svg);
      return pathCount >= 6 && square && hasYellowCenter;
    });
    expect(hasRealPetalSprite).toBe(true);
    // Anti-regression for the cloud misclassification: the sky-blue
    // cloud/wave sprite (128×128, `.cl0 #C6E3F6`) must NOT appear in
    // the sprite section. Its presence made the model paint a single
    // recolored coral sprite instead of the 4-corner white-daisy
    // pattern (user report 2026-08-13 preview-panel).
    const hasSkyBlueCloudMisclassified = spriteSvgs.some((svg) =>
      /#c6e3f6/i.test(svg)
    );
    expect(hasSkyBlueCloudMisclassified).toBe(false);
    expect(kit!.length).toBeLessThanOrEqual(11_000);
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
