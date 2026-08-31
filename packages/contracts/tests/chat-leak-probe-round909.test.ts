import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 909 (calc vh min +)", () => {
  it("binds calc(min(calc(1.2vh * 2), calc(1.5vh * 2)) + 0.2vh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(min(calc(1.2vh * 2), calc(1.5vh * 2)) + 0.2vh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(min(calc(0.8vh * 2), calc(0.7vh * 2)) + 0.1vh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(min\(calc\(1\.2vh \* 2\)\, calc\(1\.5vh \* 2\)\) \+ 0\.2vh\)[^>]*\binfo-card\b|info-card[^>]*calc\(min\(calc\(1\.2vh \* 2\)\, calc\(1\.5vh \* 2\)\) \+ 0\.2vh\)/i);
    expect(bound).not.toMatch(/calc\(min\(calc\(0\.8vh \* 2\)\, calc\(0\.7vh \* 2\)\) \+ 0\.1vh\)[^>]*\binfo-card\b/i);
  });
});
