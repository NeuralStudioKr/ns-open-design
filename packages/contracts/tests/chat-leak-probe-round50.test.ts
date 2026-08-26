import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 50 — gesture/box/host chrome leftovers + grid shorthand flow copy.
 */
describe("chat leak / persist probe round 50 (DRAGDROP · HITAREA · grid)", () => {
  it("drops gesture / selection chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("PINCHZOOM 1 · GESTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SWIPE 1 · GESTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LONGPRESS 1 · GESTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DOUBLETAP 1 · GESTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DRAGDROP 1 · GESTURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LASSO 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MARQUESELECT 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SELECTIONBOX 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CROPBOX 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TRANSFORMBOX 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RESIZEHANDLE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CAROUSELCTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SLIDERCTRL 1 · CTRL")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DRAGDROP 1 · GESTURE\n드래그 앤 드롭", {
        stripCodeFences: true,
      }),
    ).toBe("드래그 앤 드롭");
  });

  it("drops box-model / host chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("HITAREA 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOUCHTARGET 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SAFEZONE 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CONTENTBOX 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BORDERBOX 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCROLLPORT 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLIPBOX 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VIEWBOX 1 · SVG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("IFRAME 1 · FRAME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EMBED 1 · FRAME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PORTALHOST 1 · HOST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHADOWROOT 1 · HOST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SLOTHOST 1 · HOST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TEMPLATEHOST 1 · HOST")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("HITAREA 1 · BOX\n히트 영역", {
        stripCodeFences: true,
      }),
    ).toBe("히트 영역");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("IFRAME 경계를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("IFRAME 경계를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("ROOT 값을 줄임")).toBe(false);
  });

  it("copies grid shorthand into slide flow", () => {
    const html = [
      '<section class="slide" style="grid:auto-flow dense / 1fr 1fr;justify-self:stretch;width:1920px;height:1080px">',
      "<div>a</div><div>b</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/grid:\s*auto-flow dense \/ 1fr 1fr/i);
    expect(flowOpen).toMatch(/justify-self:\s*stretch/i);
  });
});
