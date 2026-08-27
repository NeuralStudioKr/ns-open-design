import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 276 (ms content-zoom)", () => {
  it("copies ms content-zoom", () => {
    const html = [
      '<section class="slide" style="-ms-content-zoom-limit:1 2;-ms-content-zoom-limit-max:2;-ms-content-zoom-limit-min:1;-ms-content-zoom-snap:mandatory;-ms-content-zoom-snap-points:snapList(100%,200%);-ms-content-zoom-snap-type:mandatory;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-content-zoom-limit:\s*1 2/i);
    expect(flow).toMatch(/-ms-content-zoom-limit-max:\s*2/i);
    expect(flow).toMatch(/-ms-content-zoom-limit-min:\s*1/i);
    expect(flow).toMatch(/-ms-content-zoom-snap:\s*mandatory/i);
    expect(flow).toMatch(/-ms-content-zoom-snap-type:\s*mandatory/i);
  });
});
