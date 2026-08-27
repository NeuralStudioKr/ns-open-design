import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 456 (calc Q sum)", () => {
  it("binds calc(4Q + 4Q)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(4Q + 4Q);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2Q + 2Q);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/4Q \+ 4Q[^>]*\binfo-card\b|info-card[^>]*4Q \+ 4Q/i);
    expect(bound).not.toMatch(/2Q \+ 2Q[^>]*\binfo-card\b/i);
  });
});
