import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 410 (set67 padding combo)", () => {
  it("binds min(.75rem, 2vw) and var 16px together", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:min(.75rem, 2vw);border:1px solid tomato">x</span>',
      '<p style="padding:var(--p, 16px);border:1px solid navy">y</p>',
      '<span style="padding:.4rem;border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*min\(\.75rem[^>]*\binfo-card\b|<span\b[^>]*\binfo-card\b[^>]*min\(\.75rem/i);
    expect(bound).toMatch(/<p\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/\.4rem[^>]*\binfo-card\b/i);
  });
});
