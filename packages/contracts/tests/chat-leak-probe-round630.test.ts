import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 630 (calc ch+vh)", () => {
  it("binds calc(1ch + 1vh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1ch + 1vh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.5ch + 0.5vh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1ch \+ 1vh[^>]*\binfo-card\b|info-card[^>]*1ch \+ 1vh/i);
    expect(bound).not.toMatch(/0\.5ch \+ 0\.5vh[^>]*\binfo-card\b/i);
  });
});
