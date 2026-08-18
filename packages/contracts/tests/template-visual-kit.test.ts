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
    expect(kit).toMatch(/Do not invent emoji ornaments|Forbidden motif substitutes/i);
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
    // First-slide structure cue is optional under budget; Motif sprites remain available.
    expect(kit).toMatch(/Motif sprites|optional Motif sprite AFTER title\/lead/i);
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#F5F0E6`/i);
    expect(kit).toMatch(/\*\*color\*\*\s*\(text\):\s*`#2D2D2D`/i);
    expect(kit).toMatch(/light background \+ dark ink/i);
    expect(kit).toMatch(/html,\s*body,\s*\.slide\s*\{\s*background:\s*#F5F0E6/);
    expect(kit).toMatch(/cream-slides-on-dark-shell|preview-panel|letterbox|edge-to-edge|white top\/bottom bands/i);
    expect(kit).toMatch(/AFTER title\/lead|at most one short|optional complete SVGs|Motif SVG paste is optional/i);
    expect(kit).not.toMatch(/Paste sprites VERBATIM|Copy at least one complete SVG from this block onto the cover/i);
    expect(kit).toMatch(/lonely ornament|matching corner slots|TOKEN-SAFE CONTENT-SWAP|CSS\/`?\.deco`? first|decorative density/i);
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
    // Budget must fit daisy + star + rainbow so the scaffold map does not
    // demand deco kinds the Motif sprites block never shipped.
    expect(spriteSvgs.length).toBeGreaterThanOrEqual(3);
    expect(kit!.length).toBeLessThanOrEqual(14_000);
    expect(kit!).not.toMatch(/…\s*$/);
    expect(kit!).toMatch(/LOOK LIKE THE TEMPLATE|TOKEN-SAFE CONTENT-SWAP/i);
    expect(kit!).toContain('### Must-match look');
    expect(kit!).not.toMatch(/treat `example\.html` as the base deck/i);
    // Scaffold-map deco slots must not ask for sun/cloud when those sprites
    // were not included in Motif sprites.
    const mapBlock = kit!.slice(
      kit!.indexOf('### Template scaffold map'),
      kit!.indexOf('### Decoration CSS') >= 0
        ? kit!.indexOf('### Decoration CSS')
        : kit!.indexOf('### Motif sprites'),
    );
    expect(mapBlock).toMatch(/deco-daisy/i);
    expect(mapBlock).not.toMatch(/deco-sun|deco-cloud/i);
  });

  it('neutralizeFilesystemCloneWorkflow rewrites Clone example.html steps', async () => {
    const { neutralizeFilesystemCloneWorkflow } = await import('../src/template-visual-kit.js');
    const raw = [
      '## Workflow',
      '',
      '1. **Clone `example.html`** into the user\'s workspace as the working file',
      '2. **Replace placeholder content** with the user brief.',
    ].join('\n');
    const out = neutralizeFilesystemCloneWorkflow(raw);
    expect(out).toContain('API / Teamver mode — do not clone files');
    expect(out).not.toMatch(/\*\*Clone `example\.html`\*\*/);
    expect(out).toContain('Replace placeholder content');
  });

  it('prefers slide paper over dark body chrome (Coral-style)', () => {
    const html = `
<style>
:root { --cream:#F5F0E8; --ink:#1A1A1A; --text:#2D2D2D; }
html,body{background:var(--ink);color:#fff}
.slide{width:100%;height:100%;opacity:0}
.slide-2{background:var(--cream);color:var(--text);display:flex;flex-direction:column}
.slide-4{background:var(--cream);display:flex;flex-direction:column}
.slide-6{background:var(--cream);display:flex;flex-direction:column}
</style>
<section class="slide slide-2"><h1>Coral</h1></section>
`.trim();
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Html Ppt Zhangzara Coral' });
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#F5F0E8`/i);
    expect(kit).not.toMatch(/\*\*background\*\*:\s*`#1A1A1A`/i);
    expect(kit).toContain('### Must-match look');
    expect(kit).toContain('### Layout CSS');
    expect(kit).toMatch(/LOOK LIKE THE TEMPLATE/i);
  });

  it('ships Motif sprites for non-Daisy SVG templates', () => {
    const html = `
<style>:root{--bg:#0b1220;--accent:#3b6cff;--font-body:'IBM Plex Sans',sans-serif}</style>
<section class="slide"><h1>Grid</h1>
<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" fill="#3b6cff"/><circle cx="20" cy="20" r="8" fill="#fff"/></svg>
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h32v32H0z" fill="#0b1220"/><path d="M4 16h24" stroke="#3b6cff" stroke-width="3"/></svg>
</section>
`.trim();
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Cobalt Grid' });
    expect(kit).toContain('### Motif sprites');
    const spriteBlock = kit!.slice(kit!.indexOf('### Motif sprites'));
    expect((spriteBlock.match(/<svg\b[\s\S]*?<\/svg>/gi) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(kit).toContain('### Template scaffold map');
  });

  it('builds scaffold map from div.slide shells', () => {
    const html = `
<style>:root{--bg:#fff;--ink:#111}</style>
<div class="slide slide-cover"><h1>Cover</h1></div>
<div class="slide slide-body"><h2>Body</h2></div>
`.trim();
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Div Slide Template' });
    expect(kit).toContain('### Template scaffold map');
    expect(kit).toContain('classes="slide slide-cover"');
    expect(kit).toContain('role=cover');
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

  it('drops viewport-relative sizing and scroll-snap plumbing from Decoration / Layout CSS', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Daisy Days' })!;
    // Scope to the Decoration + Layout CSS blocks (skip prose that intentionally
    // spells out the anti-pattern for the model).
    const decoStart = kit.indexOf('### Decoration CSS');
    const layoutStart = kit.indexOf('### Layout CSS');
    const spriteStart = kit.indexOf('### Motif sprites');
    const decoEnd = layoutStart > decoStart
      ? layoutStart
      : spriteStart > decoStart ? spriteStart : kit.length;
    const layoutEnd = spriteStart > layoutStart ? spriteStart : kit.length;
    const decoBody = decoStart >= 0 ? kit.slice(decoStart, decoEnd) : '';
    const layoutBody = layoutStart >= 0 ? kit.slice(layoutStart, layoutEnd) : '';
    // No viewport-based width/height, no scroll-snap plumbing.
    expect(decoBody).not.toMatch(/100v[wh]/i);
    expect(layoutBody).not.toMatch(/100v[wh]/i);
    expect(decoBody).not.toMatch(/scroll-snap-(?:type|align|stop)/i);
    expect(layoutBody).not.toMatch(/scroll-snap-(?:type|align|stop)/i);
    // Bare `.slide{width:...;height:...}` sizing rule is dropped entirely —
    // the compact contract owns 1920×1080. Variant selectors (`.slide-title`)
    // still survive with their non-sizing declarations.
    expect(decoBody).not.toMatch(/(?:^|[\s;])\.slide\s*\{[^}]*100v/);
    expect(decoBody).not.toMatch(/\.slides-container\s*\{/i);
    // `.slide-title{background:var(--cream)}` should survive — it is the
    // template's variant look, not sizing plumbing.
    const variantSurvivor = /\.slide-(?:title|welcome|weekly)\b[^{]*\{/i.test(kit);
    expect(variantSurvivor).toBe(true);
  });

  it('appendTemplateVisualKit is idempotent', () => {
    const kit = '## Template visual kit (from example.html)\n\n:root{ --cream:#F5F0E6 }';
    const once = appendTemplateVisualKit('## Visual summary\n\nCheerful pastel', kit);
    const twice = appendTemplateVisualKit(once, kit);
    expect(twice).toBe(once);
    expect(once.match(/## Template visual kit/g)?.length).toBe(1);
  });

  it('slimTemplateVisualKitForFill keeps capped Motif/Deco vocabulary (not circles-only)', async () => {
    const { slimTemplateVisualKitForFill } = await import('../src/template-visual-kit.js');
    const daisyHtml = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const daisyKit = extractTemplateVisualKitFromHtml(daisyHtml, {
      title: 'Html Ppt Zhangzara Daisy Days',
    })!;
    expect(daisyKit).toContain('<svg');
    const daisySlim = slimTemplateVisualKitForFill(daisyKit);
    expect(daisySlim).toContain('#F5F0E6');
    expect(daisySlim).toMatch(/Motif sprites \(capped for first content-fill/i);
    expect(daisySlim).toMatch(/<svg\b/i);
    expect(daisySlim).not.toMatch(/Motif sprites \(omitted for first content-fill/i);
    expect(daisySlim).not.toMatch(/ZERO Motif|Motif SVG paste is DISABLED/i);

    const capsuleHtml = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const capsuleKit = extractTemplateVisualKitFromHtml(capsuleHtml, {
      title: 'Html Ppt Zhangzara Capsule',
    })!;
    expect(capsuleKit).toMatch(/deco-pill|\.pill-/i);
    const capsuleSlim = slimTemplateVisualKitForFill(capsuleKit);
    expect(capsuleSlim).toMatch(/Decorations CSS \(capped for first content-fill/i);
    expect(capsuleSlim).toMatch(/\.deco-pill/i);
    expect(capsuleSlim).toMatch(/pill-coral|pill-lavender|pill-sky/i);
    expect(capsuleSlim).toMatch(/border-radius:\s*9999px/i);
    expect(capsuleSlim).toMatch(/REQUIRED Motif vocabulary|Do NOT substitute plain CSS circles/i);
    expect(capsuleSlim).not.toMatch(/Decorations CSS \(omitted for first content-fill/i);
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
