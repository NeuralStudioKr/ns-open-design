import { describe, expect, it } from 'vitest';

import { buildSrcdoc } from '../../src/runtime/srcdoc';

/** Minimal Grove-like horizontal #deck strip (translateX + is-active). */
const groveLikeHtml = `<!doctype html>
<html><head><style>
#deck { display: flex; width: 200vw; transition: transform .2s; }
.slide { flex: 0 0 100vw; width: 100vw; min-height: 200px; }
.slide [data-anim] { opacity: 0; }
.slide.is-active [data-anim] { opacity: 1; }
</style></head><body>
<div id="deck" style="transform: translateX(0vw)">
  <section class="slide is-active"><span data-anim>one</span></section>
  <section class="slide"><span data-anim>two</span></section>
</div>
<nav id="nav-dots"></nav>
</body></html>`;

describe('srcdoc transform-strip deck bridge', () => {
  it('skips overlap repair that would collapse horizontal translate decks', () => {
    const srcdoc = buildSrcdoc(groveLikeHtml, { deck: true });
    expect(srcdoc).toContain('od-deck-bridge');
    // repairOverlappingSlides must no-op when a translate track exists —
    // otherwise forceReveal display:none shortens the strip and page turns
    // land on empty canvas (community Grove templates).
    expect(srcdoc).toMatch(
      /function repairOverlappingSlides[\s\S]*?if \(transformTrack\(list\)\) return false/,
    );
    expect(srcdoc).toContain('syncTransformStripActive');
    expect(srcdoc).toContain('clearInlineSlideHide');
  });

  it('keeps host slide chrome markers for PreviewModal deck previews', () => {
    const srcdoc = buildSrcdoc(groveLikeHtml, { deck: true });
    expect(srcdoc).toContain('od:slide');
    expect(srcdoc).toContain('od:slide-state');
  });
});
