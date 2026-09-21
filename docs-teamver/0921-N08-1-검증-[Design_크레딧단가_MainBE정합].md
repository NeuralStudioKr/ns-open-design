# 0921-N08-1 검증 · Design 크레딧 단가 ↔ Main BE 정합

| 항목 | 내용 |
|------|------|
| 상태 | 검증 완료 (코드 수정 반영) |
| 범위 | Design `credit_meter` · `DESIGN_MODEL_PRICES_JSON` · Main BE `token_pricing_math` / `ai_model_pricing` |
| 관련 | `docs/125`, `0818-N01` 슬라이드 단가, `0918-N07` 차감 활성화 |

## 0. 결론

| 질문 | 답 |
|------|-----|
| 이전에 Design에 넣었던 `1 T ≡ $0.001` (Claude `3`/`15`)가 Main BE와 같나? | **아니오. 잘못됨.** |
| 올바른 차감 산식은? | Main BE docs/125: `credits = round(supply_usd × 1550 × ratio / 0.5)` |
| MiniMax는 Main BE 시드에 있나? | **없음.** Design이 공식 $/M → USD/1k로 넣고 **같은 KRW 공식**을 적용. |
| 지금 Design 미터가 Main BE와 숫자 일치하나? | **예 (B2C ratio=2.0 기본).** 단위 테스트가 Main BE 순수 함수와 byte-동일 비교. |

## 1. Main BE SSOT

| 상수 | 시드 값 | 파일 |
|------|---------|------|
| `usd_krw_rate` | 1550 | `ns-teamver-be/devops/initial_data/token_cost_setting.csv` |
| `credit_krw_rate` | 0.5원/T | `credit_krw_micro_per_credit=500000` |
| B2C `ratio` | 2.0 | `B2C_PLAN_PRICE_TO_COST_RATIO` |
| B2B `ratio` | 2.5 | Enterprise만 |

```text
supply_usd = (prompt/1000)×prompt_cost_per_1k + (completion/1000)×completion_cost_per_1k
credits    = max(1, round(supply_usd × usd_krw × ratio / credit_krw))
# B2C: ×6200
```

구현: `ns-teamver-be/src/service/token_pricing_math.py`  
Claude Sonnet 4.5 시드: `prompt_cost_per_1k=0.003`, `completion_cost_per_1k=0.015` (`ai_model_pricing.csv`).

Registry Design 경로(`registry_billing_service`)는 **amount(T)를 그대로 차감**하고 환산하지 않는다 → Design이 Main BE와 **같은 식**으로 T를 만들어야 채팅과 단가 철학이 맞는다.

## 2. 잘못된 구 가정 vs 정답

| 모델·토큰 | 구 Design (`1T≡$0.001`) | Main BE B2C (정답) |
|-----------|------------------------:|-------------------:|
| Claude 1k in + 2k out | 33 T | **205 T** |
| MiniMax-M3 1k+2k+1k cache | 5 T (ceil 조각합) | **17 T** |

구 가정은 Claude list $/M을 그대로 T/1k에 넣어 **약 6.2배 과소 청구**(B2C 마진·환율 누락).

## 3. MiniMax 공식 → USD/1k

Pay-as-you-go Standard (상시 50% off M3 ≤512k):

| 모델 | $/M in | $/M out | cache read | → USD/1k in | USD/1k out | cache read/1k |
|------|-------:|--------:|-----------:|------------:|-----------:|--------------:|
| MiniMax-M3 | 0.30 | 1.20 | 0.06 | 0.0003 | 0.0012 | 0.00006 |
| M2.7 | 0.30 | 1.20 | 0.06 | 0.0003 | 0.0012 | 0.00006 |
| M2.7-highspeed | 0.60 | 2.40 | 0.06 | 0.0006 | 0.0024 | 0.00006 |

`cache_creation` Write는 문서 $0.375/M → `0.000375` /1k.

## 4. Design 반영

| 파일 | 역할 |
|------|------|
| `deploy/teamver/be/app/services/credit_meter.py` | `supply_usd` + `credits_from_supply_usd` (Main BE 미러) |
| `deploy/teamver/design_model_prices.json` | USD/1k SSOT |
| `.env.staging` (+ examples) | `DESIGN_MODEL_PRICES_JSON` + 앵커 env 주석 |
| config | `DESIGN_BILLING_USD_KRW_RATE` / `CREDIT_KRW_RATE` / `PRICE_TO_COST_RATIO` (기본 1550/0.5/2.0) |

**미포함(의도):** Priority 1.5×, M3 >512k, B2B ratio 자동 감지(Registry에 plan 없음 → Design 기본 B2C). Enterprise만 쓰는 배포는 `DESIGN_BILLING_PRICE_TO_COST_RATIO=2.5`.

## 5. 직접 테스트

```bash
cd ns-open-design/deploy/teamver/be
python -m pytest tests/test_credit_meter.py tests/test_byok_billing.py -q
```

핵심 케이스 (`test_credit_meter.py`):

1. `credits_from_supply_usd` ↔ Main BE `tokens_from_supply_usd_krw` 동일 (0.033 USD → 205 T)
2. Claude Sonnet 시드 단가 × 1k/2k → Design == Main BE
3. MiniMax-M3 공식 $/M → 17 T
4. `design_model_prices.json` SSOT 로드 · 10k/5k → 56 T

## 6. 수동 검산표 (B2C)

| 시나리오 | supply_usd | ×6200 | round |
|----------|-----------:|------:|------:|
| Claude 1k+2k | 0.033 | 204.6 | **205** |
| MiniMax-M3 1k+2k | 0.0027 | 16.74 | **17** |
| MiniMax-M3 1k+2k+1k cacheR | 0.00276 | 17.112 | **17** |
| MiniMax-M3 10k+5k | 0.009 | 55.8 | **56** |
| M2.7-hs 1k+1k+1k write | 0.003375 | 20.925 | **21** |

## 7. 남은 리스크

| 리스크 | 완화 |
|--------|------|
| B2B 워크스페이스에 B2C 단가 | env로 ratio=2.5 가능. plan-aware는 후속 |
| 슬라이드 **제품 고정가**(0818: MiniMax 300/500) vs 실토큰 | 현행은 방식 B(실토큰). 고정 덱 단가는 별 정책 |
| Main BE에 MiniMax 시드 없음 | Design JSON이 공급 단가 SSOT. 추후 `ai_model_pricing` 시드 추가 시 동기화 |
| DISABLED=1 | 잔액 미차감. ledger `credits_amount_t`만 새 산식으로 채워짐 |
