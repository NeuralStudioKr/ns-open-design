import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 121 (webkit-mask)", () => {
  it("copies -webkit-mask shorthand and core longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-mask:url(a.png) center / cover no-repeat;-webkit-mask-image:url(b.png);-webkit-mask-size:cover;-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask:\s*url\(a\.png\) center \/ cover no-repeat/i);
    expect(flow).toMatch(/-webkit-mask-image:\s*url\(b\.png\)/i);
    expect(flow).toMatch(/-webkit-mask-size:\s*cover/i);
    expect(flow).toMatch(/-webkit-mask-position:\s*center/i);
    expect(flow).toMatch(/-webkit-mask-repeat:\s*no-repeat/i);
  });
});
