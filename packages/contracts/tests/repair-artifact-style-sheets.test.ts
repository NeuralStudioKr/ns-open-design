import { describe, expect, it } from 'vitest';
import {
  repairArtifactStyleSheets,
  repairStyleSheetText,
  stripCssAtImportsBalanced,
} from '../src/html/repairArtifactStyleSheets.js';

describe('repairArtifactStyleSheets', () => {
  it('removes truncated Google Fonts remnant so Motif rules stay parseable', () => {
    const remnant =
      "1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";
    const css = `${remnant}
:root{--coral:#E85D4E;--outline:#1E1E1E}
.pill{display:inline-flex;border-radius:9999px;border:2px solid var(--outline);padding:6px 22px}
.pill-coral{background:var(--coral);color:#fff}
.deco-pill{position:absolute;border-radius:9999px}`;
    const repaired = repairStyleSheetText(css);
    expect(repaired).not.toMatch(/family=Space\+Grotesk|display=swap/i);
    expect(repaired).toMatch(/\.pill\{/);
    expect(repaired).toMatch(/\.deco-pill\{/);
    expect(repaired.trim().startsWith(':root') || repaired.trim().startsWith('.pill')).toBe(true);
  });

  it('stripCssAtImportsBalanced removes full Google Fonts @import with query semicolons', () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--bg:#F5F5F0}
.pill{display:inline-flex}`;
    const stripped = stripCssAtImportsBalanced(css);
    expect(stripped).not.toMatch(/@import/i);
    expect(stripped).not.toMatch(/family=|display=swap/i);
    expect(stripped).toContain('.pill{display:inline-flex}');
  });

  it('repairs style blocks inside a Capsule-like deck document', () => {
    const html = `<!doctype html><html><body style="background:#F5F5F0">
<section class="slide" style="background:radial-gradient(ellipse at 20% 80%, rgba(200,217,78,0.18) 0%,transparent 50%), #F5F5F0">
<style>1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--coral:#E85D4E;--outline:#1E1E1E}
.pill{display:inline-flex;border-radius:9999px;padding:6px 22px}
.pill-coral{background:var(--coral);color:#fff}
.deco-pill{position:absolute;border-radius:9999px}</style>
<span class="pill pill-coral">shadcn/ui</span>
<div class="deco-pill pill-coral" style="width:110px;height:110px;top:8%;right:14%">UI</div>
</section>
</body></html>`;
    const repaired = repairArtifactStyleSheets(html);
    expect(repaired).not.toMatch(/display=swap/i);
    expect(repaired).toMatch(/\.pill\{/);
    expect(repaired).toMatch(/\.deco-pill\{/);
  });
});
