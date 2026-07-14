import { beforeEach, describe, expect, it, vi } from "vitest";
import * as designApiBase from "../src/teamver/designApiBase";
import { shouldInjectOdPersonalMemoryIntoPrompt } from "../src/teamver/odMemoryPromptPolicy";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

describe("Teamver OD memory prompt policy", () => {
  beforeEach(() => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(false);
  });

  it("keeps OD personal memory enabled outside Teamver embed", () => {
    expect(shouldInjectOdPersonalMemoryIntoPrompt()).toBe(true);
  });

  it("disables OD personal memory inside Teamver embed", () => {
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);

    expect(shouldInjectOdPersonalMemoryIntoPrompt()).toBe(false);
  });
});
