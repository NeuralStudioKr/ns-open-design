# Hosted AI buffered stream 기획·설계

**작성일:** 2026-10-14
**상태:** 설계 검토 완료, 미구현
**대상:** staging 전용 `/api/proxy/chat/stream`의 complete deck/JSON 실행
**관련 문서:** [62 provider 비노출](./62_hosted_AI_provider_비노출_기획설계.md) · [54-1 MiniMax 개발설계](./54-1_MiniMax_전환_개발설계.md) · [29 BYOK API mode](./29_BYOK_api_mode_vs_runs_아키텍처.md)

> 이 문서는 구현 전 기획·설계 SSOT다. 이 문서 작성으로 동작하는 코드, env 기본값, staging route는 변경하지 않는다.

---

## 0. 결론

현재 complete deck/JSON 요청은 upstream에 `stream: false`를 보내는 atomic 경로다. browser SSE는 먼저 `start`를 보내지만 전체 upstream 응답이 끝날 때까지 본문 이벤트가 없어 `: keepalive`만 반복된다. 연결은 살아 있어도 사용자와 운영자는 생성 중인지 정지했는지 구분할 수 없고, client content-idle watchdog도 실제 upstream 활동을 알 수 없다.

최종 권고안은 **upstream streamed collection + daemon atomic publication**이다.

```text
Browser                  Daemon                         Private upstream
   | POST /chat/stream      |                                  |
   |----------------------->|                                  |
   | event:start            | POST stream:true                 |
   |<-----------------------|--------------------------------->|
   | event:progress         |<----- non-empty chunk -----------|
   |<-----------------------|  buffer only; no raw HTML publish|
   | event:progress         |<----- non-empty chunk -----------|
   |<-----------------------|                                  |
   |                        | validate complete artifact        |
   | event:delta (chunked)  |                                  |
   | event:usage            |                                  |
   | event:end              |                                  |
   |<-----------------------|                                  |
```

핵심은 raw token 실시간 공개가 아니다. upstream은 스트리밍해 활동과 중단을 관측하고, browser에는 provider-neutral progress만 보낸다. 완성 검증을 통과한 결과만 최종 delta로 공개한다.

이 방식은 다음을 동시에 만족한다.

- keepalive-only 무응답 체감 제거
- incomplete deck/JSON 비노출
- 실제 content activity 기반 idle 판정
- continuation 결과 중복 결합 방지
- provider/model 비노출 유지
- 기존 atomic 경로와 legacy endpoint의 즉시 롤백 가능

---

## 1. 문제 정의와 RCA

### 1.1 사용자 관측

```text
event: start
data: {}

: keepalive

: keepalive
```

`start`는 daemon SSE가 열렸다는 뜻일 뿐 upstream 첫 토큰을 받았다는 뜻이 아니다. keepalive는 reverse proxy 연결 유지용 comment이며 생성 진행 신호가 아니다.

### 1.2 현재 코드 동작

complete deck 또는 JSON outline 요청은 web이 다음 힌트를 보낸다.

```json
{
  "expectCompleteDeckArtifact": true
}
```

daemon은 특정 hosted provider 실행에서 이를 atomic 응답으로 바꾼다.

```text
expectCompleteDeckArtifact / expectCompleteJsonOutline
  -> upstream payload stream:false
  -> response.json()이 끝날 때까지 provider content 관측 불가
  -> browser에는 start + keepalive만 존재
  -> 완료 후 전체 artifact 한 번 공개 또는 error
```

### 1.3 근본 문제

atomic **검증**과 upstream **전송 방식**이 하나로 묶였다. 완성본만 공개해야 한다는 요구는 타당하지만 upstream까지 non-stream으로 만들 필요는 없다.

추가 위험은 다음과 같다.

- upstream 응답 헤더/본문이 늦으면 server가 실제 진행을 알 수 없다.
- keepalive는 FE idle을 갱신하지 않으므로 긴 정상 생성도 stall로 오인될 수 있다.
- 반대로 server-side total deadline이 없으면 연결만 살아 있는 무기한 대기가 가능하다.
- 사용자 Stop 전까지 생성/정지 상태를 구분할 운영 신호가 없다.
- 오류 전에 provider가 상당한 출력을 생성했어도 FE는 첫 토큰 전 실패로 오인해 새 요청을 자동 재시도할 수 있다.

