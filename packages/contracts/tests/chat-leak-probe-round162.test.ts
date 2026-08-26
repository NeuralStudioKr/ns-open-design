import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 162 (FOO slash/colon keep)", () => {
  it("still drops ALLCAPS chrome across separators", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 · XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 : XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 / XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ／ XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ／ XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
  });
});
