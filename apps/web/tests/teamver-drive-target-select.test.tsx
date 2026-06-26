// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import { TeamverDriveTargetSelect } from "../src/teamver/components/TeamverDriveTargetSelect";

const targets = [
  {
    id: "personal-root",
    label: "내 드라이브",
    description: "개인 드라이브 루트",
    folderId: "FLD-1",
    sharedDriveId: null,
  },
] as const;

describe("TeamverDriveTargetSelect embed defaults", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses Korean aria-label on the trigger when embed mode and no override", () => {
    render(
      <TeamverDriveTargetSelect
        targets={targets}
        selectedTargetId="personal-root"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("teamver-drive-target-select").getAttribute("aria-label")).toBe(
      "Teamver 드라이브 저장 위치",
    );
  });

  it("opens the listbox when requestFocus is set (loop 411 post-run entry)", async () => {
    render(
      <TeamverDriveTargetSelect
        targets={targets}
        selectedTargetId="personal-root"
        requestFocus
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByTestId("teamver-drive-target-select");
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    });
    expect(screen.getByTestId("teamver-drive-target-popover")).toBeTruthy();
  });
});