---

## 2. 목표와 비목표

### 2.1 목표

1. 실제 upstream content activity를 daemon이 즉시 관측한다.
2. browser는 생성 중임을 provider-neutral progress로 확인한다.
3. 완성 검증 전 deck/JSON 원문은 browser, chat, preview, persist에 전달하지 않는다.
4. 불완전 응답 복구는 같은 daemon request 내부에서 제한적으로 수행한다.
5. 오류 후 FE가 같은 작업을 무분별하게 중복 생성하지 않는다.
6. 기존 `/api/proxy/minimax/stream`, atomic hosted 구현, production 기본 동작을 변경하지 않는 opt-in rollout을 제공한다.
7. Stop, auth, materialization, tool loop, usage 순서, provider 비노출 계약을 유지한다.

### 2.2 비목표

- 모델 token을 생성 즉시 채팅이나 preview에 표시하지 않는다.
- deck을 slide 단위로 조기 persist하지 않는다.
- WebSocket, 별도 job queue, polling API로 전체 transport를 교체하지 않는다.
- 이 변경에서 모델 prompt, slide layout, template quality 정책을 수정하지 않는다.
- legacy provider endpoint의 공개 계약을 변경하지 않는다.

---

## 3. 대안 검토

| 방안 | 장점 | 문제 | 판단 |
|---|---|---|---|
| 현행 `stream:false` atomic 유지 | 완성 전 원문 비노출, 구현 단순 | keepalive-only, activity/idle 관측 불가, 긴 무응답 | 기각 |
| raw upstream delta를 그대로 browser에 전달 | 즉시 보임, first-token 측정 쉬움 | partial deck 노출, continuation 중복, preview/persist 오염 위험 | 기각 |
| upstream stream + daemon buffer + progress + atomic final delta | 완성본 보호와 진행 관측을 모두 달성 | daemon 메모리와 상태 머신 필요 | **채택** |
| async job + polling | 장시간 작업과 재접속에 강함 | API/DB/job lifecycle migration 범위가 큼 | 중기 후보 |
| WebSocket 전환 | 양방향 상태 전달 | SSE로 충분하며 운영 복잡도만 증가 | 기각 |

채택안은 현재 구조에서 가장 작은 변화는 아니지만, 현행 atomic 보호를 약화하지 않으면서 무응답과 timeout 판단을 해결하는 유일한 직접 해법이다.

---

## 4. 공개 SSE 계약

### 4.1 이벤트

```text
event: start
data: {}

event: progress
data: {"phase":"generating","activity":"content"}

event: progress
data: {"phase":"validating"}

event: progress
data: {"phase":"repairing","attempt":1}

event: delta
data: {"delta":"<validated artifact chunk>"}

event: usage
data: {"input_tokens":1234,"output_tokens":5678}

event: end
data: {}
```

허용 phase:

- `connecting`: upstream 요청 시작
- `generating`: non-empty upstream content 수신
- `tool`: 승인된 daemon tool 실행
- `validating`: 완성성/형식 검증
- `repairing`: 같은 request 안의 continuation 또는 full rewrite
- `publishing`: 검증된 final delta 전송

### 4.2 progress 규칙

- progress는 assistant text가 아니다.
- DB message content/events와 chat history에 persist하지 않는다.
- 채팅 bubble을 새로 만들지 않는다.
- UI가 표시하더라도 기존 assistant 실행 행의 ephemeral phase만 바꾼다.
- `thinking_delta`를 progress 용도로 재사용하지 않는다.
- provider/model/base URL, raw token, upstream request id를 포함하지 않는다.
- `activity:"content"`는 non-whitespace upstream content를 실제로 받은 경우에만 보낸다.
- 동일 phase progress는 최대 3초에 한 번으로 제한한다.
- `: keepalive`는 progress가 아니며 content-idle 시간을 갱신하지 않는다.

### 4.3 final delta 규칙

