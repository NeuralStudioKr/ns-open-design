import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 348 (logical padding calc)", () => {
  it("binds padding-block/inline calc card padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding-block:calc(1ic + 0px);border:1px solid tomato">pb</span>',
      '<p style="padding-inline-end:max(12px, 1ch);border:1px solid navy">pie</p>',
      '<span style="padding-block:calc(1px + 0px);border:1px solid teal">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b[^>]*padding-block:calc\(1ic|<span\b[^>]*padding-block:calc\(1ic[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<p\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/padding-block:calc\(1px[^>]*\binfo-card\b/i);
  });
});
