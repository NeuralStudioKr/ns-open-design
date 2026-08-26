import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 87 (MASK/STROKE generic chrome)", () => {
  it("drops MASK/STROKE/FILL/CLIP track leftovers via generic catch-all", () => {
    for (const line of [
      "FOOMASK 1 · MASK",
      "QUXSTROKE 1 · STROKE",
      "ZAPFILL 1 · FILL",
      "BARCLIP 1 · CLIP",
      "BAZPATH 1 · PATH",
      "FOOMARKER 1 · MARKER",
    ]) {
      expect(looksLikeDeckCodeDebrisLine(line)).toBe(true);
    }
    expect(
      sanitizeAssistantProseForDisplay("FOOMASK 1 · MASK\n마스크 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마스크 완료");
  });
});
