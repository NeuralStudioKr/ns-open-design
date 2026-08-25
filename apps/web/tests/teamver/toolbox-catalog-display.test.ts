import { describe, expect, it } from "vitest";

import type { InstalledPluginRecord, SkillSummary } from "@open-design/contracts";

import {
  applyTeamverCatalogDisplayText,
  isOpenDesignBrandedToolboxResource,
  isTeamverHiddenPromptScaffoldResourceId,
  shouldHideTeamverToolboxPlugin,
  shouldHideTeamverToolboxSkill,
  teamverToolboxPluginTitle,
} from "../../src/teamver/branding/toolboxCatalogDisplay";

function pluginFixture(
  overrides: Partial<InstalledPluginRecord> & Pick<InstalledPluginRecord, "id">,
): InstalledPluginRecord {
  const { id, ...rest } = overrides;
  return {
    id,
    title: rest.title ?? id,
    version: rest.version ?? "0.1.0",
    source: rest.source ?? "local",
    sourceKind: rest.sourceKind ?? "local",
    trust: rest.trust ?? "official",
    capabilitiesGranted: rest.capabilitiesGranted ?? [],
    fsPath: rest.fsPath ?? `/tmp/${id}`,
    installedAt: rest.installedAt ?? 0,
    updatedAt: rest.updatedAt ?? 0,
    manifest: rest.manifest ?? {
      name: id,
      version: "0.1.0",
      title: rest.title ?? id,
      tags: [],
    },
    ...rest,
  } as InstalledPluginRecord;
}

describe("Teamver toolbox catalog display", () => {
  it("hides Open Design landing catalog entries by id and title", () => {
    expect(
      isOpenDesignBrandedToolboxResource(["Open Design 랜딩 덱"], "example-open-design-landing-deck"),
    ).toBe(true);
    expect(isOpenDesignBrandedToolboxResource(["github:nexu-io/open-design@main/plugins/_official/examples/deck"])).toBe(
      false,
    );
    expect(
      shouldHideTeamverToolboxPlugin(
        pluginFixture({
          id: "example-open-design-landing-deck",
          manifest: {
            name: "example-open-design-landing-deck",
            title: "Open Design Landing Deck",
            title_i18n: { ko: "Open Design 랜딩 덱", en: "Open Design Landing Deck" },
            tags: ["open-design-deck"],
          },
        }),
        "ko",
      ),
    ).toBe(true);
    expect(isOpenDesignBrandedToolboxResource(["Html Ppt Hermes Cyber Terminal"])).toBe(false);
  });

  it("renames Open-Slide labels to teamver Slide without hiding the plugin", () => {
    const record = pluginFixture({
      id: "example-deck-open-slide-canvas",
      manifest: {
        name: "example-deck-open-slide-canvas",
        title: "Open-Slide 1920 Canvas Deck",
        title_i18n: {
          ko: "Open-Slide 1920 캔버스 덱",
          en: "Open-Slide 1920 Canvas Deck",
        },
        tags: ["open-slide", "deck"],
      },
    });

    expect(shouldHideTeamverToolboxPlugin(record, "ko")).toBe(false);
    expect(teamverToolboxPluginTitle("ko", record)).toBe("teamver Slide 1920 캔버스 덱");
    expect(applyTeamverCatalogDisplayText("Open-Slide 1920 Canvas Deck")).toBe(
      "teamver Slide 1920 Canvas Deck",
    );
  });

  it("hides the html-ppt prompt scaffold but keeps visual child templates", () => {
    expect(isTeamverHiddenPromptScaffoldResourceId("example-html-ppt")).toBe(true);
    expect(isTeamverHiddenPromptScaffoldResourceId("html-ppt")).toBe(true);
    expect(
      isTeamverHiddenPromptScaffoldResourceId(
        "github:nexu-io/open-design@main/plugins/_official/examples/html-ppt",
      ),
    ).toBe(true);
    expect(isTeamverHiddenPromptScaffoldResourceId("example-html-ppt-zhangzara-studio")).toBe(
      false,
    );
    expect(isTeamverHiddenPromptScaffoldResourceId("Html Ppt Hermes Cyber Terminal")).toBe(
      false,
    );

    expect(
      shouldHideTeamverToolboxPlugin(
        pluginFixture({
          id: "example-html-ppt",
          title: "Html Ppt",
          manifest: {
            name: "example-html-ppt",
            title: "Html Ppt",
            tags: ["deck", "example"],
          },
        }),
        "ko",
      ),
    ).toBe(true);
    expect(
      shouldHideTeamverToolboxPlugin(
        pluginFixture({
          id: "example-html-ppt-zhangzara-studio",
          title: "Html Ppt Studio",
          manifest: {
            name: "example-html-ppt-zhangzara-studio",
            title: "Html Ppt Studio",
            tags: ["deck"],
          },
        }),
        "ko",
      ),
    ).toBe(false);
    expect(
      shouldHideTeamverToolboxSkill(
        {
          id: "html-ppt",
          name: "html-ppt",
          description: "HTML PPT Studio skill",
          mode: "deck",
          triggers: [],
        } as SkillSummary,
        "ko",
      ),
    ).toBe(true);
  });

  it("hides Open Design skills from the toolbox", () => {
    const skill = {
      id: "open-design-landing",
      name: "open-design-landing",
      description: "Open Design landing page skill",
      mode: "deck",
      triggers: [],
    } as SkillSummary;

    expect(isOpenDesignBrandedToolboxResource([skill.id, skill.name], skill.id)).toBe(true);
  });
});
