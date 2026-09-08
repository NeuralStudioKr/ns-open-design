import { describe, expect, it } from 'vitest';

import { conformInlinePaletteToOfficialLook } from '../src/html/heal-official-look-contrast.js';

/** Biennale Yellow kit — cream paper, indigo ink (사용자 리포트 2026-09-08). */
const BIENNALE_LOOK = `<style data-od-official-look-css>
:root { --paper: #E9E5DB; --sun: #F1EE2E; --ink: #1B2566; --ember: #E26B4A; }
.s-programme .left { background: var(--sun); }
</style>`;

function slide(inner: string, hostStyle = ''): string {
  const style = hostStyle ? ` style="${hostStyle}"` : '';
  return `<!doctype html><html><head>${BIENNALE_LOOK}</head><body>`
    + `<section class="slide" data-screen-label="06 활용 사례"${style}>${inner}</section>`
    + '</body></html>';
}

describe('루프478 official look contrast conformance', () => {
  it('snaps light copy that sits on the inherited cream paper onto the kit ink', () => {
    const healed = conformInlinePaletteToOfficialLook(
      slide(
        '<p style="font:600 16px/1 sans-serif;color:#93c5fd">USE CASES</p>'
        + '<p style="color:#e0e7ff">스타트업 팀이 주간 회의를 15분으로 압축합니다.</p>',
      ),
    );
    expect(healed).not.toMatch(/color:#93c5fd/i);
    expect(healed).not.toMatch(/color:#e0e7ff/i);
    expect(healed.match(/color:#1b2566/gi)?.length).toBe(2);
    expect(healed).toContain('font:600 16px/1 sans-serif');
  });

  it('promotes a near-invisible glass card over cream paper to an ink tint', () => {
    const healed = conformInlinePaletteToOfficialLook(
      slide(
        '<div style="padding:36px;background:rgba(255,255,255,0.05);'
        + 'border:1px solid rgba(255,255,255,0.12);border-radius:18px">'
        + '<p style="color:#fbbf24">스타트업</p></div>',
      ),
    );
    expect(healed).toContain('background:rgba(27,37,102,0.055)');
    expect(healed).toContain('border:1px solid rgba(27,37,102,0.2)');
    expect(healed).not.toMatch(/color:#fbbf24/i);
    expect(healed).toContain('padding:36px');
  });

  it('keeps readable copy on a model-painted dark card untouched', () => {
    const source = slide(
      '<div style="background:#111c33;border-radius:18px">'
      + '<p style="color:#93c5fd">실시간 협업</p>'
      + '<p style="color:#cbd5e1">한 워크스페이스에서 동시 편집합니다.</p></div>',
    );
    expect(conformInlinePaletteToOfficialLook(source)).toBe(source);
  });

  it('keeps white copy on a dark gradient panel untouched', () => {
    const source = slide(
      '<div style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff">'
      + '<p style="color:#fff">TeamVer</p></div>',
    );
    expect(conformInlinePaletteToOfficialLook(source)).toBe(source);
  });

  it('leaves kit-painted subtrees alone (background comes from look CSS)', () => {
    const source = slide(
      '<div class="left"><p style="color:#1B2566">프로그램</p></div>',
    );
    expect(conformInlinePaletteToOfficialLook(source)).toBe(source);
  });

  it('snaps dark copy that lands on a model-painted dark host to the kit paper', () => {
    const healed = conformInlinePaletteToOfficialLook(
      slide('<p style="color:#1e293b">보이지 않는 본문</p>', 'background:#0b1220'),
    );
    expect(healed).toContain('color:#e9e5db');
  });

  it('never touches motif subtrees', () => {
    const source = slide(
      '<span data-od-official-motif-html class="sunglow" style="color:#f1ee2e">'
      + '<i style="color:#f8f39b">deco</i></span>',
    );
    expect(conformInlinePaletteToOfficialLook(source)).toBe(source);
  });

  it('is a no-op without official look CSS', () => {
    const source = '<section class="slide"><p style="color:#e0e7ff">본문</p></section>';
    expect(conformInlinePaletteToOfficialLook(source)).toBe(source);
  });

  it('is idempotent', () => {
    const once = conformInlinePaletteToOfficialLook(
      slide('<p style="color:#93c5fd">USE CASES</p>'),
    );
    expect(conformInlinePaletteToOfficialLook(once)).toBe(once);
  });
});
