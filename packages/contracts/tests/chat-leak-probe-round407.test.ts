import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 407 (leading-dot em in var)", () => {
  it("binds var fallback .8em", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:var(--x, .8em);border:1px solid tomato">ok</span>',
      '<p style="padding:var(--y, .2em);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<p\b[^>]*\binfo-card\b/i);
  });
});
