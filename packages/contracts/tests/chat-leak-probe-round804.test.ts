import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 804 (calc pt *)", () => {
  it("binds calc(5pt * 2) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(5pt * 2);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(3pt * 2);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/5pt \* 2[^>]*\binfo-card\b|info-card[^>]*5pt \* 2/i);
    expect(bound).not.toMatch(/3pt \* 2[^>]*\binfo-card\b/i);
  });
});
