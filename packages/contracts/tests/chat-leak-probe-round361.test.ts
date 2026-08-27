import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 361 (padding %/ch boundaries)", () => {
  it("binds 4%/2ch and keeps 3%/1ch thin", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:4%;border:1px solid tomato">pct</span>',
      '<p style="padding:2ch;border:1px solid navy">ch</p>',
      '<span style="padding:3%;border:1px solid teal">thin-pct</span>',
      '<p style="padding:1ch;border:1px solid olive">thin-ch</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/padding:4%[^>]*\binfo-card\b|info-card[^>]*padding:4%/i);
    expect(bound).toMatch(/padding:2ch[^>]*\binfo-card\b|info-card[^>]*padding:2ch/i);
    expect(bound).not.toMatch(/thin-pct[^>]*\binfo-card\b|info-card[^>]*thin-pct/i);
    expect(bound).not.toMatch(/thin-ch[^>]*\binfo-card\b|info-card[^>]*thin-ch/i);
  });
});
