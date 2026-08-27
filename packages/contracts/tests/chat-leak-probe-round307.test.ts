import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 307 (blend + ime harden)", () => {
  it("copies blend + ime harden", () => {
    const html = [
      '<section class="slide" style="background-blend-mode:darken;-ms-ime-mode:inactive;ime-mode:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/background-blend-mode:\s*darken/i);
    expect(flow).toMatch(/-ms-ime-mode:\s*inactive/i);
    expect(flow).toMatch(/ime-mode:\s*auto/i);
  });
});
