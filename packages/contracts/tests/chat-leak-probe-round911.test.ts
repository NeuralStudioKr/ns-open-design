import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 911 (calc min ch +)", () => {
  it("binds calc(min(calc(1.2ch * 2), calc(1.5ch * 2)) + 0.2ch) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(min(calc(1.2ch * 2), calc(1.5ch * 2)) + 0.2ch);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(min(calc(0.8ch * 2), calc(0.7ch * 2)) + 0.1ch);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(min\(calc\(1\.2ch \* 2\)\, calc\(1\.5ch \* 2\)\) \+ 0\.2ch\)[^>]*\binfo-card\b|info-card[^>]*calc\(min\(calc\(1\.2ch \* 2\)\, calc\(1\.5ch \* 2\)\) \+ 0\.2ch\)/i);
    expect(bound).not.toMatch(/calc\(min\(calc\(0\.8ch \* 2\)\, calc\(0\.7ch \* 2\)\) \+ 0\.1ch\)[^>]*\binfo-card\b/i);
  });
});
