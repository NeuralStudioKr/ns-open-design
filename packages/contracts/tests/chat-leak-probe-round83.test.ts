import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 83 (flood/stop/lighting)", () => {
  it("copies flood/stop/lighting into slide flow", () => {
    const html = [
      '<section class="slide" style="color-interpolation-filters:sRGB;lighting-color:white;flood-color:red;flood-opacity:0.5;stop-color:#f00;stop-opacity:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/color-interpolation-filters:\s*sRGB/i);
    expect(flow).toMatch(/lighting-color:\s*white/i);
    expect(flow).toMatch(/flood-color:\s*red/i);
    expect(flow).toMatch(/flood-opacity:\s*0\.5/i);
    expect(flow).toMatch(/stop-color:\s*#f00/i);
    expect(flow).toMatch(/stop-opacity:\s*1/i);
  });
});
