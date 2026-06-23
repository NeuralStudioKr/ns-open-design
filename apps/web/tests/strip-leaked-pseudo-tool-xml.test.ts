import { describe, expect, it } from "vitest";

import { stripLeakedPseudoToolXml } from "../src/utils/stripLeakedPseudoToolXml";

describe("stripLeakedPseudoToolXml (web)", () => {
  it("removes function_calls blocks from streamed text", () => {
    const input =
      'Hi\n<function_calls><invoke name="Write"></invoke></function_calls>\nBye';
    expect(stripLeakedPseudoToolXml(input)).toBe("Hi\n\nBye");
  });
});