- complete artifact/JSON 검증이 성공하기 전에는 delta를 0개 유지한다.
- 검증 성공 후 전체 결과를 UTF-8 기준 최대 48 KiB raw payload로 나눈다. JSON escaping과 SSE envelope를 포함한 실제 frame은 64 KiB 미만이어야 한다.
- 여러 delta는 하나의 이미 검증된 결과를 transport chunking한 것이며 부분 결과 의미가 아니다.
- usage는 마지막 delta 뒤, end 앞에 보낸다.
- error가 전송된 뒤 delta/end를 보내지 않는다.

progress는 additive event다. 이를 모르는 구 client는 무시할 수 있어야 한다. 다만 신규 buffered mode는 compatible web version과 함께 staging에서만 활성화한다.

---

## 5. daemon 상태 머신

```text
INIT
  -> CONNECTING
  -> STREAMING
       -> TOOL_RUNNING -> STREAMING
       -> VALIDATING
            -> FINAL_PUBLISH -> END
            -> REPAIRING -> STREAMING/VALIDATING
            -> ERROR
  -> ABORTED
  -> ERROR
```

### 5.1 STREAMING

- upstream 요청은 `stream:true`다.
- role-marker, thinking tag, provider error, usage parser는 기존 공통 로직을 사용한다.
- visible text는 daemon의 bounded chunk buffer에만 쌓는다.
- non-empty content를 받을 때 progress를 throttle해 전송한다.
- tool-call turn은 artifact 완성 검사 대상이 아니다. tool result 이후 최종 model turn에만 complete gate를 적용한다.

### 5.2 VALIDATING

deck은 다음을 모두 만족해야 한다.

- 허용된 artifact type
- 닫힌 `</artifact>`
- deck이면 닫힌 HTML 문서와 실제 slide section 존재
- configured maximum bytes 이하

JSON outline은 다음을 모두 만족해야 한다.

- 닫힌 JSON object
- `slides[]` 존재
- host slot-fill parser가 읽을 수 있는 schema

transport daemon은 요청한 slide count의 의미를 새로 해석하지 않는다. exact/minimum count와 본문 밀도는 기존 host slot-fill/persist quality gate가 계속 소유한다. transport가 담당하는 것은 닫히고 파싱 가능한 outline을 원자적으로 전달하는 일까지다. 이 경계를 넘으면 web과 daemon의 count 정책이 drift한다.

### 5.3 REPAIRING

- 첫 결과가 불완전할 때 daemon 내부 continuation을 최대 2회 허용한다.
- 1차는 partial assistant text를 이어 쓰는 continuation이다.
- 2차는 partial text를 제외한 full rewrite다.
- 각 repair도 streamed collection + daemon buffer를 사용한다.
- merge 후 전체 결과를 다시 검증한다.
- browser에는 partial/repair raw text를 보내지 않는다.
- repair 횟수는 내부 metric과 중립 progress의 `attempt`에만 남긴다.

### 5.4 FINAL_PUBLISH

- 검증된 문자열의 immutable snapshot을 만든 뒤 delta chunking을 시작한다.
- publish가 시작된 뒤에는 다른 repair 결과로 교체하지 않는다.
- 명시적 Stop/upstream-cancel 신호는 남은 전송과 upstream을 취소한다.
- 단순 tab 이탈이나 일시적인 browser disconnect는 기존 background drain/materialization 정책을 유지한다. 신규 collector가 독자적인 cancel 정책을 만들지 않는다.
- onDone/persist는 final bytes가 모두 도착한 뒤에만 실행한다.

---

## 6. timeout과 자원 한계

초기 권고 기본값은 아래와 같다. staging 관측 후 env 범위를 조정하되 무제한 값은 허용하지 않는다.

| 제한 | 기본값 | 의미 |
|---|---:|---|
| upstream connect | 30초 | 요청 후 response header/stream 확보 |
| first content | 360초 | 기존 deck FE idle 예산을 보존한 첫 non-whitespace provider content |
| content idle | 360초 | 기존 deck FE idle 예산을 보존한 실제 content 공백 |
| rich head idle | 180초 | style/head 생성 구간의 예외 상한 |
| repair attempt | 360초 | continuation 1회 상한; 초기 canary에서 기존 deck idle 예산 보존 |
| total request | 840초 | tool/repair 포함 전체 상한; 15분 abort registry 누수 상한 미만 |
| repair count | 2회 | continuation + full rewrite |
| buffered output | 8 MiB | request당 text buffer hard cap |

