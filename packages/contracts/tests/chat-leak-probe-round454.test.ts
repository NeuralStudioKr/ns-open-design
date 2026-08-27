import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 454 (max thin stay)", () => {
  it("leaves max(.4rem, 11px) unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:max(.4rem, 11px);border:1px solid tomato">thin</span>',
      '<p style="padding:max(.4rem, 12px);border:1px solid navy">ok</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/max\(\.4rem, 11px\)[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/max\(\.4rem, 12px\)[^>]*\binfo-card\b|info-card[^>]*max\(\.4rem, 12px\)/i);
  });
});
