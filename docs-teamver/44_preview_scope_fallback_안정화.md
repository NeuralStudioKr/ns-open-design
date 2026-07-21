# Preview Scope Fallback 안정화

작성일: 2026-07-20
브랜치: `staging`

## 배경

Teamver Design embed 모드에서 HTML 미리보기는 `/api/projects/{id}/preview-url`로 sandbox iframe용 preview scope prefix를 먼저 확인한다. 이 API가 일시적으로 비정상 응답, HTML redirect, 네트워크 예외를 반환하면 기존에는 prefix 파싱 중 예외가 발생하거나 파일 미리보기 전체를 실패 상태로 전환할 수 있었다.

## 이번 변경

- `teamverProjectPreviewScope`에서 preview-url fetch 예외를 `null` fallback으로 처리한다.
- preview-url 응답이 JSON이 아니거나 `url` 필드가 누락된 경우에도 throw하지 않고 `null`을 반환한다.
- `FileViewer`는 preview scope prefix를 못 받았다는 이유만으로 `sourceLoadFailed` / unavailable 문구를 켜지 않는다. URL iframe 최적화가 불가능한 경우에도 raw/srcDoc 미리보기 경로로 계속 내려갈 수 있게 한다.
- 단위 테스트에 malformed JSON shape, non-JSON 응답, fetch reject 케이스를 추가했다.

## 검증

- 통과: `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/teamver/teamverProjectPreviewScope.test.ts`

## 다음 추천 작업

1. `FileViewer.manual-edit` 테스트 fixture를 현재 `fetchTeamverDaemon` 요청 옵션과 보조 호출(`/teamver-bff/auth/session`, `/deployments`, `/preview-url`)에 맞게 갱신한다.
2. preview scope prefix 발급 실패 시 srcDoc fallback이 실제 staging 프로젝트 상세 직접 진입에서도 빈 화면 없이 동작하는지 브라우저 smoke를 추가한다.
3. `/preview-url` API 실패율을 staging smoke에 선택 항목으로 노출해 nginx/auth redirect 회귀를 조기에 확인한다.
