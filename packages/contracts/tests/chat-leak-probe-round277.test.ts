import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 277 (ms scroll-limit snap-points touch-select)", () => {
  it("copies ms scroll-limit snap-points touch-select", () => {
    const html = [
      '<section class="slide" style="-ms-scroll-limit:0 0 100 100;-ms-scroll-limit-x-max:100px;-ms-scroll-limit-x-min:0;-ms-scroll-limit-y-max:100px;-ms-scroll-limit-y-min:0;-ms-scroll-translation:vertical-to-horizontal;-ms-scroll-snap-points-x:snapInterval(0%,100%);-ms-scroll-snap-points-y:snapList(0%,50%);-ms-touch-select:grippers;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-scroll-limit-x-max:\s*100px/i);
    expect(flow).toMatch(/-ms-scroll-limit-y-min:\s*0/i);
    expect(flow).toMatch(/-ms-scroll-translation:\s*vertical-to-horizontal/i);
    expect(flow).toMatch(/-ms-scroll-snap-points-x:\s*snapInterval\(0%,100%\)/i);
    expect(flow).toMatch(/-ms-touch-select:\s*grippers/i);
  });
});
