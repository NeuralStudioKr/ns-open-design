import { describe, expect, it } from "vitest";

import {
  readDisplayInitial,
  readUserImageUrl,
  readWorkspaceImageUrl,
  resolveTeamverAssetUrl,
  workspaceNameInitial,
} from "../src/teamver/teamverEmbedVisuals";

describe("teamverEmbedVisuals", () => {
  it("workspaceNameInitial uses first character like Main FE", () => {
    expect(workspaceNameInitial({ name: "김워크스페이스" })).toBe("김");
    expect(workspaceNameInitial({ name: "Acme Design" })).toBe("A");
  });

  it("resolveTeamverAssetUrl keeps absolute URLs", () => {
    expect(resolveTeamverAssetUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("resolveTeamverAssetUrl prefixes relative paths with main origin", () => {
    expect(resolveTeamverAssetUrl("/uploads/profile.png")).toBe(
      "https://teamver.com/uploads/profile.png",
    );
  });

  it("readUserImageUrl reads bootstrap image_url", () => {
    expect(
      readUserImageUrl({
        display_name: "Kim",
        image_url: "https://cdn.example.com/u.png",
      }),
    ).toBe("https://cdn.example.com/u.png");
  });

  it("readWorkspaceImageUrl reads snake_case fields", () => {
    expect(
      readWorkspaceImageUrl({
        name: "Alpha",
        s3_image_url: "https://cdn.example.com/ws.png",
      }),
    ).toBe("https://cdn.example.com/ws.png");
  });

  it("readDisplayInitial matches workspaceNameInitial for names", () => {
    expect(readDisplayInitial("김소연")).toBe("김");
  });
});
