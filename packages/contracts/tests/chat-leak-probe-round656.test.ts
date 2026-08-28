import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 656 (calc ex+cqw)", () => {
  it("binds calc(1ex + 1cqw) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1ex + 1cqw);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.5ex + 0.5cqw);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1ex \+ 1cqw[^>]*\binfo-card\b|info-card[^>]*1ex \+ 1cqw/i);
    expect(bound).not.toMatch(/0\.5ex \+ 0\.5cqw[^>]*\binfo-card\b/i);
  });
});
