import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 91 (padding-block/inline ic kit)", () => {
  const kit =
    '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';

  it("binds padding-block:1ic like shorthand padding", () => {
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding-block:1ic;border:1px solid tomato">x</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/border:\s*1px solid tomato/i);
  });

  it("binds padding-inline:1ic and padding-block-start:1ric", () => {
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="padding-inline:1ic;border:1px solid navy">a</p>',
      '<span style="padding-block-start:1ric;border:1px solid teal">b</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<p\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
  });
});
