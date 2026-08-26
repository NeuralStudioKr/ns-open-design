import { describe, expect, it } from "vitest";
import {
  bindFakeOutlineCardsToOfficialKit,
  pinDeckSlidesToFixedCanvas,
} from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 95 (rt/rp/rtc kit · font metric overrides)", () => {
  const kit =
    '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';

  it("binds selective rt/rp/rtc with card-like padding", () => {
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<rt style="padding:24px;border:1px solid tomato">rt</rt>',
      '<rp style="padding-block:1ic;border:1px solid navy">rp</rp>',
      '<rtc style="padding:0.75rem;border:1px solid teal">rtc</rtc>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<rt\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<rp\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<rtc\b[^>]*\binfo-card\b/i);
  });

  it("copies ascent/descent/line-gap/size-adjust and forced-colors-adjust", () => {
    const html = [
      '<section class="slide" style="ascent-override:90%;descent-override:20%;line-gap-override:0%;size-adjust:100%;forced-colors-adjust:none;font-display:swap;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/ascent-override:\s*90%/i);
    expect(flow).toMatch(/descent-override:\s*20%/i);
    expect(flow).toMatch(/line-gap-override:\s*0%/i);
    expect(flow).toMatch(/size-adjust:\s*100%/i);
    expect(flow).toMatch(/forced-colors-adjust:\s*none/i);
    expect(flow).toMatch(/font-display:\s*swap/i);
  });
});
