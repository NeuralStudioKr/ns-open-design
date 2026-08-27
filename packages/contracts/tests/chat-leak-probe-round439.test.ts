import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 439 (min thin stay unbound)", () => {
  it("leaves min(.5rem, 8px) unbound and binds min(.5rem, 12px)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:min(.5rem, 8px);border:1px solid tomato">thin</span>',
      '<p style="padding:min(.5rem, 12px);border:1px solid navy">ok</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/min\(\.5rem, 8px\)[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/min\(\.5rem, 12px\)[^>]*\binfo-card\b|info-card[^>]*min\(\.5rem, 12px\)/i);
  });
});
