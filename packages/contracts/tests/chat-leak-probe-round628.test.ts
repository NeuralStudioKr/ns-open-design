import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 628 (calc mm+cqh)", () => {
  it("binds calc(2mm + 1cqh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(2mm + 1cqh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(1mm + 0.2cqh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/2mm \+ 1cqh[^>]*\binfo-card\b|info-card[^>]*2mm \+ 1cqh/i);
    expect(bound).not.toMatch(/1mm \+ 0\.2cqh[^>]*\binfo-card\b/i);
  });
});
