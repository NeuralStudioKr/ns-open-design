import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
    expect(kit).toContain('Decorations CSS');
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
    expect(kit).toContain('### Decorations CSS');
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
    expect(kit!.length).toBeLessThanOrEqual(17_500);
    expect(kit!).not.toMatch(/…\s*$/);
    expect(kit!).toMatch(/LOOK LIKE THE TEMPLATE|TOKEN-SAFE CONTENT-SWAP/i);
    expect(kit!).toContain('### Must-match look');
    expect(kit!).toMatch(/visible kit Motif anchors/i);
    expect(kit!).toMatch(/Empty `?\.deco-\*`? shells are not enough|Empty `?\.deco-\*`? shells do not count/i);
    expect(kit!).not.toMatch(/treat `example\.html` as the base deck/i);
    // Scaffold-map deco slots must not ask for sun/cloud when those sprites
    // were not included in Motif sprites.
    const mapBlock = kit!.slice(
      kit!.indexOf('### Template scaffold map'),
      kit!.indexOf('### Decorations CSS') >= 0
        ? kit!.indexOf('### Decorations CSS')
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

  it('neutralizeFilesystemCloneWorkflow rewrites html-ppt copy index.html / template-folder steps', async () => {
    const { neutralizeFilesystemCloneWorkflow } = await import('../src/template-visual-kit.js');
    const skill = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-hermes-cyber-terminal/SKILL.md',
        import.meta.url,
      ),
      'utf8',
    );
    const out = neutralizeFilesystemCloneWorkflow(skill);
    expect(out).toContain('API / Teamver mode — do not clone files');
    expect(out).not.toMatch(/copy\s+`index\.html`/i);
    expect(out).not.toMatch(/skills\/html-ppt\/templates\//i);
    expect(out).not.toMatch(/\*\*Start from the matching template folder:\*\*/i);
    expect(out).toContain('Replace demo content, not classes');
  });

  it('binds html-ppt Hermes identity surface instead of shared white :root', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-hermes-cyber-terminal/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const kit = extractTemplateVisualKitFromHtml(html, {
      title: 'Html Ppt Hermes Cyber Terminal',
    });
    expect(kit).toBeTruthy();
    expect(kit).toContain('#0a0c10');
    expect(kit).toContain('Identity host class: `.tpl-hermes-cyber-terminal`');
    expect(kit).toMatch(/\*\*background\*\*:\s*`#0a0c10`/i);
    expect(kit).not.toMatch(/\*\*background\*\*:\s*`#ffffff`/i);
    const tokenStart = kit!.indexOf('### CSS tokens');
    const fenceStart = kit!.indexOf('```css', tokenStart);
    const fenceEnd = kit!.indexOf('```', fenceStart + 6);
    const tokens = tokenStart >= 0 && fenceStart >= 0 && fenceEnd > fenceStart
      ? kit!.slice(fenceStart, fenceEnd)
      : '';
    expect(tokens).toMatch(/--hc-bg:\s*#0a0c10/i);
    expect(tokens).not.toMatch(/--bg:\s*#ffffff/i);
    expect(tokens).not.toMatch(/--surface:\s*#ffffff/i);
    expect(kit).toMatch(/JetBrains Mono/);
    const fontLine = kit!.match(/### Fonts:([^\n]+)/)?.[1] ?? '';
    const jb = fontLine.indexOf('JetBrains Mono');
    const inter = fontLine.indexOf('Inter');
    expect(jb).toBeGreaterThanOrEqual(0);
    if (inter >= 0) expect(jb).toBeLessThan(inter);
  });

  it('binds Pink Script slide surface to the dark stage, not --paper ink', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-pink-script/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const kit = extractTemplateVisualKitFromHtml(html, {
      title: 'Html Ppt Zhangzara Pink Script',
    });
    expect(kit).toBeTruthy();
    expect(kit).toContain('### Slide surface');
    expect(kit).toMatch(/\*\*background\*\*:\s*`[^`]*#0[Aa]0709|radial-gradient|`#000`/i);
    expect(kit).not.toMatch(/\*\*background\*\*:\s*`#F5EDF1`/i);
    expect(kit).not.toMatch(/Main surface\/background:\s*--paper #F5EDF1/i);
    expect(kit).toMatch(/Instrument Serif/i);
    expect(kit).toMatch(/JetBrains Mono/i);
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

  it('skips slide-counter / slide-chrome when mapping template shells', () => {
    const html = `
<style>:root{--bg:#fff8f0;--ink:#1c1c1c}</style>
<section class="slide-counter">5 / 10</section>
<section class="slide slide-cover"><h1>Cover Expo</h1></section>
<section class="slide"><div class="slide-chrome">02</div><h2>Body pack</h2></section>
`.trim();
    const kit = extractTemplateVisualKitFromHtml(html, { title: 'Studio Chrome' });
    expect(kit).toContain('### Template scaffold map');
    expect(kit).toContain('Cover Expo');
    expect(kit).toContain('Body pack');
    expect(kit).not.toMatch(/classes="[^"]*slide-counter/);
    expect(kit).not.toMatch(/classes="[^"]*slide-chrome/);
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
    const decoStart = kit.indexOf('### Decorations CSS');
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
    expect(daisySlim).not.toMatch(/```html[\s\S]*?<svg\s/i);
    expect(daisySlim).not.toMatch(/<svg\s[^>]*viewBox/i);
    expect(daisySlim).toMatch(/REQUIRE 1–2 visible kit Motif|visible daisy\/star\/rainbow anchors/i);
    expect(daisySlim).toMatch(/Empty `?\.deco-daisy-\*`? shells are forbidden|Empty `?\.deco-\*`? shells are not enough/i);
    expect(daisySlim).not.toMatch(/Optional tiny kit Motif CSS/i);
    expect(daisySlim).not.toMatch(/REQUIRED after cover title\/lead:\s*paste exactly ONE/i);
    expect(daisySlim).not.toMatch(/Motif sprites \(omitted for first content-fill/i);
    expect(daisySlim).not.toMatch(/ZERO Motif|Motif SVG paste is DISABLED/i);
    expect(daisySlim).not.toMatch(/may stay empty|empty absolute shells|official Motif merged after save|deferred to persist/i);
    expect(daisySlim).toMatch(/deco-daisy/i);
    expect(daisySlim).toMatch(/visible kit Motif anchors|visible daisy\/star\/rainbow anchors/i);
    expect(daisySlim).toMatch(/Motif geometry:\s*\*\*kit Motif SVG sprites\*\*/i);

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
    expect(capsuleSlim).toMatch(/Motif vocabulary \(required compact cue\)/i);
    expect(capsuleSlim).toMatch(/title cue: capsule \/ pill objects/i);
    expect(capsuleSlim).toMatch(/Decorations CSS \(capped for first content-fill/i);
    expect(capsuleSlim).toMatch(/\.deco-pill|deco-pill/i);
    expect(capsuleSlim).toMatch(/pill-coral|pill-lavender|pill-sky|pill-peach|pill-violet/i);
    expect(capsuleSlim).toMatch(/Motif HTML snippets|border-radius:\s*9999px/i);
    expect(capsuleSlim).toMatch(/REQUIRED Motif vocabulary|Do NOT invent generic CSS circles/i);
    expect(capsuleSlim).toMatch(/visible Motif anchors|visible absolute-positioned shapes|visible kit Motif/i);
    expect(capsuleSlim).not.toMatch(/may stay empty|empty absolute shells|official Motif merged after save|deferred to persist/i);
    expect(capsuleSlim).toMatch(/Motif geometry:\s*\*\*oblong capsules\*\*/i);
    // Prefer real capsule geometry in Motif snippets — not year-dot discs.
    const motifSnippets = /Motif HTML snippets[\s\S]*?```html\n([\s\S]*?)```/i.exec(capsuleSlim)?.[1] ?? '';
    expect(motifSnippets).toMatch(/deco-pill|c-pill|f-pill/i);
    expect(motifSnippets).toMatch(/width:\s*\d+px;height:\s*\d+px/i);
    expect(motifSnippets).not.toMatch(/border-radius:\s*50%/i);
    expect(motifSnippets).not.toMatch(/width:\s*(\d+)px;height:\s*\1px/i);
    expect(capsuleSlim).toMatch(/Layout CSS \(capped for first content-fill/i);
    expect(capsuleSlim).toMatch(/Do NOT flatten|cards-grid|grid-template/i);
    expect(capsuleSlim).not.toMatch(/Decorations CSS \(omitted for first content-fill/i);
    expect(capsuleSlim).not.toMatch(/Layout CSS \(omitted for first content-fill/i);

    // Daisy must keep Layout on fill (not omit) so compositions don't collapse.
    expect(daisySlim).toMatch(/Layout CSS \(capped for first content-fill/i);
    expect(daisySlim).not.toMatch(/Layout CSS \(omitted for first content-fill/i);
  });

  it('does not inject Capsule examples into non-Capsule Motif templates', async () => {
    const { slimTemplateVisualKitForFill, inferMotifGeometryKind } = await import(
      '../src/template-visual-kit.js'
    );
    for (const folder of [
      'html-ppt-hermes-cyber-terminal',
      'html-ppt-xhs-pastel-card',
      'html-ppt-zhangzara-long-table',
      'html-ppt-zhangzara-sakura-chroma',
    ]) {
      const html = await readFile(
        new URL(`../../../plugins/_official/examples/${folder}/example.html`, import.meta.url),
        'utf8',
      );
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder })!;
      const slim = slimTemplateVisualKitForFill(kit);
      expect(slim, folder).not.toMatch(/Example capsule \(AFTER title\)/i);
      if (/Motif vocabulary \(required compact cue\)/i.test(slim)) {
        const kind = inferMotifGeometryKind(html);
        if (kind === 'oblong-capsule' || kind === 'disc-organic' || kind === 'mixed') {
          expect(slim, folder).toMatch(/Motif geometry:/i);
        }
      }
      if (/display\s*:\s*(?:flex|grid)/i.test(html)) {
        expect(slim, folder).toMatch(/Layout CSS \(capped for first content-fill/i);
      }
      if (folder.includes('sakura')) {
        expect(inferMotifGeometryKind(html), folder).toBe('disc-organic');
        expect(slim, folder).toMatch(/soft discs \/ petals \/ blobs/i);
        expect(slim, folder).not.toMatch(/\*\*oblong capsules\*\*/i);
      }
    }
  });

  it('infers Motif geometry kind catalog-wide from kit HTML (not template slug)', async () => {
    const { inferMotifGeometryKind } = await import('../src/template-visual-kit.js');
    const cases: Array<{ folder: string; kind: string }> = [
      { folder: 'html-ppt-zhangzara-capsule', kind: 'oblong-capsule' },
      { folder: 'html-ppt-zhangzara-sakura-chroma', kind: 'disc-organic' },
      { folder: 'html-ppt-zhangzara-daisy-days', kind: 'svg-sprite' },
    ];
    for (const { folder, kind } of cases) {
      const html = await readFile(
        new URL(`../../../plugins/_official/examples/${folder}/example.html`, import.meta.url),
        'utf8',
      );
      expect(inferMotifGeometryKind(html), folder).toBe(kind);
    }
  });

  it('emits head <link> fonts for every official Motif family (including @import examples)', async () => {
    for (const folder of [
      'html-ppt-hermes-cyber-terminal', // example.html uses @import
      'html-ppt-xhs-pastel-card', // example.html uses @import
      'html-ppt-zhangzara-capsule', // example.html uses <link>
      'html-ppt-zhangzara-daisy-days',
      'html-ppt-zhangzara-sakura-chroma',
      'html-ppt-zhangzara-pin-and-paper',
    ]) {
      const html = await readFile(
        new URL(`../../../plugins/_official/examples/${folder}/example.html`, import.meta.url),
        'utf8',
      );
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) continue;
      if (!/fonts\.googleapis\.com/i.test(html) && !/Font import/i.test(kit)) continue;
      expect(kit, folder).toMatch(/### Font import \(emit after `<body>` or after slide 1/i);
      expect(kit, folder).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/i);
      expect(kit, folder).not.toMatch(/```css\s*@import url\(/i);
    }
  });

  it('keeps Pin-and-Paper Motif vocabulary on fill slim', async () => {
    const { slimTemplateVisualKitForFill, listLocalStylesheetHrefs } = await import(
      '../src/template-visual-kit.js'
    );
    const root = new URL(
      '../../../plugins/_official/examples/html-ppt-zhangzara-pin-and-paper/',
      import.meta.url,
    );
    const html = await readFile(new URL('example.html', root), 'utf8');
    const hrefs = listLocalStylesheetHrefs(html);
    expect(hrefs).toContain('assets/styles.css');
    const supplementalCss = await readFile(new URL('assets/styles.css', root), 'utf8');
    const kit = extractTemplateVisualKitFromHtml(html, {
      title: 'Html Ppt Zhangzara Pin And Paper',
      supplementalCss,
    })!;
    const slim = slimTemplateVisualKitForFill(kit);
    expect(slim).toMatch(/Motif vocabulary \(required compact cue\)|pin|cork|post-it|tape/i);
    expect(slim).toMatch(/title cue: pin \/ paper \/ cork|stamp\/tape\/pin|pin-/i);
    expect(slim).toMatch(/Decorations CSS|pin-|cork|post-it|\.tape/i);
    expect(slim).not.toMatch(/Example capsule \(AFTER title\)/i);
    // Fill turns defer Motif SVG bodies — keep pin class vocabulary only.
    expect(slim).toMatch(/Motif class vocabulary:|\.pin-|stamp\/tape\/pin/i);
    expect(slim).not.toMatch(/```html[\s\S]*?<svg\s/i);
    expect(slim).not.toMatch(/<svg\s[^>]*viewBox/i);
    expect(slim).not.toMatch(/<polyline\b/i);
  });

  it('Decorations CSS kits do not teach Motif outside-canvas hangs (§0.80)', async () => {
    for (const folder of [
      'html-ppt-zhangzara-daisy-days',
      'html-ppt-zhangzara-block-frame',
      'html-ppt-zhangzara-scatterbrain',
      'html-ppt-zhangzara-sakura-chroma',
      'html-ppt-graphify-dark-graph',
      'html-ppt-xhs-pastel-card',
      'html-ppt-pitch-deck',
    ]) {
      const html = await readFile(
        new URL(`../../../plugins/_official/examples/${folder}/example.html`, import.meta.url),
        'utf8',
      );
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) continue;
      const decoFence = /### Decorations CSS[\s\S]*?```css\s*([\s\S]*?)```/i.exec(kit)?.[1] ?? '';
      if (!decoFence.trim()) continue;
      expect(decoFence, folder).not.toMatch(
        /\.(?:deco-|gd-orb|xp-blob|pin|tape|ribbon|rib|cover-blob|post-it)[^{]*\{[^}]*(?:top|left|right|bottom)\s*:\s*-\d/i,
      );
    }
  });

  it('kit Decorations strip overflow:hidden from prefixed .slide rules (§0.84)', async () => {
    for (const folder of [
      'html-ppt-hermes-cyber-terminal',
      'html-ppt-graphify-dark-graph',
      'html-ppt-zhangzara-pink-script',
    ]) {
      const html = await readFile(
        new URL(`../../../plugins/_official/examples/${folder}/example.html`, import.meta.url),
        'utf8',
      );
      const kit = extractTemplateVisualKitFromHtml(html, { title: folder });
      if (!kit) continue;
      const decoFence = /### Decorations CSS[\s\S]*?```css\s*([\s\S]*?)```/i.exec(kit)?.[1] ?? '';
      const layoutFence = /### Layout CSS[\s\S]*?```css\s*([\s\S]*?)```/i.exec(kit)?.[1] ?? '';
      const css = `${decoFence}\n${layoutFence}`;
      expect(css, folder).not.toMatch(/\.slide[^{]*\{[^}]*overflow\s*:\s*hidden/i);
    }
  });

  it('resolveSiblingAssetPath joins preview-relative local CSS hrefs', async () => {
    const { resolveSiblingAssetPath } = await import('../src/template-visual-kit.js');
    expect(resolveSiblingAssetPath('example.html', 'assets/styles.css')).toBe('assets/styles.css');
    expect(resolveSiblingAssetPath('preview/index.html', 'theme.css')).toBe('preview/theme.css');
    expect(resolveSiblingAssetPath('preview/index.html', '../escape.css')).toBe('');
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

  it('resolves Replit Deck to the shipped helix example, not the missing index/seed', () => {
    const manifestUrl = new URL(
      '../../../plugins/_official/examples/replit-deck/open-design.json',
      import.meta.url,
    );
    const exampleUrl = new URL(
      '../../../plugins/_official/examples/replit-deck/example.html',
      import.meta.url,
    );
    const indexUrl = new URL(
      '../../../plugins/_official/examples/replit-deck/index.html',
      import.meta.url,
    );
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as unknown;
    expect(pickPluginPreviewHtmlPath(manifest)).toBe('example.html');
    expect(existsSync(fileURLToPath(exampleUrl))).toBe(true);
    expect(existsSync(fileURLToPath(indexUrl))).toBe(false);
    const helixUrl = new URL(
      '../../../design-templates/replit-deck/examples/example-helix.html',
      import.meta.url,
    );
    expect(readFileSync(fileURLToPath(exampleUrl), 'utf8')).toBe(
      readFileSync(fileURLToPath(helixUrl), 'utf8'),
    );
  });
});
