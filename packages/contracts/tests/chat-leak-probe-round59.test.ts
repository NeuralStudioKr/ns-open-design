import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 59 — DASHBOARD suffix chrome, truncated `prop:` scrub, and
 * text-emphasis/field-sizing flow copy.
 */
describe("chat leak / persist probe round 59 (DASHBOARD · prop: · text-emphasis)", () => {
  it("drops DASHBOARD/STORYBOARD leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOODASHBOARD 1 · DASHBOARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARSTORYBOARD 1 · STORYBOARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZMOODBOARD 1 · MOODBOARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXPLAYBOOK 1 · PLAYBOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPNOTEBOOK 1 · NOTEBOOK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSCOREBOARD 1 · SCOREBOARD")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOODASHBOARD 1 · DASHBOARD\n대시보드", {
        stripCodeFences: true,
      }),
    ).toBe("대시보드");
  });

  it("scrubs truncated CSS prop dumps like text-emphasis:", () => {
    expect(looksLikeDeckCodeDebrisLine("text-emphasis:")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("field-sizing:")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("interpolate-size:")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("완료됨.\ntext-emphasis:", {
        stripCodeFences: true,
      }),
    ).toBe("완료됨.");
    expect(
      sanitizeAssistantProseForDisplay("진행.\nfield-sizing:", {
        stripCodeFences: true,
      }),
    ).toBe("진행.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FOODASHBOARD 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FOODASHBOARD 구성을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("DASHBOARD 값을 줄임")).toBe(false);
  });

  it("copies text-emphasis/field-sizing into slide flow", () => {
    const html = [
      '<section class="slide" style="text-emphasis:filled sesame #c00;text-underline-offset:3px;field-sizing:content;interpolate-size:allow-keywords;reading-flow:flex-visual;ruby-position:under;all:initial;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/text-emphasis:\s*filled sesame #c00/i);
    expect(flowOpen).toMatch(/text-underline-offset:\s*3px/i);
    expect(flowOpen).toMatch(/field-sizing:\s*content/i);
    expect(flowOpen).toMatch(/interpolate-size:\s*allow-keywords/i);
    expect(flowOpen).toMatch(/reading-flow:\s*flex-visual/i);
    expect(flowOpen).toMatch(/ruby-position:\s*under/i);
    expect(flowOpen).toMatch(/all:\s*initial/i);
  });
});
