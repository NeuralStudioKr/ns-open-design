import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 182 (webkit font-size-adjust / writing-mode)", () => {
  it("copies webkit font-size-adjust / writing-mode", () => {
    const html = [
      '<section class="slide" style="-webkit-font-size-adjust:0.5;-webkit-writing-mode:vertical-rl;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-font-size-adjust:\s*0\.5/i);
    expect(flow).toMatch(/-webkit-writing-mode:\s*vertical-rl/i);
  });
});
