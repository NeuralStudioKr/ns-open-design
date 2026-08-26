import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 227 (ms-flex positive/pack/order)", () => {
  it("copies ms-flex positive/pack/order", () => {
    const html = [
      '<section class="slide" style="-ms-flex-positive:1;-ms-flex-negative:0;-ms-flex-preferred-size:20%;-ms-flex-align:center;-ms-flex-pack:justify;-ms-flex-order:2;-ms-order:3;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-flex-positive:\s*1/i);
    expect(flow).toMatch(/-ms-flex-negative:\s*0/i);
    expect(flow).toMatch(/-ms-flex-preferred-size:\s*20%/i);
    expect(flow).toMatch(/-ms-flex-align:\s*center/i);
    expect(flow).toMatch(/-ms-flex-pack:\s*justify/i);
    expect(flow).toMatch(/-ms-flex-order:\s*2/i);
    expect(flow).toMatch(/-ms-order:\s*3/i);
  });
});
