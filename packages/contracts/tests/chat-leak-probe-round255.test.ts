import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 255 (set34–36 closure)", () => {
  it("copies vendor stack, keeps invent-frame off, hardens @scope", () => {
    const html = [
      '<section class="slide" style="-moz-box-pack:center;-moz-animation-name:a;-moz-outline-offset:0;-ms-ime-align:auto;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-box-pack:\s*center/i);
    expect(flow).toMatch(/-moz-animation-name:\s*a/i);
    expect(flow).toMatch(/-moz-outline-offset:\s*0/i);
    expect(flow).toMatch(/-ms-ime-align:\s*auto/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(looksLikeDeckCodeDebrisLine("@scope (.x) { opacity: 1 }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@scope (.x) {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
