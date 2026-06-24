import { beforeEach, describe, expect, it, vi } from "vitest";

const isEmbedMock = vi.fn(() => false);

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: () => isEmbedMock(),
}));

import { embedUiLabel } from "../src/teamver/embedUiLabels";

describe("embedUiLabel", () => {
  beforeEach(() => {
    isEmbedMock.mockReset();
  });

  it("returns English outside embed", () => {
    isEmbedMock.mockReturnValue(false);
    expect(embedUiLabel("Download", "다운로드")).toBe("Download");
  });

  it("returns Korean in embed", () => {
    isEmbedMock.mockReturnValue(true);
    expect(embedUiLabel("Download", "다운로드")).toBe("다운로드");
  });
});
