import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 52 — expanded chrome suffixes (VIEW/PANE/HOST/…) + scroll-snap /
 * isolation / contain flow copy.
 */
describe("chat leak / persist probe round 52 (VIEW/HOST suffix · scroll-snap)", () => {
  it("drops VIEW/PANE/WIDGET/HOST/FRAME suffix leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("ABCVIEW 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DEKPANE 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QWIDGET 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOHOST 1 · HOST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HISFRAME 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARBOX 1 · BOX")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXFIELD 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPMENU 1 · UI")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ABCVIEW 1 · X\n뷰 트랙", {
        stripCodeFences: true,
      }),
    ).toBe("뷰 트랙");
  });

  it("drops LAYER/PANEL/CARD/CHIP/SLOT/SHELL suffix leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOLAYER 1 · LAYER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZPANEL 1 · PANEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXCARD 1 · CARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCHIP 1 · CHIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOBADGE 1 · BADGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARPILL 1 · PILL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSLOT 1 · SLOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPZONE 1 · ZONE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOORAIL 1 · RAIL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARSHELL 1 · SHELL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZWRAP 1 · WRAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSTACK 1 · STACK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPGROUP 1 · GROUP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXMODE 1 · MODE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSTAGE 1 · STAGE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOLAYER 1 · LAYER\n레이어", {
        stripCodeFences: true,
      }),
    ).toBe("레이어");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("ABCVIEW 레이아웃을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("ABCVIEW 레이아웃을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("FOOHOST 값을 줄임")).toBe(false);
  });

  it("copies isolation/contain/scroll-snap into slide flow", () => {
    const html = [
      '<section class="slide" style="isolation:isolate;contain:layout;content-visibility:auto;scroll-snap-type:x mandatory;scroll-snap-align:start;scrollbar-gutter:stable;overscroll-behavior:contain;user-select:none;touch-action:pan-y;color-scheme:light;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/isolation:\s*isolate/i);
    expect(flowOpen).toMatch(/contain:\s*layout/i);
    expect(flowOpen).toMatch(/content-visibility:\s*auto/i);
    expect(flowOpen).toMatch(/scroll-snap-type:\s*x mandatory/i);
    expect(flowOpen).toMatch(/scroll-snap-align:\s*start/i);
    expect(flowOpen).toMatch(/scrollbar-gutter:\s*stable/i);
    expect(flowOpen).toMatch(/overscroll-behavior:\s*contain/i);
    expect(flowOpen).toMatch(/user-select:\s*none/i);
    expect(flowOpen).toMatch(/touch-action:\s*pan-y/i);
    expect(flowOpen).toMatch(/color-scheme:\s*light/i);
  });
});
