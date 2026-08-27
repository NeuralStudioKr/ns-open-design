import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 285 (set37–42 closure)", () => {
  it("copies vendor stack, keeps invent-frame off, hardens @property", () => {
    const html = [
      '<section class="slide" style="-webkit-mask-position-x:0;-ms-scrollbar-arrow-color:navy;-moz-border-image-repeat:round;-ms-word-break:normal;-webkit-line-grid:g;-epub-text-emphasis-color:#111;-moz-inert:false;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-mask-position-x:\s*0/i);
    expect(flow).toMatch(/-ms-scrollbar-arrow-color:\s*navy/i);
    expect(flow).toMatch(/-moz-border-image-repeat:\s*round/i);
    expect(flow).toMatch(/-ms-word-break:\s*normal/i);
    expect(flow).toMatch(/-webkit-line-grid:\s*g/i);
    expect(flow).toMatch(/-epub-text-emphasis-color:\s*#111/i);
    expect(flow).toMatch(/-moz-inert:\s*false/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(looksLikeDeckCodeDebrisLine("@property --x { syntax: \"<number>\" }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@property --x {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
