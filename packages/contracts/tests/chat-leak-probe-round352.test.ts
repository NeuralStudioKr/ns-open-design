import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 352 (section padded bind)", () => {
  it("binds nested section with card-like padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:16px;border:1px solid navy">card</section>',
      '<section style="padding:calc(12px + 0px);border:1px solid tomato">calc</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<section\b[^>]*padding:16px[^>]*\binfo-card\b|<section\b[^>]*\binfo-card\b[^>]*padding:16px/i);
    expect(bound).toMatch(/<section\b[^>]*calc\(12px[^>]*\binfo-card\b|<section\b[^>]*\binfo-card\b[^>]*calc\(12px/i);
  });
});
