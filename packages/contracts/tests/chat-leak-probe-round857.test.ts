import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 857 (min ch)", () => {
  it("binds min(calc(1.2ch * 2), calc(1.5ch * 2)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:min(calc(1.2ch * 2), calc(1.5ch * 2));border:1px solid tomato">ok</span>',
      '<p style="padding:min(calc(0.8ch * 2), calc(0.7ch * 2));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/min\(calc\(1\.2ch \* 2\)\, calc\(1\.5ch \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*min\(calc\(1\.2ch \* 2\)\, calc\(1\.5ch \* 2\)\)/i);
    expect(bound).not.toMatch(/min\(calc\(0\.8ch \* 2\)\, calc\(0\.7ch \* 2\)\)[^>]*\binfo-card\b/i);
  });
});
