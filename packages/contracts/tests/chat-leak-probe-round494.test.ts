import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 494 (calc % sum keep)", () => {
  it("still binds calc(3% + 1%)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3% + 1%);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/3% \+ 1%[^>]*\binfo-card\b|info-card[^>]*3% \+ 1%/i);
  });
});
