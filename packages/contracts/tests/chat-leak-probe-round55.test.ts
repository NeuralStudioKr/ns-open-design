import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 55 — BRIEF/PROBLEM/SOLUTION pitch-role suffix chrome + overflow /
 * offset-path / view-timeline flow copy.
 */
describe("chat leak / persist probe round 55 (BRIEF/SOLUTION · overflow/offset)", () => {
  it("drops BRIEF/HOOK/SCREEN/TASK pitch leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOBRIEF 1 · BRIEF")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARHOOK 1 · HOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZSCREEN 1 · SCREEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXTASK 1 · TASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPWORKSHOP 1 · WORKSHOP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOODECK 1 · DECK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARMOTIF 1 · MOTIF")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZGOAL 1 · GOAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXAIM 1 · AIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPTHESIS 1 · THESIS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCLAIM 1 · CLAIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARINSIGHT 1 · INSIGHT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOBRIEF 1 · BRIEF\n브리프", {
        stripCodeFences: true,
      }),
    ).toBe("브리프");
  });

  it("drops PROBLEM/SOLUTION/COMPARE/LAB leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOPROBLEM 1 · PROBLEM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARSOLUTION 1 · SOLUTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZFEATURE 1 · FEATURE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXBENEFIT 1 · BENEFIT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCOMPARE 1 · COMPARE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOVERSUS 1 · VERSUS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARPROS 1 · PROS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZCONS 1 · CONS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXRESOURCES 1 · RESOURCES")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOLAB 1 · LAB")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARDEMO 1 · DEMO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZDRILL 1 · DRILL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXFAQ 1 · FAQ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPHINT 1 · HINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOBEAT 1 · BEAT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPLESSON 1 · LESSON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXNOTE 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPQUOTE 1 · QUOTE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("BARSOLUTION 1 · SOLUTION\n해결", {
        stripCodeFences: true,
      }),
    ).toBe("해결");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOOBRIEF 요약을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOOBRIEF 요약을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("BARSOLUTION 값을 줄임")).toBe(false);
  });

  it("copies overflow/offset-path/view-timeline into slide flow", () => {
    const html = [
      '<section class="slide" style="overflow:auto;overflow-x:auto;overflow-y:scroll;min-height:0;max-width:100%;margin:12px;offset-path:path(\'M0 0\');offset-distance:10%;view-timeline-name:--slide;scroll-timeline-name:--scroll;animation-timeline:--t;timeline-scope:--t;anchor-scope:--a;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/overflow:\s*auto/i);
    expect(flowOpen).toMatch(/overflow-x:\s*auto/i);
    expect(flowOpen).toMatch(/overflow-y:\s*scroll/i);
    expect(flowOpen).toMatch(/min-height:\s*0/i);
    expect(flowOpen).toMatch(/max-width:\s*100%/i);
    expect(flowOpen).toMatch(/margin:\s*12px/i);
    expect(flowOpen).toMatch(/offset-path:\s*path\('M0 0'\)/i);
    expect(flowOpen).toMatch(/offset-distance:\s*10%/i);
    expect(flowOpen).toMatch(/view-timeline-name:\s*--slide/i);
    expect(flowOpen).toMatch(/scroll-timeline-name:\s*--scroll/i);
    expect(flowOpen).toMatch(/animation-timeline:\s*--t/i);
    expect(flowOpen).toMatch(/timeline-scope:\s*--t/i);
    expect(flowOpen).toMatch(/anchor-scope:\s*--a/i);
  });
});
