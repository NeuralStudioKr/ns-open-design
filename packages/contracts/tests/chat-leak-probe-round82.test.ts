import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 82 (stroke/fill SVG presentation)", () => {
  it("copies stroke/fill presentation into slide flow", () => {
    const html = [
      '<section class="slide" style="stroke-dasharray:1 2;stroke-dashoffset:0;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:4;fill-rule:evenodd;clip-rule:evenodd;marker:url(#m);marker-start:url(#a);marker-mid:url(#b);marker-end:url(#c);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/stroke-dasharray:\s*1 2/i);
    expect(flow).toMatch(/stroke-linecap:\s*round/i);
    expect(flow).toMatch(/fill-rule:\s*evenodd/i);
    expect(flow).toMatch(/clip-rule:\s*evenodd/i);
    expect(flow).toMatch(/marker:\s*url\(#m\)/i);
    expect(flow).toMatch(/marker-start:\s*url\(#a\)/i);
    expect(flow).toMatch(/marker-end:\s*url\(#c\)/i);
  });
});
