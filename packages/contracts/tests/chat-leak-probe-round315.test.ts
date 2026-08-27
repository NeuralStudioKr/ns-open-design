import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 315 (set43–48 closure)", () => {
  it("copies vendor stack, keeps invent-frame off, hardens @page", () => {
    const html = [
      '<section class="slide" style="-moz-background-inline-policy:bounding-box;-webkit-aspect-ratio:1;-webkit-shape-inside:auto;-webkit-region-fragment:break;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-background-inline-policy:\s*bounding-box/i);
    expect(flow).toMatch(/-webkit-aspect-ratio:\s*1/i);
    expect(flow).toMatch(/-webkit-shape-inside:\s*auto/i);
    expect(flow).toMatch(/-webkit-region-fragment:\s*break/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(looksLikeDeckCodeDebrisLine("@page { margin: 0 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@page {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
