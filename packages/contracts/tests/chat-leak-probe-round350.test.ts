import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 350 (set55 padding combo)", () => {
  it("binds clamp/cqw card padding together", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:clamp(2cqw, 12px, 3rem);border:1px solid tomato">x</span>',
      '<p style="padding:1cqw;border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<p\b[^>]*\binfo-card\b/i);
  });
});
