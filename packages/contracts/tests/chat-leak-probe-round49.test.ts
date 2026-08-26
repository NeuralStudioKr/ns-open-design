import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 49 — column-count/place-items/flex-grow flow copy + ACTIONBAR/
 * EMPTYSTATE/DATAGRID chrome leftovers.
 */
describe("chat leak / persist probe round 49 (column-count · place-items · EMPTYSTATE)", () => {
  it("drops actionbar / empty-state / datagrid chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("ACTIONBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("APPBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BOTTOMBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OVERFLOWMENU 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EMPTYSTATE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ERRORSTATE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LOADINGSTATE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZEROSTATE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DATAGRID 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VIRTUALLIST 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABLECTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NAVRAIL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LAZYLOAD 1 · LOAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INFINITE 1 · SCROLL")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("EMPTYSTATE 1 · UI\n빈 상태", {
        stripCodeFences: true,
      }),
    ).toBe("빈 상태");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("EMPTYSTATE 화면을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("EMPTYSTATE 화면을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("DATAGRID 값을 줄임")).toBe(false);
  });

  it("copies column-count / columns / column-width into slide flow", () => {
    const html = [
      '<section class="slide" style="column-count:3;column-gap:24px;column-fill:balance;width:1920px;height:1080px">',
      "<div>1</div><div>2</div><div>3</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/data-od-slide-flow[^>]*column-count:\s*3/i);
    expect(pinned).toMatch(/data-od-slide-flow[^>]*column-gap:\s*24px/i);
    expect(pinned).toMatch(/data-od-slide-flow[^>]*column-fill:\s*balance/i);

    const columnsHtml = [
      '<section class="slide" style="columns:3 12rem;column-width:20rem;column-rule:1px solid #ccc;width:1920px;height:1080px">',
      "<div>a</div><div>b</div>",
      "</section>",
    ].join("");
    const columnsPinned = pinDeckSlidesToFixedCanvas(columnsHtml);
    expect(columnsPinned).toMatch(/data-od-slide-flow[^>]*columns:\s*3 12rem/i);
    expect(columnsPinned).toMatch(/data-od-slide-flow[^>]*column-width:\s*20rem/i);
    expect(columnsPinned).toMatch(/data-od-slide-flow[^>]*column-rule:\s*1px solid #ccc/i);
  });

  it("copies place-* / flex-grow / order / writing-mode into slide flow", () => {
    const html = [
      '<section class="slide" style="display:grid;place-items:center;place-content:stretch;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toMatch(/data-od-slide-flow[^>]*place-items:\s*center/i);
    expect(pinned).toMatch(/data-od-slide-flow[^>]*place-content:\s*stretch/i);

    const flexHtml = [
      '<section class="slide" style="display:flex;flex:1 1 auto;flex-grow:1;flex-basis:200px;order:2;align-self:center;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flexPinned = pinDeckSlidesToFixedCanvas(flexHtml);
    expect(flexPinned).toMatch(/data-od-slide-flow[^>]*flex:\s*1 1 auto/i);
    expect(flexPinned).toMatch(/data-od-slide-flow[^>]*flex-grow:\s*1/i);
    expect(flexPinned).toMatch(/data-od-slide-flow[^>]*flex-basis:\s*200px/i);
    expect(flexPinned).toMatch(/data-od-slide-flow[^>]*order:\s*2/i);
    expect(flexPinned).toMatch(/data-od-slide-flow[^>]*align-self:\s*center/i);

    const writingHtml = [
      '<section class="slide" style="writing-mode:vertical-rl;direction:rtl;width:1920px;height:1080px">',
      "<div>세로</div>",
      "</section>",
    ].join("");
    const writingPinned = pinDeckSlidesToFixedCanvas(writingHtml);
    expect(writingPinned).toMatch(/data-od-slide-flow[^>]*writing-mode:\s*vertical-rl/i);
    expect(writingPinned).toMatch(/data-od-slide-flow[^>]*direction:\s*rtl/i);
  });
});
