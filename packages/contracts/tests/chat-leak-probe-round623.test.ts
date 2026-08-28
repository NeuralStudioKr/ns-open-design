import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 623 (calc pt+vw)", () => {
  it("binds calc(6pt + 0.5vw) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(6pt + 0.5vw);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2pt + 0.2vw);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/6pt \+ 0\.5vw[^>]*\binfo-card\b|info-card[^>]*6pt \+ 0\.5vw/i);
    expect(bound).not.toMatch(/2pt \+ 0\.2vw[^>]*\binfo-card\b/i);
  });
});
