import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 346 (calc/min/max/clamp padding kit)", () => {
  it("binds card padding expressed via calc/min/max/clamp", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(12px + 0px);border:1px solid tomato">calc</span>',
      '<p style="padding:min(12px, 2rem);border:1px solid navy">min</p>',
      '<span style="padding:max(1rem, 12px);border:1px solid teal">max</span>',
      '<p style="padding:clamp(12px, 2vw, 24px);border:1px solid olive">clamp</p>',
      '<span style="padding:calc(4px + 2px);border:1px solid gold">thin-calc</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*calc\(12px[^>]*\binfo-card\b|<span\b[^>]*\binfo-card\b[^>]*calc\(12px/i);
    expect(bound).toMatch(/<p\b[^>]*\binfo-card\b[^>]*min\(12px|<p\b[^>]*min\(12px[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b[^>]*max\(|<span\b[^>]*max\([^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<p\b[^>]*\binfo-card\b[^>]*clamp\(|<p\b[^>]*clamp\([^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/thin-calc[^>]*\binfo-card\b|info-card[^>]*thin-calc/i);
  });
});
