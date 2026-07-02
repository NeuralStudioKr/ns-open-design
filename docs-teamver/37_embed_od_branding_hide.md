# Embed OD Branding Hide

## Background

Teamver embed still exposed Open Design-specific wording in project detail surfaces.

- Composer `+` -> `디자인 도구상자` resource list could show catalog entries such as `Open Design 랜딩 덱`.
- Settings popover displayed `오픈소스 소프트웨어` and `Open Design — Apache License 2.0` too prominently.

## Changes

- Hide design-toolbox skill/plugin resources whose title, id, source, or description contains `Open Design` / `open-design` in Teamver embed.
- Apply the hide rule from the active Teamver branding context, not only from hostname/env embed detection. This prevents project detail flyouts from leaking OD catalog rows when the route is branded but `isTeamverEmbedMode()` is not enough.
- Keep the settings popover compact: show only a short `정보` / `About` entry point.
- Keep detailed Apache/MIT notices in Settings -> About so attribution requirements remain available.

## Verification

- `apps/web`: `pnpm exec vitest run tests/teamver/toolbox-catalog-display.test.ts tests/teamver-embed-slide-only.test.ts tests/teamver/teamver-about-open-source.test.tsx` -> 18 passed.

## Staging Check

- Project detail -> composer `+` -> `디자인 도구상자`: `Open Design 랜딩 덱` should not appear.
- Settings popover: `Open Design` / `Apache License 2.0` should not be directly visible; they should appear only after opening About/license details.
