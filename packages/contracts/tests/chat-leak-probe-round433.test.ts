import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 433 (Step keep after new seps)", () => {
  it("keeps mixed-case Step with ascii colon", () => {
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("Step 9: Finish")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⇢ BAR")).toBe(true);
  });
});
