import { describe, expect, it } from "vitest";

import { PLUGIN_AUTHORING_PROMPT } from "../src/components/home-hero/plugin-authoring";

describe("plugin authoring brand copy", () => {
  it("does not put Open Design in the user-visible starter line", () => {
    const firstLine = PLUGIN_AUTHORING_PROMPT.split("\n")[0] ?? "";
    expect(firstLine).toBe("Create a reusable plugin for: a reusable workflow described by the user's prompt.");
    expect(firstLine).not.toContain("Open Design");
    expect(firstLine).not.toContain("Teamver Design");
    expect(firstLine).not.toContain("teamver Slide");
  });
});
