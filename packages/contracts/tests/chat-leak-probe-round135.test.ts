import { describe, expect, it } from "vitest";
import {
  bindFakeOutlineCardsToOfficialKit,
  pinDeckSlidesToFixedCanvas,
} from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 135 (set10–12 closure)", () => {
  it("binds pre cards and copies webkit mask/filter/flex", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="-webkit-mask-image:url(a.png);-webkit-filter:blur(1px);-webkit-flex:1;-webkit-border-radius:8px;width:1920px;height:1080px">',
      '<pre style="padding:1ic;border:1px solid tomato">pre</pre>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<pre\b[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-image:\s*url\(a\.png\)/i);
    expect(flow).toMatch(/-webkit-filter:\s*blur\(1px\)/i);
    expect(flow).toMatch(/-webkit-flex:\s*1/i);
    expect(flow).toMatch(/-webkit-border-radius:\s*8px/i);
  });
});
