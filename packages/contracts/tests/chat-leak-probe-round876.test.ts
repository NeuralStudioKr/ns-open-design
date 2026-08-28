import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 876 (prec vh + *)", () => {
  it("binds calc(0.5vh + 1vh * 2) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5vh + 1vh * 2);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.3vh + 0.5vh * 1);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(0\.5vh \+ 1vh \* 2\)[^>]*\binfo-card\b|info-card[^>]*calc\(0\.5vh \+ 1vh \* 2\)/i);
    expect(bound).not.toMatch(/calc\(0\.3vh \+ 0\.5vh \* 1\)[^>]*\binfo-card\b/i);
  });
});
