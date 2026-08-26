import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 151 (webkit-box-pack/align/flex)", () => {
  it("copies legacy -webkit-box pack/align/flex", () => {
    const html = [
      '<section class="slide" style="-webkit-box-pack:center;-webkit-box-align:start;-webkit-box-flex:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-pack:\s*center/i);
    expect(flow).toMatch(/-webkit-box-align:\s*start/i);
    expect(flow).toMatch(/-webkit-box-flex:\s*1/i);
  });
});
