import { describe, expect, it } from 'vitest';
import { deckHtmlNeedsOfficialMotifRemerge } from '../../src/teamver/deckPreviewOfficialLookHeal';

describe('deckHtmlNeedsOfficialMotifRemerge', () => {
  it('detects pre-v34 percent overscale Daisy stamps', () => {
    const html = '<div class="deco-daisy" style="position:absolute;width:22%;height:22%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('detects pixel overscale Daisy stamps', () => {
    const html = '<div class="deco-daisy" style="width:390px;height:390px"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('skips official-band Daisy paint', () => {
    const html = '<div class="deco-daisy" style="position:absolute;width:12%;top:8%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(false);
  });

  it('detects outside-canvas Daisy hangs that letterbox overflow clips', () => {
    const html =
      '<div class="deco-daisy-tl" style="position:absolute;top:-3%;left:-2%;width:12%;height:20%"></div>';
    expect(deckHtmlNeedsOfficialMotifRemerge(html)).toBe(true);
  });

  it('skips non-Daisy decks', () => {
    expect(deckHtmlNeedsOfficialMotifRemerge('<section class="slide">Hi</section>')).toBe(false);
  });
});
