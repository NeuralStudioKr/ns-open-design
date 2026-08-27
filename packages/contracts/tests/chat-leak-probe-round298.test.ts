import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 298 (webkit flow region)", () => {
  it("copies webkit flow region", () => {
    const html = [
      '<section class="slide" style="-webkit-flow-into:slot;-webkit-flow-from:region;-webkit-region-fragment:auto;-webkit-region-break-after:always;-webkit-region-break-before:avoid;-webkit-region-break-inside:avoid;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-flow-into:\s*slot/i);
    expect(flow).toMatch(/-webkit-flow-from:\s*region/i);
    expect(flow).toMatch(/-webkit-region-fragment:\s*auto/i);
    expect(flow).toMatch(/-webkit-region-break-after:\s*always/i);
    expect(flow).toMatch(/-webkit-region-break-before:\s*avoid/i);
    expect(flow).toMatch(/-webkit-region-break-inside:\s*avoid/i);
  });
});
