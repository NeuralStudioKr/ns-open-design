import { describe, expect, it } from "vitest";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";

/**
 * Round 6–7 — brace / soft CSS / </pre> / Web Animations / adversarial dialects
 * from staging chat leaks + audit follow-ups (2026-08-24).
 */
const CASE1 = "}";

const CASE2 = `<h 펄스, 흔들기 transition:
background 200ms ease,
transform 300ms
cubic-bezier(.2,.8,.2,1);
}
}</pre>} 요소에 0.1s씩 더하면 스태거 효과API — 표준, 프레임워크 불필요
const box = document.querySelector('.box');
const anim = box.animate(
);
anim.cancel(); // 되감기·중단 가능</pre>Trigger, timeline, morphSVG. 무료 버전으로 90% 커버`;

const ADVERSARIAL_LINES = [
  "will-change transform",
  "filter blur(8px)",
  "transition all 200ms",
  "animation fade 1s infinite",
  "object-fit cover",
  "clip-path circle(50%)",
  "backdrop-filter blur(4px)",
  "z-index 10",
  "left 12px",
  "scale 1.05",
  "translateY 8px",
  "requestAnimationFrame(tick)",
  "document.getElementsByClassName('x')",
  "el.addEventListener('click', fn)",
  "｝",
];

function looksLikeCodeLeak(out: string): boolean {
  return (
    /<\/?pre\b|cubic-bezier|querySelector|\.animate\s*\(|morphSVG|document\.|requestAnimationFrame|will-change|filter blur|getElementsByClassName/i.test(
      out,
    )
    || /(?:^|\n)\s*[}\]\uFF5D]+\s*(?:\n|$)/u.test(out)
    || /<\/?[a-zA-Z][\w:-]*\s+[\uac00-\ud7af]/.test(out)
  );
}

describe("chat leak probe round 6 (user-reported CSS/JS/pre)", () => {
  it("case1 lone brace is empty", () => {
    expect(sanitizeAssistantProseForDisplay(CASE1, { stripCodeFences: true }).trim()).toBe("");
  });

  it("case2 animation dump keeps Hangul prose only", () => {
    const out = sanitizeAssistantProseForDisplay(CASE2, { stripCodeFences: true });
    expect(looksLikeCodeLeak(out)).toBe(false);
    expect(out).toMatch(/요소에/);
    expect(out).not.toMatch(/querySelector|cubic-bezier|morphSVG|<\/pre>/i);
  });

  it("Hangul status before dump survives", () => {
    const out = sanitizeAssistantProseForDisplay(`정리 중.\n${CASE2}`, {
      stripCodeFences: true,
    });
    expect(out.startsWith("정리 중.")).toBe(true);
    expect(looksLikeCodeLeak(out)).toBe(false);
  });
});

describe("chat leak probe round 7 (adversarial soft CSS / JS / unicode)", () => {
  for (const line of ADVERSARIAL_LINES) {
    it(`scrubs line: ${line.slice(0, 40)}`, () => {
      const out = sanitizeAssistantProseForDisplay(`초안.\n${line}\n다음`, {
        stripCodeFences: true,
      });
      expect(out).toContain("초안.");
      expect(out).toContain("다음");
      expect(out).not.toContain(line);
      expect(looksLikeCodeLeak(out)).toBe(false);
    });
  }

  it("same-line Hangul + soft CSS keeps prefix", () => {
    const out = sanitizeAssistantProseForDisplay("초안 background 200ms ease", {
      stripCodeFences: true,
    });
    expect(out).toBe("초안");
  });

  it("same-line Hangul + JS keeps prefix", () => {
    const out = sanitizeAssistantProseForDisplay(
      "펄스 document.querySelector('.box')",
      { stripCodeFences: true },
    );
    expect(out).toBe("펄스");
  });

  it("prose mentioning timing is not wiped (no easing signal alone)", () => {
    const out = sanitizeAssistantProseForDisplay("약 200ms 정도면 충분합니다.", {
      stripCodeFences: true,
    });
    expect(out).toBe("약 200ms 정도면 충분합니다.");
  });

  it("markdown list prose still intact", () => {
    expect(
      sanitizeAssistantProseForDisplay("요약.\n# 다음\n- 차트\n- 표", {
        stripCodeFences: true,
      }),
    ).toBe("요약.\n# 다음\n- 차트\n- 표");
  });
});