원칙:

- keepalive와 단순 TCP activity는 timeout을 갱신하지 않는다.
- progress `activity:"content"`는 daemon이 실제 content를 받은 증거이므로 FE content-idle을 갱신한다.
- whitespace-only, usage-only, provider heartbeat는 content activity로 보지 않는다.
- total timeout은 다른 모든 활동과 무관하게 강제한다.
- timeout/overflow 시 AbortController로 upstream을 취소하고 provider-neutral error를 보낸다.
- env 값은 최소/최대 clamp와 숫자 검증을 거친다.
- 초기 canary에서는 현재 web의 deck 360초/head 180초 idle 예산보다 짧게 설정하지 않는다. 실제 p95/p99 gap이 확인된 후에만 별도 변경으로 축소한다.

버퍼는 문자열을 매 delta마다 재결합하지 않고 chunk array로 유지한다. byte 제한은 JavaScript 문자열 길이가 아니라 UTF-8 byte 수로 계산한다. validation snapshot, continuation merge, final publish snapshot이 동시에 살아 최대 약 3배 복사를 만들 수 있으므로 request당 resident target은 24 MiB 이하로 둔다. workspace 동시 stream cap이 8이면 최악 192 MiB와 parser/tool overhead를 pod memory budget에 포함해야 한다. 새 snapshot이 확정되면 이전 repair buffer는 즉시 참조 해제한다.

---

## 7. FE 동작과 재시도 책임

### 7.1 parser

FE는 progress를 다음처럼 처리한다.

- assistant content accumulator에 추가하지 않는다.
- `receivedSubstantiveDelta`로 세지 않는다.
- `activity:"content"`이면 content-idle 기준 시각만 갱신한다.
- ephemeral run phase만 갱신한다.
- message persist payload에는 넣지 않는다.

현재 parser의 `isProxySseContentActivityFrame()`은 event 종류를 구분하지 않고 모든 SSE event를 content activity로 취급한다. 그 상태에서 progress를 먼저 송신하면 `connecting`/`validating`만으로 idle timeout을 무한히 연장할 수 있다. 따라서 web parser 배포는 daemon flag 활성화의 **필수 선행 조건**이며, 판정은 다음으로 분리한다.

```text
delta / thinking_delta                 -> content activity
progress { activity: "content" }       -> content activity
progress without content activity      -> UI phase only
usage / start / end / keepalive         -> content activity 아님
```

### 7.2 자동 재시도

daemon buffered mode가 불완전 artifact repair를 소유한다. FE가 같은 run을 다시 생성하면 비용과 결과가 중복될 수 있다.

- content activity 전 네트워크 실패: 기존 제한된 soft retry 허용
- content activity 후 daemon error: FE 자동 재호출 금지, 사용자 retry/resume 제공
- daemon이 `retryable:false`를 보내면 자동/수동 retry 정책에서 제외
- route 404: 기존 hosted route missing fallback만 유지
- 404가 아닌 runtime error에서 legacy endpoint로 자동 fallback하지 않음

`progress`를 받은 사실만으로 assistant prose를 만들거나 “AI가 내용을 구성 중” 메시지를 반복 추가하지 않는다.

---

## 8. 기존 동작 비영향 설계

### 8.1 코드 경계

신규 수집기는 별도 모듈로 둔다.

```text
apps/daemon/src/hosted-managed-buffered-stream.ts
  collectHostedBufferedStream()
  validate/repair/final publish orchestration

apps/daemon/src/chat-routes.ts
  flag OFF -> 기존 atomic handler
  flag ON + hosted route -> 신규 collector
```

공통 parser/guard는 호출하되 기존 함수의 기본 동작을 변경하지 않는다. legacy route가 신규 모듈을 import하더라도 실행 분기는 절대 진입하지 않아야 한다.

### 8.2 rollout flag

```env
TEAMVER_HOSTED_CHAT_BUFFERED_STREAM_ENABLED=0
```

- 기본값, base compose, production은 `0`이다.
- `TEAMVER_HOSTED_CHAT_API_ENABLED=1`인 hosted generic route에서만 의미가 있다.
- legacy `/api/proxy/minimax/stream`에는 적용하지 않는다.
- web은 unknown progress를 안전하게 무시하는 parser를 먼저 배포한다.
- staging daemon에서만 flag를 켜 canary한다.

