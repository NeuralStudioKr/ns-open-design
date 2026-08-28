import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 855 (clamp calc rem)", () => {
  it("binds clamp(calc(0.2rem * 1), calc(0.4rem * 2), calc(0.5rem * 2)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:clamp(calc(0.2rem * 1), calc(0.4rem * 2), calc(0.5rem * 2));border:1px solid tomato">ok</span>',
      '<p style="padding:clamp(calc(0.2rem * 1), calc(0.3rem * 2), calc(0.3rem * 2));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/clamp\(calc\(0\.2rem \* 1\)\, calc\(0\.4rem \* 2\)\, calc\(0\.5rem \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*clamp\(calc\(0\.2rem \* 1\)\, calc\(0\.4rem \* 2\)\, calc\(0\.5rem \* 2\)\)/i);
    expect(bound).not.toMatch(/clamp\(calc\(0\.2rem \* 1\)\, calc\(0\.3rem \* 2\)\, calc\(0\.3rem \* 2\)\)[^>]*\binfo-card\b/i);
  });
});
