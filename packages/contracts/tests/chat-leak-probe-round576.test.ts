import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 576 (calc cqh+cqb)", () => {
  it("binds calc(1cqh + 1cqb) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1cqh + 1cqb);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.6cqh + 0.4cqb);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1cqh \+ 1cqb[^>]*\binfo-card\b|info-card[^>]*1cqh \+ 1cqb/i);
    expect(bound).not.toMatch(/0\.6cqh \+ 0\.4cqb[^>]*\binfo-card\b/i);
  });
});