### 8.3 즉시 롤백

1. daemon flag를 `0`으로 바꾸고 재시작한다.
2. 같은 `/api/proxy/chat/stream`은 기존 atomic implementation으로 돌아간다.
3. web 재빌드는 필요하지 않다.
4. 별도 DB schema/file migration이 없으므로 data rollback도 없다.
5. 필요하면 기존 `TEAMVER_HOSTED_CHAT_API_ENABLED=0`으로 generic route 자체를 끄고 404 fallback을 사용한다.

runtime 중 신규 mode 오류를 감지해 같은 요청을 atomic mode로 자동 재실행하지 않는다. 이미 upstream 비용이 발생했을 수 있고 이중 생성이 더 위험하다. rollback은 다음 요청부터 명시적으로 적용한다.

---

## 9. 보안·비노출 검토

- progress phase는 제품 중립 vocabulary만 사용한다.
- `provider`, `model`, `baseUrl`, upstream request id를 공개하지 않는다.
- progress 간격과 received byte count를 공개하지 않아 불필요한 fingerprint를 줄인다.
- upstream 원문 오류는 server log에만 남기고 public stable code로 변환한다.
- buffered raw artifact를 debug SSE/details에 넣지 않는다.
- role-marker/prose guard를 buffer 입력 단계에서 적용한다.
- client routing override 금지는 62번 문서 계약을 그대로 유지한다.
- abort/materialization identity는 기존 auth 경계를 우회하지 않는다.

progress는 보안 경계가 아니라 관측 신호다. API key/권한/SSRF 검증은 기존 강제 정책을 계속 적용한다.

---

## 10. 실패 모드 검토

| 실패 | 기대 동작 | 금지 동작 |
|---|---|---|
| upstream 연결 지연 | connect/first-content timeout 후 중립 error | keepalive 무기한 반복 |
| 중간 stream 종료 | 내부 repair 최대 2회 | partial delta 공개 |
| repair도 불완전 | usage 후 error, seed/prior 보존 | 불완전 덱 persist |
| output cap 초과 | upstream abort + 중립 error | 메모리 무제한 증가 |
| 명시적 client Stop | upstream/repair 즉시 abort | background 중복 생성 |
| tab 이탈/수동 disconnect | 기존 background drain 정책 유지 | 신규 collector가 임의로 abort 정책 변경 |
| tool call 후 final 생성 | tool 결과 뒤 complete gate 적용 | tool turn을 불완전 deck으로 오판 |
| progress만 있고 content 없음 | content idle 갱신 안 함 | 가짜 progress로 timeout 회피 |
| final publish 중 disconnect | 전송 중단, persist lifecycle 정책 준수 | 새 provider 요청 자동 시작 |
| 404 | 기존 legacy route fallback 1회 | 모든 5xx에서 provider route fallback |
| usage 후 error | usage를 먼저 정산, error로 종료 | end 성공 처리 |

---

## 11. 관측성과 성공 기준

server-only metric:

- `hosted_chat_time_to_upstream_headers_ms`
- `hosted_chat_time_to_first_content_ms`
- `hosted_chat_content_idle_ms`
- `hosted_chat_total_ms`
- `hosted_chat_buffer_peak_bytes`
- `hosted_chat_repair_attempts`
- `hosted_chat_terminal_kind`
- 실제 provider/model dimension은 내부 metric에만 포함

공개/제품 metric:

- start 후 첫 progress 시간
- keepalive-only 60초 초과 비율
- complete artifact 성공률
- user retry 클릭률
- 자동 중복 요청률
- 8~10장 요청 충족률

staging 합격 기준:

1. start 후 실제 upstream content가 오면 5초 이내 progress가 관측된다.
2. incomplete raw artifact는 Network delta와 chat/preview에 0바이트 노출된다.
3. complete artifact만 delta/end로 전달된다.
4. 기존 atomic 대비 성공률이 하락하지 않는다.
5. 동일 사용자 요청에 대한 upstream 호출 수가 의도한 repair 상한을 넘지 않는다.
6. provider disclosure scan을 통과한다.
7. flag OFF에서 기존 fixture의 request body/SSE 결과가 byte-equivalent다.

