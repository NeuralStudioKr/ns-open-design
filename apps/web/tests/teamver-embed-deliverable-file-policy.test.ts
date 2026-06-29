import { describe, expect, it } from "vitest";

import {
  filterEmbedDeliverableProducedFiles,
  isEmbedSupportingProjectFile,
  partitionEmbedDesignFileSections,
  shouldDeclineEmbedAutoOpen,
  shouldMinimizeEmbedLiveToolCode,
} from "../src/teamver/branding/embedDeliverableFilePolicy";

describe("embedDeliverableFilePolicy", () => {
  it("treats deck stylesheets and sibling scripts as supporting assets", () => {
    expect(isEmbedSupportingProjectFile({ name: "css/deck.css" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "styles.css" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "deck.js" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "index.html" })).toBe(false);
    expect(isEmbedSupportingProjectFile({ name: "slide-01.html" })).toBe(false);
  });

  it("minimizes live tool code streaming for supporting files in slide-only embed", () => {
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: true }, "css/deck.css"),
    ).toBe(true);
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: true }, "index.html"),
    ).toBe(false);
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: false }, "css/deck.css"),
    ).toBe(false);
  });

  it("declines auto-open for supporting files in slide-only embed", () => {
    expect(
      shouldDeclineEmbedAutoOpen({ slideOnlyMvp: true }, { name: "styles.css" }),
    ).toBe(true);
    expect(
      shouldDeclineEmbedAutoOpen({ slideOnlyMvp: true }, { name: "deck.html" }),
    ).toBe(false);
  });

  it("filters supporting files out of produced-file chips", () => {
    const files = [
      { name: "index.html" },
      { name: "css/deck.css" },
      { name: "hero.png" },
    ];
    expect(filterEmbedDeliverableProducedFiles(files, { slideOnlyMvp: true })).toEqual([
      { name: "index.html" },
      { name: "hero.png" },
    ]);
  });

  it("partitions design file sections into deliverable vs supporting buckets", () => {
    const sections = [
      ["html", [{ name: "index.html", mtime: 2 }]],
      ["stylesheet", [{ name: "css/deck.css", mtime: 1 }]],
    ] as const;
    const { deliverableSections, supportingFiles } = partitionEmbedDesignFileSections(
      sections,
      { slideOnlyMvp: true },
    );
    expect(deliverableSections).toEqual([["html", [{ name: "index.html", mtime: 2 }]]]);
    expect(supportingFiles.map((f) => f.name)).toEqual(["css/deck.css"]);
  });
});
