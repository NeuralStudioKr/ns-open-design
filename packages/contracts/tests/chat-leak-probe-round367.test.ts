import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 367 (FOO slash keep Step)", () => {
  it("still drops slash chrome without eating Step labels", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 / XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1 / Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 / XYZ\n유지", {
        stripCodeFences: true,
      }),
    ).toBe("유지");
  });
});
