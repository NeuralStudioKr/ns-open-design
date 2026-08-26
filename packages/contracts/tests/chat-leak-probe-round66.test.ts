import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 66 — @custom-selector scrub and corner-shape/text-box flow copy.
 */
describe("chat leak / persist probe round 66 (@custom-selector · corner-shape)", () => {
  it("scrubs @custom-selector/@view-transition dumps", () => {
    expect(looksLikeDeckCodeDebrisLine("@custom-selector :--btn button;")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@view-transition { navigation: auto; }")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료.\n@custom-selector :--btn button;", {
        stripCodeFences: true,
      }),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\n@view-transition { navigation: auto; }", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("copies corner-shape/text-box into slide flow", () => {
    const html = [
      '<section class="slide" style="anchor-center:none;position-try-order:most-width;inset-area:top;text-box:trim-both cap alphabetic;white-space-trim:discard-inner;text-group-align:center;line-fit-edge:cap;corner-shape:squircle;corner-top-left-shape:scoop;corner-top-right-shape:notch;corner-bottom-left-shape:bevel;corner-bottom-right-shape:square;border-shape:bevel;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/anchor-center:\s*none/i);
    expect(flowOpen).toMatch(/position-try-order:\s*most-width/i);
    expect(flowOpen).toMatch(/inset-area:\s*top/i);
    expect(flowOpen).toMatch(/text-box:\s*trim-both cap alphabetic/i);
    expect(flowOpen).toMatch(/white-space-trim:\s*discard-inner/i);
    expect(flowOpen).toMatch(/text-group-align:\s*center/i);
    expect(flowOpen).toMatch(/line-fit-edge:\s*cap/i);
    expect(flowOpen).toMatch(/corner-shape:\s*squircle/i);
    expect(flowOpen).toMatch(/corner-top-left-shape:\s*scoop/i);
    expect(flowOpen).toMatch(/border-shape:\s*bevel/i);
  });
});