---

## 12. 테스트 계획

### 12.1 daemon 단위·통합

- `stream:true`가 hosted buffered mode에만 적용된다.
- flag OFF는 기존 `stream:false` atomic body를 유지한다.
- legacy provider route는 flag와 무관하다.
- raw upstream delta가 final validation 전에 public delta로 나오지 않는다.
- real content chunk가 progress를 만들고 heartbeat/whitespace는 만들지 않는다.
- progress throttle이 동작한다.
- complete deck/JSON은 검증 후 UTF-8 safe chunked delta + usage + end 순서다.
- slide count/본문 밀도 판정은 기존 host quality gate에 남고 transport에서 중복 구현되지 않는다.
- truncated deck은 continuation 후 한 번만 최종 publish된다.
- repair 실패는 partial delta 없이 error로 끝난다.
- tool-call turn은 complete gate를 건너뛴다.
- connect/first-content/idle/total/size/abort 각 경계를 fake timer로 검증한다.
- public SSE에 provider 문자열과 actual model이 없다.

### 12.2 web

- progress는 content/chat event에 추가되지 않는다.
- content activity progress만 idle timer를 갱신한다.
- progress 이후 error는 blind soft retry하지 않는다.
- final multi-delta가 하나의 artifact로 조립된다.
- route 404 fallback은 기존대로 한 번만 동작한다.
- 5xx/timeout은 legacy endpoint로 자동 fallback하지 않는다.

### 12.3 staging E2E

- 일반 생성, official-rich, JSON slot-fill, URL web_fetch, 20장 요청을 각각 실행한다.
- DevTools SSE에서 start/progress/final delta/usage/end 순서를 확인한다.
- Stop, 네트워크 끊김, upstream 지연, truncated fixture를 강제로 재현한다.
- slide count, template motif, layout 다양성, content density는 transport 변경 전후 snapshot으로 비교한다.

---

## 13. 구현 순서

1. 본 문서와 contract fixture를 먼저 반영한다. 코드 동작은 바꾸지 않는다.
2. progress SSE parser와 content-activity 판정을 web에 additive하게 추가하되 chat bubble/persist에는 연결하지 않는다.
3. daemon 별도 collector와 fake upstream 테스트를 구현한다. route flag는 계속 OFF다.
4. hosted generic route에만 flag 분기를 연결한다.
5. staging 단일 workspace canary에서 flag를 켠다.
6. timeout/repair/latency metric을 확인하고 staging 전체로 확대한다.
7. 충분한 관측 기간 후에만 기존 atomic implementation 제거 여부를 별도 결정한다.

각 단계는 독립 커밋으로 유지한다. collector 구현, route wiring, staging env 활성화를 한 커밋에 섞지 않는다.

2단계 web이 배포되지 않은 환경에서 5단계 flag를 켜지 않는다. 호환 배포 순서는 `web parser -> daemon code(flag OFF) -> staging flag ON`으로 고정한다.

---

## 14. 최종 검토 결론

### 적절성

채택안은 문제의 원인인 non-stream upstream을 제거하면서도 complete artifact gate를 유지한다. raw streaming이나 atomic 보호 제거보다 안전하다.

### 기존 동작 영향

default OFF, hosted route 한정, 별도 collector, legacy route 제외, DB migration 없음이라는 다섯 경계가 지켜지면 기존 동작에 영향을 주지 않는다. 공통 helper의 기본 의미를 바꾸거나 staging env를 구현과 동시에 ON으로 만드는 것은 금지한다.

### 남은 위험

- daemon 메모리 사용 증가
- progress와 FE soft retry의 잘못된 결합
- repair 중복 비용
- final artifact 대형 delta 전송
- 신규 mode와 기존 atomic mode의 fixture drift

이 위험은 hard byte/time/attempt cap, progress 비영속화, flag OFF byte-equivalence 테스트, 단계적 canary로 통제할 수 있다.

### 결정

**구현 착수 가능.** 다만 첫 구현 범위는 progress parser와 별도 daemon collector까지이며, staging flag 활성화는 테스트와 disclosure scan이 모두 통과한 뒤 별도 단계로 수행한다.
