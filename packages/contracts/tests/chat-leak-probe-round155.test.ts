import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 155 (box+font combo)", () => {
  it("copies legacy box and font-feature together", () => {
    const html = [
      '<section class="slide" style="-webkit-box-pack:justify;-webkit-box-flex:2;-webkit-font-feature-settings:\'kern\' 1;-webkit-logical-width:60%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-pack:\s*justify/i);
    expect(flow).toMatch(/-webkit-box-flex:\s*2/i);
    expect(flow).toMatch(/-webkit-font-feature-settings:\s*'kern' 1/i);
    expect(flow).toMatch(/-webkit-logical-width:\s*60%/i);
  });
});
