import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 15 — review leftovers from the Caveat/Zilla dump family:
 * style-closer lines (`">본문`), font-stack-only lines, value-token
 * leftovers (`hsla` / `var(--` / `deg,#hex`), and Latin-glued stacks.
 */
describe("chat leak probe round 15 (closer / font-stack / value leftover)", () => {
  it("drops a style-closer line that leaks slide body", () => {
    expect(
      sanitizeAssistantProseForDisplay(`초안.\n">Syft로 CycloneDX/SPDX 생성`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\n">Observability in Depth`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(`초안.\n"> 5px 0`, { stripCodeFences: true }),
    ).toBe("초안.");
  });

  it("drops a font-stack leftover line and Latin-glued Caveat dump", () => {
    expect(
      sanitizeAssistantProseForDisplay(`초안.\n'Zilla Slab',cursive;`, {
        stripCodeFences: true,
      }),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(
        `초안.\nCaveat',cursive;font-size:23px;line-height:1.75;">x`,
        { stripCodeFences: true },
      ),
    ).toBe("초안.");
    expect(
      sanitizeAssistantProseForDisplay(
        `Adding slideCaveat',cursive;font-size:23px;line-height:1.75;">x`,
        { stripCodeFences: true },
      ),
    ).toBe("Adding slide");
  });

  it("cuts Hangul glued to a font stack even without two CSS decls", () => {
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 추가 중Caveat',cursive;">`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 추가 중");
    expect(
      sanitizeAssistantProseForDisplay(
        `슬라이드 추가 중.Caveat',cursive;font-size:23px;line-height:1.75;">x`,
        { stripCodeFences: true },
      ),
    ).toBe("슬라이드 추가 중.");
  });

  it("drops hsla / var(--token) / currentColor / deg gradient leftovers", () => {
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nhsla(20,10%,15%,0.9);padding:28px;transform:rotate(0.6deg);">본문`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\nvar(--ink);padding:28px;transform:rotate(0.6deg);">본문`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\ncurrentColor;padding:28px;transform:rotate(0.6deg);">본문`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
    expect(
      sanitizeAssistantProseForDisplay(
        `진행.\ndeg,#ff9f9f);border:2px solid #2d2a26;padding:8px;">본문`,
        { stripCodeFences: true },
      ),
    ).toBe("진행.");
  });

  it("keeps markdown, streaming prefixes, and Hangul prose that mentions font-size", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음 단계\n- 차트 추가", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n# 다음 단계\n- 차트 추가");
    expect(sanitizeAssistantProseForDisplay("Text <p", { stripCodeFences: true })).toBe(
      "Text <p",
    );
    expect(
      sanitizeAssistantProseForDisplay("슬라이드를 추가 중입니다 font-size 조정이 필요합니다", {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드를 추가 중입니다 font-size 조정이 필요합니다");
  });

  it("keeps a closed question-form", () => {
    const out = sanitizeAssistantProseForDisplay(
      `질문\n<question-form id="discovery">{"questions":[{"id":"1"}]}</question-form>`,
      { stripCodeFences: true },
    );
    expect(out).toContain("<question-form");
    expect(out).toContain("질문");
  });
});
