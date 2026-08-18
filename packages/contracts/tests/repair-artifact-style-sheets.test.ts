import { describe, expect, it } from 'vitest';
import {
  relaxPersistedDeckSlideSurfaceBleed,
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

  it('does not corrupt an intact Google Fonts @import that contains css2 axis semicolons', () => {
    const intact =
      "@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";
    const css = `${intact}
:root{--coral:#E85D4E;--outline:#1E1E1E}
.pill{display:inline-flex;border-radius:9999px}
.deco-pill{position:absolute;border-radius:9999px}`;
    const repaired = repairStyleSheetText(css);
    expect(repaired).toContain(intact);
    expect(repaired).not.toMatch(/400\.\.900;\s*:root/i);
    expect(repaired).toMatch(/\.pill\{/);
    expect(repaired).toMatch(/\.deco-pill\{/);

    const html = `<!doctype html><html><body><style>${css}</style></body></html>`;
    const doc = repairArtifactStyleSheets(html);
    expect(doc).toContain(intact);
    expect(doc).toMatch(/\.deco-pill\{/);
  });

  it('still strips truncated remnants while leaving Motif rules intact', () => {
    const remnant =
      "1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";
    const repaired = repairStyleSheetText(`${remnant}\n.pill-coral{background:red}`);
    expect(repaired).not.toMatch(/family=|display=swap/i);
    expect(repaired).toMatch(/\.pill-coral\{/);
  });

  it('relaxes persisted flatten bleed so .slide washes can paint', () => {
    const html = `<html><body>
<section class="slide slide-1">Cover</section>
<style data-od-slide-surface-bleed="">html, body, .slide, section.slide { background: #F5F5F0 !important; color: #1A1A1A !important; }</style>
</body></html>`;
    const relaxed = relaxPersistedDeckSlideSurfaceBleed(html);
    expect(relaxed).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F5F5F0/i);
    expect(relaxed).not.toMatch(/html,\s*body,\s*\.slide,\s*section\.slide/i);
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

  it('does not rewrite host-injected official look CSS', () => {
    const grain =
      '.grain-overlay{background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E%3C/svg%3E")}';
    const html = `<!doctype html><html><head><style data-od-official-look-css>${grain}</style></head><body></body></html>`;
    expect(repairArtifactStyleSheets(html)).toContain(grain);
    expect(repairArtifactStyleSheets(html)).toContain('data-od-official-look-css');
  });
});
