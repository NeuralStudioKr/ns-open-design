import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 502 (section rem+em)", () => {
  it("binds selective section with rem+em calc", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:calc(.5rem + .25em);border:1px solid navy">ok</section>',
      '<section style="padding:calc(.3rem + .2em);border:1px solid tomato">thin</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.5rem \+ \.25em[^>]*\binfo-card\b|info-card[^>]*\.5rem \+ \.25em/i);
    expect(bound).not.toMatch(/\.3rem \+ \.2em[^>]*\binfo-card\b/i);
  });
});
