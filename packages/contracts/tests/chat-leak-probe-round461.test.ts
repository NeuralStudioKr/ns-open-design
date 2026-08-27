import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 461 (calc multiply skip)", () => {
  it("does not treat calc(3px * 4) as card via sum heuristic alone", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3px * 4);border:1px solid tomato">mul</span>',
      '<p style="padding:calc(8px + 4px);border:1px solid navy">ok</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    // * skipped by heuristic; 3px alone thin — unbound unless other rule
    expect(bound).not.toMatch(/3px \* 4[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/8px \+ 4px[^>]*\binfo-card\b|info-card[^>]*8px \+ 4px/i);
  });
});
