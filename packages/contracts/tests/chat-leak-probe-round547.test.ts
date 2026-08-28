import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 547 (calc lh+ex)", () => {
  it("binds calc(1lh + 1ex) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1lh + 1ex);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.5lh + 0.5ex);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1lh \+ 1ex[^>]*\binfo-card\b|info-card[^>]*1lh \+ 1ex/i);
    expect(bound).not.toMatch(/0\.5lh \+ 0\.5ex[^>]*\binfo-card\b/i);
  });
});
