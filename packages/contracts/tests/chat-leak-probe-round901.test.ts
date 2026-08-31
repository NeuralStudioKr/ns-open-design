import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 901 (calc min rem +)", () => {
  it("binds calc(min(calc(0.4rem * 2), calc(0.5rem * 2)) + 0.1rem) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(min(calc(0.4rem * 2), calc(0.5rem * 2)) + 0.1rem);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(min(calc(0.3rem * 2), calc(0.2rem * 2)) + 0.05rem);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(min\(calc\(0\.4rem \* 2\)\, calc\(0\.5rem \* 2\)\) \+ 0\.1rem\)[^>]*\binfo-card\b|info-card[^>]*calc\(min\(calc\(0\.4rem \* 2\)\, calc\(0\.5rem \* 2\)\) \+ 0\.1rem\)/i);
    expect(bound).not.toMatch(/calc\(min\(calc\(0\.3rem \* 2\)\, calc\(0\.2rem \* 2\)\) \+ 0\.05rem\)[^>]*\binfo-card\b/i);
  });
});
