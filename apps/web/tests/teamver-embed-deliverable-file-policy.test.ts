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
  resolveFilledDeckPromotion,
  isTemplateCloneLookSeedFile,
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
      { name: "deck.html" },
    ];
    expect(filterEmbedDeliverableProducedFiles(files, { slideOnlyMvp: true })).toEqual([
      { name: "hero.png" },
      { name: "deck.html" },
    ]);
  });

  it("partitions design file sections into deliverable vs supporting buckets", () => {
    const sections = [
      ["html", [
        { name: "index.html", mtime: 2 },
        { name: "deck.html", mtime: 4 },
      ]],
      ["references", [{ name: "refs/drive/canvas.html", mtime: 3 }]],
      ["stylesheet", [{ name: "css/deck.css", mtime: 1 }]],
    ] satisfies readonly DesignFileSection<string, { name: string; mtime: number }>[];
    const { deliverableSections, supportingFiles } = partitionEmbedDesignFileSections(
      sections,
      { slideOnlyMvp: true },
    );
    expect(deliverableSections).toEqual([["html", [{ name: "deck.html", mtime: 4 }]]]);
    expect(supportingFiles.map((f) => f.name)).toEqual([
      "refs/drive/canvas.html",
      "index.html",
      "css/deck.css",
    ]);
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

  it("prefers a filled deck sibling over Clone LOOK seed deck.html", () => {
    expect(
      resolveCanonicalDeckEntryPath([
        {
          name: "deck.html",
          artifactManifest: { metadata: { templateClonedDeckSeeded: true } },
        },
        {
          name: "deck-2.html",
          mtime: 2,
          artifactManifest: { metadata: { templateCloneContentFilled: true } },
        },
      ]),
    ).toBe("deck-2.html");
    expect(
      resolveFilledDeckPromotion({
        files: [
          {
            name: "deck.html",
            artifactManifest: { metadata: { templateClonedDeckSeeded: true } },
          },
          { name: "deck-2.html", mtime: 2 },
        ],
        preferredPath: "deck-2.html",
      }),
    ).toEqual({ entryPath: "deck.html", copyFrom: "deck-2.html" });
    expect(
      isTemplateCloneLookSeedFile({
        artifactManifest: {
          metadata: { templateClonedDeckSeeded: true, templateCloneContentFilled: true },
        },
      }),
    ).toBe(false);
  });

  it("treats Canvas-shaped root HTML as leak cleanup targets but keeps user notes", () => {
    const projectFiles = [
      { name: "refs/drive/export-abc.html", path: "refs/drive/export-abc.html" },
      { name: "index.html" },
      { name: "export.html" },
      { name: "canvas-copy.html" },
      { name: "deck.html" },
      { name: "notes.html" },
    ];
    expect(listRootHtmlMatchingReferenceSources(projectFiles)).toEqual([]);
    expect(listRootHtmlCanvasLeakCleanupTargets(projectFiles).sort()).toEqual([
      "canvas-copy.html",
      "export.html",
      "index.html",
    ]);
  });

  it("hides root non-deck HTML from deliverables when refs HTML is present", () => {
    const projectFiles = [
      { name: "refs/drive/canvas-rev-9.html", path: "refs/drive/canvas-rev-9.html" },
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
});
