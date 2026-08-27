import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 492 (calc rem+em leading-dot)", () => {
  it("binds calc(.5rem + .25em)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(.5rem + .25em);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(.3rem + .2em);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.5rem \+ \.25em[^>]*\binfo-card\b|info-card[^>]*\.5rem \+ \.25em/i);
    expect(bound).not.toMatch(/\.3rem \+ \.2em[^>]*\binfo-card\b/i);
  });
});
