import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 859 (clamp vh)", () => {
  it("binds clamp(calc(0.5vh * 1), calc(1.2vh * 2), calc(1.5vh * 2)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:clamp(calc(0.5vh * 1), calc(1.2vh * 2), calc(1.5vh * 2));border:1px solid tomato">ok</span>',
      '<p style="padding:clamp(calc(0.5vh * 1), calc(0.8vh * 2), calc(0.9vh * 2));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/clamp\(calc\(0\.5vh \* 1\)\, calc\(1\.2vh \* 2\)\, calc\(1\.5vh \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*clamp\(calc\(0\.5vh \* 1\)\, calc\(1\.2vh \* 2\)\, calc\(1\.5vh \* 2\)\)/i);
    expect(bound).not.toMatch(/clamp\(calc\(0\.5vh \* 1\)\, calc\(0\.8vh \* 2\)\, calc\(0\.9vh \* 2\)\)[^>]*\binfo-card\b/i);
  });
});
