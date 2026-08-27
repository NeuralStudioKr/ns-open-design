import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 369 (set59 kit+padding)", () => {
  it("binds max(12px) on ul and keeps thin ul unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<ul style="padding:max(12px, 8px);border:1px solid navy"><li>a</li></ul>',
      '<ul style="padding:max(4px, 2px);border:1px solid tomato"><li>b</li></ul>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<ul\b[^>]*max\(12px[^>]*\binfo-card\b|<ul\b[^>]*\binfo-card\b[^>]*max\(12px/i);
    expect(bound).not.toMatch(/max\(4px[^>]*\binfo-card\b/i);
  });
});
