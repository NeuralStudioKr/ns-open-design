import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 81 (mask · mask-border)", () => {
  it("copies mask and mask-border into slide flow", () => {
    const html = [
      '<section class="slide" style="mask:url(#m);mask-border-source:url(x);mask-border-mode:alpha;mask-border-slice:10;mask-border-width:1;mask-border-outset:0;mask-border-repeat:stretch;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/mask:\s*url\(#m\)/i);
    expect(flow).toMatch(/mask-border-source:\s*url\(x\)/i);
    expect(flow).toMatch(/mask-border-mode:\s*alpha/i);
    expect(flow).toMatch(/mask-border-slice:\s*10/i);
    expect(flow).toMatch(/mask-border-width:\s*1/i);
    expect(flow).toMatch(/mask-border-outset:\s*0/i);
    expect(flow).toMatch(/mask-border-repeat:\s*stretch/i);
  });
});
