import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas, bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 345 (set49–54 closure)", () => {
  it("copies vendors, selective kit, invent-frame off, hardens @position-try", () => {
    const html = [
      '<section class="slide" style="-moz-stack-sizing:stretch-to-fit;-webkit-mask-composite-source:source-over;-moz-text-emphasis-position:over;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-stack-sizing:\s*stretch-to-fit/i);
    expect(flow).toMatch(/-webkit-mask-composite-source:\s*source-over/i);
    expect(flow).toMatch(/-moz-text-emphasis-position:\s*over/i);
    expect(flow).not.toMatch(/box-shadow/i);
    const kitHtml = [
      '<style data-od-official-look-css>.info-card{{border:1px solid var(--border)}}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<ul style="padding:16px;border:1px solid navy"><li>a</li></ul>',
      '<li style="border:1px solid tomato;padding:1px">thin</li>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kitHtml);
    expect(bound).toMatch(/<ul\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<li\b[^>]*padding:1px[^>]*\binfo-card\b/i);
    expect(looksLikeDeckCodeDebrisLine("@position-try --p { position-area: top }")).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@position-try --p {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
