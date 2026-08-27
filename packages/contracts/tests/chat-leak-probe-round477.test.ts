import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 477 (section % sum)", () => {
  it("binds selective section with calc % sum", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:calc(3% + 1%);border:1px solid navy">ok</section>',
      '<section style="padding:calc(2% + 1%);border:1px solid tomato">thin</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/3% \+ 1%[^>]*\binfo-card\b|info-card[^>]*3% \+ 1%/i);
    expect(bound).not.toMatch(/2% \+ 1%[^>]*\binfo-card\b/i);
  });
});
