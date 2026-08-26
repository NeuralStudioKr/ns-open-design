import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 138 (webkit-hyphens/columns)", () => {
  it("copies -webkit-hyphens and column longhands", () => {
    const html = [
      '<section class="slide" style="-webkit-hyphens:auto;-webkit-column-rule:1px solid navy;-webkit-column-span:all;-webkit-column-width:12rem;-webkit-column-fill:balance;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-hyphens:\s*auto/i);
    expect(flow).toMatch(/-webkit-column-rule:\s*1px solid navy/i);
    expect(flow).toMatch(/-webkit-column-span:\s*all/i);
    expect(flow).toMatch(/-webkit-column-width:\s*12rem/i);
    expect(flow).toMatch(/-webkit-column-fill:\s*balance/i);
  });
});
