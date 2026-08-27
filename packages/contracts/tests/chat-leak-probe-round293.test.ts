import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 293 (dashboard border-fit box-flex-group)", () => {
  it("copies dashboard border-fit box-flex-group", () => {
    const html = [
      '<section class="slide" style="-webkit-dashboard-region:dashboard;-apple-dashboard-region:none;-webkit-border-fit:lines;-moz-box-flex-group:1;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-dashboard-region:\s*dashboard/i);
    expect(flow).toMatch(/-apple-dashboard-region:\s*none/i);
    expect(flow).toMatch(/-webkit-border-fit:\s*lines/i);
    expect(flow).toMatch(/-moz-box-flex-group:\s*1/i);
  });
});
