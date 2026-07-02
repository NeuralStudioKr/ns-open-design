/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntrySettingsMenu } from "../../src/components/EntrySettingsMenu";
import { SettingsDialog } from "../../src/components/SettingsDialog";
import { I18nProvider } from "../../src/i18n";
import type { AppConfig } from "../../src/types";
import { TeamverBrandingProvider } from "../../src/teamver/branding/TeamverBrandingProvider";
import * as designApiBase from "../../src/teamver/designApiBase";

vi.mock("../../src/analytics/provider", () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => false),
}));

vi.mock("../../src/components/ExportDiagnosticsButton", () => ({
  ExportDiagnosticsRow: () => null,
}));

const baseConfig: AppConfig = {
  mode: "api",
  apiKey: "",
  apiProtocol: "anthropic",
  apiVersion: "",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-5",
  apiProviderBaseUrl: "https://api.anthropic.com",
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
  theme: "system",
};

function renderAboutDialog() {
  const onClose = vi.fn();
  const onPersist = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nProvider initial="ko">
      <TeamverBrandingProvider>
        <SettingsDialog
          initial={baseConfig}
          agents={[]}
          daemonLive
          appVersionInfo={null}
          initialSection="about"
          onPersist={onPersist}
          onPersistComposioKey={vi.fn()}
          onClose={onClose}
          onRefreshAgents={vi.fn()}
        />
      </TeamverBrandingProvider>
    </I18nProvider>,
  );
  return { onClose };
}

describe("Teamver Settings about open source", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
  });

  it("renders Apache and bundled MIT notices in embed about section", () => {
    renderAboutDialog();

    expect(screen.getByTestId("teamver-about-open-source")).toBeTruthy();
    expect(screen.getByText("Open Design")).toBeTruthy();
    expect(screen.getByText("Apache License 2.0")).toBeTruthy();
    expect(screen.getByText("guizang-ppt design template")).toBeTruthy();
    expect(screen.getAllByText("MIT License").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText("Open Design 기반 소프트웨어를 Teamver용으로 수정·통합했습니다."),
    ).toBeTruthy();
    expect(screen.queryByText(/Version details are unavailable/i)).toBeNull();
  });

  it("opens about from embed settings popover when full settings are hidden", () => {
    const onOpenSettings = vi.fn();
    render(
      <I18nProvider initial="en">
        <TeamverBrandingProvider>
          <EntrySettingsMenu
            config={baseConfig}
            onThemeChange={vi.fn()}
            onOpenSettings={onOpenSettings}
          />
        </TeamverBrandingProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("entry-settings-menu-trigger"));
    fireEvent.click(screen.getByTestId("entry-settings-open-about"));

    expect(onOpenSettings).toHaveBeenCalledWith("about");
  });
});
