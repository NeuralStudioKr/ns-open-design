// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/i18n", () => ({
  useT: () => (key: string) => (key === "common.openPreview" ? "Open preview" : key),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import { TeamverProjectPreviewChip } from "../src/teamver/components/TeamverProjectPreviewChip";

describe("TeamverProjectPreviewChip", () => {
  it("opens project with preview fileName and stops card click propagation", () => {
    const onOpen = vi.fn();
    const cardClick = vi.fn();

    render(
      <div onClick={cardClick}>
        <TeamverProjectPreviewChip projectId="p1" fileName="index.html" onOpen={onOpen} />
      </div>,
    );

    const chip = screen.getByTestId("teamver-preview-chip-p1");
    fireEvent.click(chip);

    expect(onOpen).toHaveBeenCalledWith("p1", { fileName: "index.html" });
    expect(cardClick).not.toHaveBeenCalled();
  });
});
