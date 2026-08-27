import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 489 (nested mixed calc)", () => {
  it("binds nested section with rem+px calc", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:calc(0.5rem + 4px);border:1px solid navy">inner</section>',
      "<p>after</p>",
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toContain("after");
    expect(bound).toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b|info-card[^>]*0\.5rem \+ 4px/i);
  });
});
