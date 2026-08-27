import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 362 (lvw + min nested)", () => {
  it("binds 2lvw and min(2lvw, 1rem)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:2lvw;border:1px solid tomato">lvw</span>',
      '<p style="padding:min(2lvw, 1rem);border:1px solid navy">min-lvw</p>',
      '<span style="padding:1lvw;border:1px solid teal">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/2lvw[^>]*\binfo-card\b|info-card[^>]*2lvw/i);
    expect(bound).toMatch(/min\(2lvw[^>]*\binfo-card\b|info-card[^>]*min\(2lvw/i);
    expect(bound).not.toMatch(/padding:1lvw[^>]*\binfo-card\b/i);
  });
});
