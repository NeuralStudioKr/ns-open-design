import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 53 — MODAL/TOAST/CHART suffix chrome + will-change/perspective/
 * scroll-margin flow copy.
 */
describe("chat leak / persist probe round 53 (MODAL/CHART suffix · perspective)", () => {
  it("drops MODAL/TOAST/DRAWER/OVERLAY suffix leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOMODAL 1 · MODAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARTOAST 1 · TOAST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZALERT 1 · ALERT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXDIALOG 1 · DIALOG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPPOPOVER 1 · POPOVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOTOOLTIP 1 · TOOLTIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARDRAWER 1 · DRAWER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSHEET 1 · SHEET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXOVERLAY 1 · OVERLAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPBACKDROP 1 · BACKDROP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSKELETON 1 · SKELETON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARLOADER 1 · LOADER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSPINNER 1 · SPINNER")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOMODAL 1 · MODAL\n모달", {
        stripCodeFences: true,
      }),
    ).toBe("모달");
  });

  it("drops LIST/GRID/CHART/IMAGE/VIDEO suffix leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOLIST 1 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARGRID 1 · GRID")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZTREE 1 · TREE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXFORM 1 · FORM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTABLE 1 · TABLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCHART 1 · CHART")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOGRAPH 1 · GRAPH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZIMAGE 1 · IMAGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXICON 1 · ICON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOVIDEO 1 · VIDEO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARAUDIO 1 · AUDIO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZCANVAS 1 · CANVAS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXMAP 1 · MAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOBUTTON 1 · BUTTON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXINPUT 1 · INPUT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOPROGRESS 1 · PROGRESS")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ZAPCHART 1 · CHART\n차트", {
        stripCodeFences: true,
      }),
    ).toBe("차트");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOMODAL 레이어를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOMODAL 레이어를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("ZAPCHART 값을 줄임")).toBe(false);
  });

  it("copies will-change/perspective/scroll-margin into slide flow", () => {
    const html = [
      '<section class="slide" style="will-change:transform;backface-visibility:hidden;perspective:800px;transform-style:preserve-3d;zoom:1.05;scale:1.02;translate:0 8px;rotate:2deg;scroll-margin:16px;scroll-padding:24px;overflow-anchor:none;resize:both;forced-color-adjust:none;print-color-adjust:exact;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/will-change:\s*transform/i);
    expect(flowOpen).toMatch(/backface-visibility:\s*hidden/i);
    expect(flowOpen).toMatch(/perspective:\s*800px/i);
    expect(flowOpen).toMatch(/transform-style:\s*preserve-3d/i);
    expect(flowOpen).toMatch(/zoom:\s*1\.05/i);
    expect(flowOpen).toMatch(/scale:\s*1\.02/i);
    expect(flowOpen).toMatch(/translate:\s*0 8px/i);
    expect(flowOpen).toMatch(/rotate:\s*2deg/i);
    expect(flowOpen).toMatch(/scroll-margin:\s*16px/i);
    expect(flowOpen).toMatch(/scroll-padding:\s*24px/i);
    expect(flowOpen).toMatch(/overflow-anchor:\s*none/i);
    expect(flowOpen).toMatch(/resize:\s*both/i);
    expect(flowOpen).toMatch(/forced-color-adjust:\s*none/i);
    expect(flowOpen).toMatch(/print-color-adjust:\s*exact/i);
  });
});
