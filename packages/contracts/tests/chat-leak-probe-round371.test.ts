import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 371 (print unit boundaries)", () => {
  it("binds 8pt/4mm and keeps 7pt/3mm thin", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:8pt;border:1px solid tomato">pt</span>',
      '<p style="padding:4mm;border:1px solid navy">mm</p>',
      '<span style="padding:7pt;border:1px solid teal">thin-pt</span>',
      '<p style="padding:3mm;border:1px solid olive">thin-mm</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/padding:8pt[^>]*\binfo-card\b|info-card[^>]*padding:8pt/i);
    expect(bound).toMatch(/padding:4mm[^>]*\binfo-card\b|info-card[^>]*padding:4mm/i);
    expect(bound).not.toMatch(/thin-pt[^>]*\binfo-card\b|info-card[^>]*thin-pt/i);
    expect(bound).not.toMatch(/thin-mm[^>]*\binfo-card\b|info-card[^>]*thin-mm/i);
  });
});
