import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 487 (calc multiply still skip)", () => {
  it("leaves calc(3px * 4) unbound via sum heuristic", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3px * 4);border:1px solid tomato">mul</span>',
      '<p style="padding:calc(3% + 1%);border:1px solid navy">ok</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/3px \* 4[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/3% \+ 1%[^>]*\binfo-card\b|info-card[^>]*3% \+ 1%/i);
  });
});
