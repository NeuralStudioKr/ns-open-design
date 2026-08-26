import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 84 (nav · spatial-navigation)", () => {
  it("copies nav and spatial-navigation into slide flow", () => {
    const html = [
      '<section class="slide" style="nav-up:#a;nav-down:#b;nav-left:#c;nav-right:#d;spatial-navigation-action:focus;spatial-navigation-contain:contain;input-security:auto;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/nav-up:\s*#a/i);
    expect(flow).toMatch(/nav-down:\s*#b/i);
    expect(flow).toMatch(/nav-left:\s*#c/i);
    expect(flow).toMatch(/nav-right:\s*#d/i);
    expect(flow).toMatch(/spatial-navigation-action:\s*focus/i);
    expect(flow).toMatch(/spatial-navigation-contain:\s*contain/i);
    expect(flow).toMatch(/input-security:\s*auto/i);
  });
});
