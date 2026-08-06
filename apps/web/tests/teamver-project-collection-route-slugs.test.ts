import { describe, expect, it } from "vitest";

import {
  isTeamverProjectCollectionRouteSlug,
  TEAMVER_PROJECT_COLLECTION_ROUTE_SLUGS,
} from "../src/teamver/teamverProjectCollectionRouteSlugs";

describe("teamverProjectCollectionRouteSlugs", () => {
  it("lists daemon collection route slugs", () => {
    expect(TEAMVER_PROJECT_COLLECTION_ROUTE_SLUGS).toEqual([
      "recent",
      "cover-hints",
      "preview-url-batch",
      "cover-html-batch",
    ]);
  });

  it("detects collection slugs case-insensitively", () => {
    expect(isTeamverProjectCollectionRouteSlug("recent")).toBe(true);
    expect(isTeamverProjectCollectionRouteSlug("RECENT")).toBe(true);
    expect(isTeamverProjectCollectionRouteSlug("cover-hints")).toBe(true);
    expect(isTeamverProjectCollectionRouteSlug("preview-url-batch")).toBe(true);
    expect(isTeamverProjectCollectionRouteSlug("cover-html-batch")).toBe(true);
    expect(isTeamverProjectCollectionRouteSlug("proj-uuid-1")).toBe(false);
    expect(isTeamverProjectCollectionRouteSlug("")).toBe(false);
  });
});
