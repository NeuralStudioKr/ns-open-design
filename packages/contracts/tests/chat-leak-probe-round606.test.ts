import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 606 (calc pct+cqw)", () => {
  it("binds calc(2% + 1cqw) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(2% + 1cqw);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(1% + 0.5cqw);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/2% \+ 1cqw[^>]*\binfo-card\b|info-card[^>]*2% \+ 1cqw/i);
    expect(bound).not.toMatch(/1% \+ 0\.5cqw[^>]*\binfo-card\b/i);
  });
});
