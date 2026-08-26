import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 240 (set31–33 closure)", () => {
  it("copies vendor stack, keeps invent-frame off, hardens @view-transition", () => {
    const html = [
      '<section class="slide" style="-ms-flex-direction:row;-ms-grid-row:1;-moz-column-gap:8px;-ms-touch-action:none;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-flex-direction:\s*row/i);
    expect(flow).toMatch(/-ms-grid-row:\s*1/i);
    expect(flow).toMatch(/-moz-column-gap:\s*8px/i);
    expect(flow).toMatch(/-ms-touch-action:\s*none/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(looksLikeDeckCodeDebrisLine("@view-transition { navigation: auto }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@view-transition {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
