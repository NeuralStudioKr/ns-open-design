# Project Design System Picker Lazy Catalog

## 배경

Teamver embed 프로젝트 상세 진입 시 API fan-out을 줄이기 위해 project-file deep link에서는 `/api/design-systems` boot fetch를 지연한다. 이 최적화 이후 input 위 `디자인 시스템 선택` 칩을 열면 catalog가 아직 비어 있어 `디자인 시스템 없음`만 표시될 수 있었다.

이는 프로젝트 결과물에 스타일이 이미 적용되어 있어서가 아니라, picker가 열릴 때 디자인 시스템 catalog를 다시 요청하지 않았기 때문이다. 생성된 HTML 안의 색상·레이아웃 설명과 OD의 저장된 `designSystemId`/catalog 선택지는 별도 상태다.

## 수정

- `DesignSystemPicker`에 `onRequestDesignSystems` lazy hook을 추가했다.
- `ProjectView`는 기존 `onDesignSystemsRefresh`를 picker에 전달한다.
- 상세 화면 boot API는 늘리지 않고, 사용자가 picker를 열었고 catalog가 비어 있을 때만 1회 `/api/design-systems`를 요청한다.

## 검증

- `apps/web`: `pnpm exec vitest run tests/components/DesignSystemPicker.test.tsx` -> 6 passed.

## 다음 확인

- staging에서 프로젝트 상세 URL로 직접 진입 후 `디자인 시스템 선택` 칩을 열어 catalog가 로딩되는지 확인한다.
- 이미 `designSystemId`가 있는 프로젝트에서는 해당 항목이 체크된 상태로 보이는지 확인한다.
