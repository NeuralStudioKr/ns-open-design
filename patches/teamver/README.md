# Teamver upstream patch series

Open Design upstream 파일에 가하는 **최소 diff**를 `git format-patch` series로 관리합니다.  
Teamver 전용 추가 코드는 **`apps/web/src/teamver/`** (및 `deploy/teamver/`)에 두고, upstream 파일은 patch로만 수정합니다.

## 디렉터리

```text
patches/teamver/
  README.md                 # 본 문서
  UPSTREAM_TOUCHPOINTS.md   # patch 대상 upstream 파일 목록
  series                    # 적용 순서 (추가 patch 시 갱신)
```

## 적용 (upstream rebase 후)

```bash
cd ns-open-design
git am patches/teamver/*.patch
# 또는
git am --3way $(cat patches/teamver/series)
```

충돌 시: 해당 patch에서 Teamver 블록만 유지하고 `git am --continue`.

## 재생성

upstream 버전 bump 후, touchpoint 파일만 수정하고:

```bash
# 예: EntryShell Teamver import/hook 블록만 포함한 patch
git format-patch upstream/main --stdout -- apps/web/src/components/EntryShell.tsx \
  > patches/teamver/0001-entry-shell-teamver-hooks.patch
```

`series` 파일에 patch 파일명을 **적용 순서대로** 한 줄씩 기록합니다.

## patch 대상 vs fork-native

| 구분 | 경로 | 관리 |
|------|------|------|
| Fork-native | `apps/web/src/teamver/**` | git tracked, patch **아님** |
| Fork-native | `deploy/teamver/**` | git tracked |
| Upstream touch | `EntryShell.tsx`, `App.tsx`, `package.json`, … | `patches/teamver/*.patch` |
| Vendor | `vendor/teamver/` | [08](../docs-teamver/08_Teamver_SDK_vendor와_배포.md) |

## 초기 series (TODO — upstream tag 기준 재생성)

| # | 파일 | 설명 |
|---|------|------|
| 0001 | `EntryShell.tsx` | EntryTopbarChips, TeamverBranding, embed 분기 |
| 0002 | `apps/web/package.json` | `@teamver/app-sdk`, preinstall |
| 0003 | `apps/web/src/index.css` | Teamver embed CSS import (있을 경우) |

> **Note:** patch 파일 본문은 upstream SHA에 종속됩니다. 최초 `format-patch`는 release/tag 고정 후 팀에서 1회 생성하세요.

## 검증

```bash
node scripts/check-teamver-vendor.mjs
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/daemon test -- tests/lazy-project-materialization.test.ts
```

Embed smoke: [10 §4.7](../docs-teamver/10_세션·OD패치_보강.md) · `e2e/ui/teamver-embed-external-links.test.ts`
