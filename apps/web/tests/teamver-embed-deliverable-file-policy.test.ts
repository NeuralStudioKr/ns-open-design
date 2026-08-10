import { describe, expect, it } from "vitest";

import {
  type DesignFileSection,
  filterEmbedDeliverableProducedFiles,
  isEmbedSupportingProjectFile,
  isTrustedDeckEntryFile,
  listRootHtmlCanvasLeakCleanupTargets,
  listRootHtmlMatchingReferenceSources,
  partitionEmbedDesignFileSections,
  projectHasCanonicalDeckDeliverable,
  resolveCanonicalDeckEntryPath,
  shouldDeclineEmbedAutoOpen,
  shouldMinimizeEmbedLiveToolCode,
} from "../src/teamver/branding/embedDeliverableFilePolicy";
import {
  cleanupRootHtmlReferenceLeaks,
  deleteRootHtmlReferenceLeakIfPresent,
} from "../src/teamver/branding/cleanupRootHtmlReferenceLeaks";

describe("embedDeliverableFilePolicy", () => {
  it("treats deck stylesheets and sibling scripts as supporting assets", () => {
    expect(isEmbedSupportingProjectFile({ name: "css/deck.css" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "styles.css" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "deck.js" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "refs/drive/canvas.html" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "canvas.html", path: "refs/canvas/canvas.html" })).toBe(true);
    expect(isEmbedSupportingProjectFile({ name: "index.html" })).toBe(false);
    expect(isEmbedSupportingProjectFile({ name: "slide-01.html" })).toBe(false);
  });

  it("hides root HTML that duplicates a refs/ source basename", () => {
    const projectFiles = [
      { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
      { name: "canvas.html" },
      { name: "deck.html" },
    ];
    expect(
      isEmbedSupportingProjectFile({ name: "canvas.html" }, { projectFiles }),
    ).toBe(true);
    expect(
      isEmbedSupportingProjectFile({ name: "deck.html" }, { projectFiles }),
    ).toBe(false);
    expect(
      filterEmbedDeliverableProducedFiles(
        [{ name: "canvas.html" }, { name: "deck.html" }],
        { slideOnlyMvp: true },
        { projectFiles },
      ),
    ).toEqual([{ name: "deck.html" }]);
  });

  it("hides root index.html when refs has the same basename", () => {
    const projectFiles = [
      { name: "refs/drive/index.html", path: "refs/drive/index.html" },
      { name: "index.html" },
      { name: "deck.html" },
    ];
    expect(
      isEmbedSupportingProjectFile({ name: "index.html" }, { projectFiles }),
    ).toBe(true);
    expect(
      isEmbedSupportingProjectFile({ name: "deck.html" }, { projectFiles }),
    ).toBe(false);
  });

  it("keeps root deck.html even when refs also has deck.html", () => {
    const projectFiles = [
      { name: "refs/drive/deck.html", path: "refs/drive/deck.html" },
      { name: "deck.html" },
    ];
    expect(
      isEmbedSupportingProjectFile({ name: "deck.html" }, { projectFiles }),
    ).toBe(false);
  });

  it("partitions root canvas-source leaks into the supporting bucket", () => {
    const sections = [
      ["html", [
        { name: "deck.html", mtime: 4 },
        { name: "canvas.html", mtime: 5 },
      ]],
      ["references", [{ name: "refs/drive/canvas.html", mtime: 3 }]],
    ] satisfies readonly DesignFileSection<string, { name: string; mtime: number }>[];
    const { deliverableSections, supportingFiles } = partitionEmbedDesignFileSections(
      sections,
      { slideOnlyMvp: true },
    );
    expect(deliverableSections).toEqual([["html", [{ name: "deck.html", mtime: 4 }]]]);
    expect(supportingFiles.map((f) => f.name)).toEqual([
      "canvas.html",
      "refs/drive/canvas.html",
    ]);
  });

  it("minimizes live tool code streaming for supporting files in slide-only embed", () => {
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: true }, "css/deck.css"),
    ).toBe(true);
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: true }, "index.html"),
    ).toBe(true);
    expect(
      shouldMinimizeEmbedLiveToolCode({ slideOnlyMvp: false }, "css/deck.css"),
    ).toBe(false);
  });

  it("declines auto-open for supporting files in slide-only embed", () => {
    expect(
      shouldDeclineEmbedAutoOpen({ slideOnlyMvp: true }, { name: "styles.css" }),
    ).toBe(true);
    expect(
      shouldDeclineEmbedAutoOpen({ slideOnlyMvp: true }, { name: "refs/drive/canvas.html" }),
    ).toBe(true);
    expect(
      shouldDeclineEmbedAutoOpen({ slideOnlyMvp: true }, { name: "deck.html" }),
    ).toBe(false);
  });

  it("filters supporting files out of produced-file chips", () => {
    const files = [
      { name: "index.html" },
      { name: "css/deck.css" },
      { name: "refs/drive/canvas.html" },
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
      ["references", [{ name: "refs/drive/canvas.html", mtime: 3 }]],
      ["stylesheet", [{ name: "css/deck.css", mtime: 1 }]],
    ] satisfies readonly DesignFileSection<string, { name: string; mtime: number }>[];
    const { deliverableSections, supportingFiles } = partitionEmbedDesignFileSections(
      sections,
      { slideOnlyMvp: true },
    );
    expect(deliverableSections).toEqual([["html", [{ name: "index.html", mtime: 2 }]]]);
    expect(supportingFiles.map((f) => f.name)).toEqual(["refs/drive/canvas.html", "css/deck.css"]);
  });

  it("lists root HTML leaks that duplicate refs sources", () => {
    const projectFiles = [
      { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
      { name: "canvas.html" },
      { name: "deck.html" },
      { name: "notes.html" },
    ];
    expect(listRootHtmlMatchingReferenceSources(projectFiles)).toEqual(["canvas.html"]);
    expect(projectHasCanonicalDeckDeliverable(projectFiles)).toBe(true);
  });

  it("deletes root Canvas HTML leaks only after a deck deliverable exists", async () => {
    const deleted: string[] = [];
    const files = [
      { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
      { name: "canvas.html" },
      { name: "deck.html" },
    ];
    const cleaned = await cleanupRootHtmlReferenceLeaks({
      projectId: "p1",
      files,
      slideOnlyMvp: true,
      deleteFile: async (_projectId, name) => {
        deleted.push(name);
        return true;
      },
    });
    expect(cleaned).toEqual(["canvas.html"]);
    expect(deleted).toEqual(["canvas.html"]);

    const skipped = await cleanupRootHtmlReferenceLeaks({
      projectId: "p1",
      files: [
        { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
        { name: "canvas.html" },
      ],
      slideOnlyMvp: true,
      deleteFile: async () => true,
    });
    expect(skipped).toEqual([]);
  });

  it("can delete a mid-turn Write leak before deck.html exists", async () => {
    const files = [
      { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
      { name: "canvas.html" },
    ];
    const deleted = await deleteRootHtmlReferenceLeakIfPresent({
      projectId: "p1",
      files,
      slideOnlyMvp: true,
      writtenPath: "canvas.html",
      deleteFile: async () => true,
    });
    expect(deleted).toBe("canvas.html");
    expect(
      await cleanupRootHtmlReferenceLeaks({
        projectId: "p1",
        files,
        slideOnlyMvp: true,
        requireDeckDeliverable: false,
        deleteFile: async () => true,
      }),
    ).toEqual(["canvas.html"]);
  });

  it("resolves trusted deck entry paths and rejects Canvas entry pins", () => {
    expect(isTrustedDeckEntryFile("deck.html")).toBe(true);
    expect(isTrustedDeckEntryFile("slides/deck.html")).toBe(true);
    expect(isTrustedDeckEntryFile("index.html")).toBe(false);
    expect(isTrustedDeckEntryFile("canvas.html")).toBe(false);
    expect(
      resolveCanonicalDeckEntryPath([
        { name: "refs/drive/canvas.html", path: "refs/drive/canvas.html" },
        { name: "canvas.html" },
        { name: "slides/deck.html", path: "slides/deck.html" },
        { name: "deck.html" },
      ]),
    ).toBe("deck.html");
  });

  it("treats root index.html as a Canvas leak cleanup target once a deck exists", () => {
    const projectFiles = [
      { name: "refs/drive/export-abc.html", path: "refs/drive/export-abc.html" },
      { name: "index.html" },
      { name: "deck.html" },
      { name: "notes.html" },
    ];
    expect(listRootHtmlMatchingReferenceSources(projectFiles)).toEqual([]);
    expect(listRootHtmlCanvasLeakCleanupTargets(projectFiles)).toEqual(["index.html"]);
  });
});
