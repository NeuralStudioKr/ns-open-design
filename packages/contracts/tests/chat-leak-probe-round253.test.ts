import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 253 (ms high-contrast flow ime)", () => {
  it("copies ms high-contrast flow ime", () => {
    const html = [
      '<section class="slide" style="-ms-high-contrast-adjust:none;-ms-ime-align:auto;-ms-flow-from:slot;-ms-flow-into:region;-ms-accelerator:false;-ms-text-autospace:ideograph-alpha;-ms-text-kashida-space:10%;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-high-contrast-adjust:\s*none/i);
    expect(flow).toMatch(/-ms-ime-align:\s*auto/i);
    expect(flow).toMatch(/-ms-flow-from:\s*slot/i);
    expect(flow).toMatch(/-ms-flow-into:\s*region/i);
    expect(flow).toMatch(/-ms-accelerator:\s*false/i);
    expect(flow).toMatch(/-ms-text-autospace:\s*ideograph-alpha/i);
    expect(flow).toMatch(/-ms-text-kashida-space:\s*10%/i);
  });
});
