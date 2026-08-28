import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 598 (calc ch+cqh)", () => {
  it("binds calc(1.2ch + 0.8cqh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1.2ch + 0.8cqh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.3ch + 0.3cqh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1\.2ch \+ 0\.8cqh[^>]*\binfo-card\b|info-card[^>]*1\.2ch \+ 0\.8cqh/i);
    expect(bound).not.toMatch(/0\.3ch \+ 0\.3cqh[^>]*\binfo-card\b/i);
  });
});
