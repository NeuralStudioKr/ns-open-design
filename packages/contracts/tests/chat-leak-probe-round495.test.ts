import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 495 (set84 combo)", () => {
  it("binds rem+em and rem+px together", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 0.25em);border:1px solid tomato">a</span>',
      '<p style="padding:calc(0.5rem + 4px);border:1px solid navy">b</p>',
      '<span style="padding:calc(0.4rem + 0.2em);border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/0\.5rem \+ 0\.25em[^>]*\binfo-card\b|info-card[^>]*0\.5rem \+ 0\.25em/i);
    // 루프546 F7: mixed rem+px == 12px physical is thin (round437 SSOT).
    // Same-unit rem+em (0.5rem + 0.25em = 0.75rem-equiv) still binds above.
    expect(bound).not.toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/0\.4rem \+ 0\.2em[^>]*\binfo-card\b/i);
  });
});
