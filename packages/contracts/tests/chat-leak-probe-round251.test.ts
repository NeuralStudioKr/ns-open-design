import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 251 (moz-outline)", () => {
  it("copies moz-outline", () => {
    const html = [
      '<section class="slide" style="-moz-outline:1px solid red;-moz-outline-color:navy;-moz-outline-style:dashed;-moz-outline-width:2px;-moz-outline-offset:1px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-outline:\s*1px solid red/i);
    expect(flow).toMatch(/-moz-outline-color:\s*navy/i);
    expect(flow).toMatch(/-moz-outline-style:\s*dashed/i);
    expect(flow).toMatch(/-moz-outline-width:\s*2px/i);
    expect(flow).toMatch(/-moz-outline-offset:\s*1px/i);
  });
});
