import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 310 (set47 combo)", () => {
  it("copies set47 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-flow-from:aside;-apple-dashboard-region:dashboard;-moz-box-flex-group:2;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-flow-from:\s*aside/i);
    expect(flow).toMatch(/-apple-dashboard-region:\s*dashboard/i);
    expect(flow).toMatch(/-moz-box-flex-group:\s*2/i);
  });
});
