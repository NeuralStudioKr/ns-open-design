# Authenticated HTML Preview srcDoc

**판단 시점:** 2026-07-20 현재.

Teamver embed에서는 sandboxed iframe이 BFF/daemon 인증 쿠키를 보내지 못한다. 따라서 plugin preview/example, design-system showcase, live artifact thumbnail 같은 auth-gated HTML을 iframe `src`로 직접 열면 `{"detail":"session_expired"}` JSON이나 401/404 화면이 썸네일처럼 보일 수 있다.

## 적용 원칙

- auth-gated HTML은 부모 React 앱에서 `fetchTeamverDaemon`/registry helper로 먼저 가져온다.
- 응답이 JSON envelope 또는 HTML이 아니면 iframe에 넣지 않고 fallback UI를 보여준다.
- HTML일 때만 `<base href="...">`를 주입한 `srcDoc`으로 sandboxed iframe에 렌더링한다.
- plugin preview/example 상대 asset은 plugin root 기준으로 해석한다.

## 2026-07-20 적용

- `authenticatedHtmlSrcDoc` 공통 helper 추가.
- plugin home HTML card의 preview helper를 공통 helper로 이동하고 cache cap 테스트를 경량화.
- plugin detail preview/example, design-system showcase, live artifact thumbnail이 bare auth-gated `src` 대신 authenticated `srcDoc` 경로를 사용하도록 정리.
- registry fetch helper의 authenticated request 옵션(`credentials: same-origin`) 기대값을 테스트에 반영.

## 검증

- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/runtime/authenticated-html-srcdoc.test.ts tests/components/plugins-home-html-surface.test.tsx`
- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/providers/registry.test.ts`

## 다음 추천 작업

1. staging에서 커뮤니티 HTML 템플릿 카드, plugin detail modal, design-system 카드, 최근 live artifact 썸네일을 각각 열어 JSON/401 thumb이 보이지 않는지 확인한다.
2. CDN/cache 개선을 붙일 때에도 auth-gated 원본 HTML은 parent-fetch 후 sanitized `srcDoc`으로만 iframe에 넣는 원칙을 유지한다.
