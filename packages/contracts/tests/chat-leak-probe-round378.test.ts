import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 378 (Q unit padding)", () => {
  it("binds ≥8Q and leaves thin 2Q unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:8Q;border:1px solid tomato">ok</span>',
      '<p style="padding:12Q;border:1px solid navy">ok2</p>',
      '<span style="padding:2Q;border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/8Q[^>]*\binfo-card\b|info-card[^>]*8Q/i);
    expect(bound).toMatch(/12Q[^>]*\binfo-card\b|info-card[^>]*12Q/i);
    expect(bound).not.toMatch(/padding:2Q[^>]*\binfo-card\b|\binfo-card\b[^>]*padding:2Q/i);
  });
});
