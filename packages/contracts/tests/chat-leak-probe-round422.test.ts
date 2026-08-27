import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 422 (clamp .75rem)", () => {
  it("binds clamp(.75rem, 2vw, 2rem)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:clamp(.75rem, 2vw, 2rem);border:1px solid tomato">x</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
  });
});
