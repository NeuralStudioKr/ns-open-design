import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 165 (set16–18 closure)", () => {
  it("copies vendor stack and drops FOO chrome", () => {
    const html = [
      '<section class="slide" style="-webkit-box-pack:end;-webkit-font-variant-ligatures:none;-webkit-border-image-repeat:stretch;-webkit-marquee-speed:normal;-webkit-text-zoom:reset;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-box-pack:\s*end/i);
    expect(flow).toMatch(/-webkit-font-variant-ligatures:\s*none/i);
    expect(flow).toMatch(/-webkit-border-image-repeat:\s*stretch/i);
    expect(flow).toMatch(/-webkit-marquee-speed:\s*normal/i);
    expect(flow).toMatch(/-webkit-text-zoom:\s*reset/i);
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 4 / TOKEN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 4 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
