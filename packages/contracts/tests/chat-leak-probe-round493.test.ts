import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 493 (calc rem+px thin)", () => {
  // 루프546 F7: round437 is SSOT — mixed rem+px physical sum == 12px is
  // a thin outline, not a card.
  it("leaves calc(0.5rem + 4px) unbound (thin mixed)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 4px);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).not.toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b/i);
  });
});
