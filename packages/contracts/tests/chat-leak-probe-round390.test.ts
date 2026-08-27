import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 390 (set63 FOO combo)", () => {
  it("scrubs ：» chrome and keeps Step labels", () => {
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 5 ： TOKEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 5 ≫ TOKEN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 2: Details")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 › TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
