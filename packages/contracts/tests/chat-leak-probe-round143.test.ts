import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 143 (set13 vendor combo)", () => {
  it("copies animation, columns, and drag props together", () => {
    const html = [
      '<section class="slide" style="-webkit-animation:spin 1s;-webkit-column-width:10rem;-webkit-user-drag:none;-webkit-text-security:circle;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation:\s*spin 1s/i);
    expect(flow).toMatch(/-webkit-column-width:\s*10rem/i);
    expect(flow).toMatch(/-webkit-user-drag:\s*none/i);
    expect(flow).toMatch(/-webkit-text-security:\s*circle/i);
  });
});
