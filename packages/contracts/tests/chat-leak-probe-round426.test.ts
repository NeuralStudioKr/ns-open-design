import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 426 (max(.75rem, 12px))", () => {
  it("binds max with leading-dot rem", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:max(.75rem, 12px);border:1px solid tomato">x</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/<span\b[^>]*\binfo-card\b/i);
  });
});
