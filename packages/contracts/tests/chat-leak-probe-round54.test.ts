import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 54 — HERO/COVER/KPI deck-role suffix chrome + position/aspect-ratio /
 * background flow copy.
 */
describe("chat leak / persist probe round 54 (HERO/KPI suffix · position)", () => {
  it("drops HERO/COVER/AGENDA/SUMMARY deck-role leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("BAZHERO 1 · HERO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXBANNER 1 · BANNER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPCOVER 1 · COVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOINTRO 1 · INTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAROUTRO 1 · OUTRO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZAGENDA 1 · AGENDA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXSUMMARY 1 · SUMMARY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPRECAP 1 · RECAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOCHECKLIST 1 · CHECKLIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARTAKEAWAY 1 · TAKEAWAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZQNA 1 · QNA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXCTA 1 · CTA")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("BAZHERO 1 · HERO\n히어로", {
        stripCodeFences: true,
      }),
    ).toBe("히어로");
  });

  it("drops KPI/TIMELINE/NAV/SECTION leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("ZAPKPI 1 · KPI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOMETRIC 1 · METRIC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARSTATS 1 · STATS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZTIMELINE 1 · TIMELINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXROADMAP 1 · ROADMAP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPPROCESS 1 · PROCESS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOFLOW 1 · FLOW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARNEXT 1 · NEXT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZACTION 1 · ACTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOONAV 1 · NAV")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARHEADER 1 · HEADER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BAZFOOTER 1 · FOOTER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOSECTION 1 · SECTION")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARARTICLE 1 · ARTICLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZAPASIDE 1 · ASIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUXMAIN 1 · MAIN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ZAPKPI 1 · KPI\n지표", {
        stripCodeFences: true,
      }),
    ).toBe("지표");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("BAZHERO 카피를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("BAZHERO 카피를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("ZAPKPI 값을 줄임")).toBe(false);
  });

  // 루프158 갱신 — MiniMax 표지가 통째로 사라지는 회귀 이후 pin은 flow open에
  // `position` / `background*`을 **복사하지 않는다**. pin CSS가 flow의 절대
  // 위치를 관리(`position:absolute; inset:0 !important`)하므로 인라인 position
  // 은 불필요하며, background는 flow overlay가 motif marker를 덮어 사라지게
  // 만드는 원인이었다. 나머지 layout/paint 프로퍼티(inset·z-index·opacity·
  // aspect-ratio·background-size·clip-path·anchor-name·view-transition-name)는
  // 계속 복사된다.
  it("copies non-position/background layout props into slide flow (loop158)", () => {
    const html = [
      '<section class="slide" style="position:relative;inset:0;z-index:2;opacity:0.95;aspect-ratio:16/9;background:linear-gradient(#fff,#eee);background-size:cover;clip-path:inset(0);view-transition-name:slide;anchor-name:--s;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    // Flow open은 `position:*`을 담지 않는다 (pin CSS가 소유).
    expect(flowOpen).not.toMatch(/position\s*:/i);
    // Flow open은 `background`/`background-color`/`background-image`도 담지 않는다.
    // 담기면 flow overlay가 motif marker를 가려 표지가 사라진다 (루프158 회귀).
    expect(flowOpen).not.toMatch(/(?:^|;| |")background\s*:/i);
    expect(flowOpen).not.toMatch(/background-color\s*:/i);
    expect(flowOpen).not.toMatch(/background-image\s*:/i);
    // 나머지 layout/paint 프로퍼티는 그대로 복사되어야 한다.
    expect(flowOpen).toMatch(/inset:\s*0/i);
    expect(flowOpen).toMatch(/z-index:\s*2/i);
    expect(flowOpen).toMatch(/opacity:\s*0\.95/i);
    expect(flowOpen).toMatch(/aspect-ratio:\s*16\/9/i);
    expect(flowOpen).toMatch(/background-size:\s*cover/i);
    expect(flowOpen).toMatch(/clip-path:\s*inset\(0\)/i);
    expect(flowOpen).toMatch(/view-transition-name:\s*slide/i);
    expect(flowOpen).toMatch(/anchor-name:\s*--s/i);
  });
});
