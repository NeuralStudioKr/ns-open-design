import { describe, expect, it } from "vitest";

import type {
  AnalyticsEventPayload,
  DriveImportModalClickProps,
  DriveImportModalSurfaceViewProps,
  SurfaceViewProps,
  UiClickProps,
} from "../src/analytics/events.js";

describe("Drive import modal analytics contracts", () => {
  it("accepts surface_view props in the SurfaceViewProps union", () => {
    const props: DriveImportModalSurfaceViewProps = {
      page_name: "chat_panel",
      area: "drive_import_modal",
    };
    const union: SurfaceViewProps = props;
    const event: AnalyticsEventPayload = { event: "surface_view", props: union };
    expect(event.props.area).toBe("drive_import_modal");
  });

  it("accepts ui_click props in the UiClickProps union", () => {
    const props: DriveImportModalClickProps = {
      page_name: "chat_panel",
      area: "drive_import_modal",
      element: "drive_import_pick",
      asset_count: 3,
    };
    const union: UiClickProps = props;
    const event: AnalyticsEventPayload = { event: "ui_click", props: union };
    expect(event.props.element).toBe("drive_import_pick");
    expect(props.asset_count).toBe(3);
  });
});
