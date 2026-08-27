import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 328 (kit s/u/wbr/col)", () => {
  it("binds padded s/u/colgroup and keeps thin wbr unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<s style="padding:16px;border:1px solid navy">old</s>',
      '<u style="padding:12px;border:1px solid tomato">u</u>',
      '<colgroup style="padding:16px;border:1px solid teal"></colgroup>',
      '<col style="padding:12px;border:1px solid olive" />',
      '<wbr style="border:1px solid gold;padding:1px" />',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<s\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<u\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<colgroup\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<wbr\b[^>]*\binfo-card\b/i);
  });
});
