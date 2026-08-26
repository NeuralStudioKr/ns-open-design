import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 93 (text-size-adjust / text-wrap-*)", () => {
  it("copies text-size-adjust and text-wrap mode/style", () => {
    const html = [
      '<section class="slide" style="text-size-adjust:100%;-webkit-text-size-adjust:none;text-wrap-mode:wrap;text-wrap-style:balance;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/text-size-adjust:\s*100%/i);
    expect(flow).toMatch(/-webkit-text-size-adjust:\s*none/i);
    expect(flow).toMatch(/text-wrap-mode:\s*wrap/i);
    expect(flow).toMatch(/text-wrap-style:\s*balance/i);
  });
});
