import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 572 (calc cqw+cqh)", () => {
  it("binds calc(1cqw + 1cqh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1cqw + 1cqh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.5cqw + 0.5cqh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1cqw \+ 1cqh[^>]*\binfo-card\b|info-card[^>]*1cqw \+ 1cqh/i);
    expect(bound).not.toMatch(/0\.5cqw \+ 0\.5cqh[^>]*\binfo-card\b/i);
  });
});
