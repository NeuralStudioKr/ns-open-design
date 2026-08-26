import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 76 (border-image)", () => {
  it("copies border-image family into slide flow", () => {
    const html = [
      '<section class="slide" style="border-image:url(x) 30;border-image-source:url(x);border-image-slice:30;border-image-width:1;border-image-outset:2;border-image-repeat:round;border-collapse:collapse;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/border-image:\s*url\(x\) 30/i);
    expect(flow).toMatch(/border-image-source:\s*url\(x\)/i);
    expect(flow).toMatch(/border-image-slice:\s*30/i);
    expect(flow).toMatch(/border-image-width:\s*1/i);
    expect(flow).toMatch(/border-image-outset:\s*2/i);
    expect(flow).toMatch(/border-image-repeat:\s*round/i);
    expect(flow).toMatch(/border-collapse:\s*collapse/i);
  });
});
