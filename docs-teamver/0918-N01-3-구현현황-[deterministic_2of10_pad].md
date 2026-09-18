# 0918-N01-3 구현현황 · deterministic 2-of-10 deck 복구

## 증상

MiniMax BYOK deterministic 템플릿 채우기에서 10장 요청에 2장만 반환하면 최종 저장이 다음 사유로 거절됐다.

```text
terminalPersistResultKind=skipped-incomplete
reason=persist refused 2-of-10 deck without pad
```

## 근본 원인

장수 검증과 복구 목표가 서로 다른 기준을 사용했다.

- 최종 persist 가드는 section 수뿐 아니라 `.slide-1`부터 `.slide-10`까지 남은 kit CSS를 보고 목표를 10장으로 판단했다.
- deterministic JSON slot-fill은 짧은 outline을 그대로 적용할 수 있었다.
- 공식 plugin preview를 읽지 못하고 이미 2장으로 덮인 disk HTML을 fallback seed로 사용하면, pad 로직은 실제 section shell 2개만 목표로 삼았다.
- 결과적으로 복구 함수는 2장을 다시 만들고 persist 가드는 이를 2/10으로 거절했다.

## 변경

1. `applyTemplateCloneSlotFill`은 기본적으로 LOOK seed 장수를 보존한다.
2. `buildTemplateClonedDeckHtml`의 pad 목표는 실제 section shell 수와 kit CSS의 최대 `.slide-N`을 함께 사용한다.
3. persist 직전 `recoverShortDeckByPaddingToSeed`는 추론한 `seedCount`를 `maxSlides`로 명시해, degraded disk seed만 남아 있어도 shell을 재사용하여 목표 장수까지 완성한다.
4. 사용자가 명시한 장수는 계속 우선한다. `maxSlides`가 있으면 seed/CSS 추론값이 이를 덮어쓰지 않는다.
5. Block Frame/Product Launch의 보강 페이지는 더 이상 `Slide 3` 같은 빈 제목을 만들지 않는다. 임의 수치·인물·제품 주장을 만들지 않으면서, 주제별 섹션 제목과 list/cards/process/timeline 판단 문장을 채운다.

## 회귀 검증

- 2-section + 10-layout CSS seed + 2장 JSON outline → 10장 완성
- 동일한 2장 HTML만 disk seed/model 결과로 남은 persist 복구 → 10장 완성
- 보강 슬라이드에 `data-teamver-pad="short-response"` 유지
- 보강 3~10페이지에 주제 문자열과 36자 이상의 실제 본문 존재, `Slide N` 제목 및 잘못된 `Teamver을` 조사 미노출
- template clone fill/outline 테스트 362개 통과
- contracts build 통과

전체 contracts 테스트에서 별도로 보인 문자열 기대값 3건은 기존 prompt 문구 변경과 관련된 선행 실패이며, MiniMax live 1건은 sandbox DNS 차단으로 실행되지 않았다. 이번 변경의 두 재현 테스트와 관련 전체 테스트 파일은 통과했다.
