import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 822 (calc px * *)", () => {
  it("binds calc(7px * 2 * 1) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(7px * 2 * 1);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(5px * 2 * 1);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/7px \* 2 \* 1[^>]*\binfo-card\b|info-card[^>]*7px \* 2 \* 1/i);
    expect(bound).not.toMatch(/5px \* 2 \* 1[^>]*\binfo-card\b/i);
  });
});
