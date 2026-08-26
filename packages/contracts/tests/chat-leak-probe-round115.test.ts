import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 115 (set7 combo regression)", () => {
  it("copies font-smooth, app-region, and path geometry together", () => {
    const html = [
      '<section class="slide" style="font-smooth:always;-webkit-font-smoothing:antialiased;app-region:drag;-webkit-app-region:drag;x:0;y:0;d:path(\'M0 0L1 1\');points:0 0;pathLength:10;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/font-smooth:\s*always/i);
    expect(flow).toMatch(/-webkit-font-smoothing:\s*antialiased/i);
    expect(flow).toMatch(/app-region:\s*drag/i);
    expect(flow).toMatch(/-webkit-app-region:\s*drag/i);
    expect(flow).toMatch(/x:\s*0/i);
    expect(flow).toMatch(/y:\s*0/i);
    expect(flow).toMatch(/d:\s*path\('M0 0L1 1'\)/i);
    expect(flow).toMatch(/points:\s*0 0/i);
    expect(flow).toMatch(/pathLength:\s*10/i);
  });
});
