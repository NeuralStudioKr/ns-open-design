import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 467 (calc rem+px mixed)", () => {
  // 루프546 F7 (0826-N01): round437 is SSOT — mixed rem+px whose physical
  // sum is exactly 12px reads as thin outline, not a card. Both borderline
  // samples below now stay unbound (previous "bind at 12" expectation
  // conflicted with round437 and is retired).
  it("leaves both thin mixed rem+px unbound (0.5rem + 4px == 12px == thin)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 4px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.4rem + 4px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/0\.4rem \+ 4px[^>]*\binfo-card\b/i);
  });
});
