import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 705 (calc px+cqw)", () => {
  it("binds calc(3px + 1cqw) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3px + 1cqw);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(1px + 0.3cqw);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/3px \+ 1cqw[^>]*\binfo-card\b|info-card[^>]*3px \+ 1cqw/i);
    expect(bound).not.toMatch(/1px \+ 0\.3cqw[^>]*\binfo-card\b/i);
  });
});
