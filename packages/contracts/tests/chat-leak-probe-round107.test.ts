import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 107 (bdi/bdo/del/ins kit)", () => {
  it("binds selective bdi/bdo/del/ins with card-like padding", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<bdi style="padding:24px;border:1px solid tomato">bdi</bdi>',
      '<bdo style="padding-block:1ic;border:1px solid navy" dir="rtl">bdo</bdo>',
      '<del style="padding:0.75rem;border:1px solid teal">del</del>',
      '<ins style="padding:12px;border:1px solid olive">ins</ins>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<bdi\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<bdo\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<del\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<ins\b[^>]*\binfo-card\b/i);
  });
});
