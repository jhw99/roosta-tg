# Roosta-TG — User-Pattern QA Matrix

체계적으로 잡아낸 사용 패턴 목록. 각 항목은 자동화 (`A`) / 부분 자동화 (`P`) / 수동 (`M`) 로 표시.

## 1. Wallet / 계정 패턴

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| W-01 | 1 wallet, 1 TG user (정상) | A | regress-public-get, regress-balance-sync | — |
| W-02 | **1 wallet, 2+ TG users** | P (DB seed) | regress-multi-account-vault | **vault PDA 충돌 → contribute bounce → vault 펌프** (95afe17 mitigated, 컨트랙트 redeploy 필요) |
| W-03 | 1 TG user, wallet 변경 | M | — | (잠재) DB 의 wallet_address 갱신, 기존 kye_members 의 vault 와 단절 |
| W-04 | Wallet disconnect 중간 | A | regress-wallet-disconnect-mid-flow | UI 가 disconnected 상태로 정상 fallback |
| W-05 | 0 TON wallet 신규 사용자 | A (join onboarding) | regress-join-onboarding | faucet 자동 청구 + vault 활성화 |
| W-06 | Wallet 이미 외부 testnet TON 보유 | M | — | 잔액 표기에 영향 없음 (server-tracked) |

## 2. Vault 패턴

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| V-01 | 첫 활성화 | A (sandbox) | contracts/predictAddress | — |
| V-02 | 재활성화 (session key 재생성 → 새 vault PDA) | M | — | **잠재**: contract members 의 vault 가 stale → contribute 실패 |
| V-03 | 활성화 중간 중단 (tx 미컨펌) | A (UI lock) | regress-contribute-lock | 90s watchdog 으로 처리 |
| V-04 | Vault 가 여러 circle 에서 사용 | A (sandbox) | KyeContract.spec | — |
| V-05 | Top-up 외부 직접 (TonConnect 외) | M | — | indexer 가 plain receive 감지, 백엔드 잔액 sync 필요 |

## 3. Circle/Kye 라이프사이클

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| C-01 | Create + 아무도 안 join | A (sandbox) | KyeContract.spec | — |
| C-02 | Create + 조직자 cancel before fill | A | regress-startapp-routing (간접) | EmergencyCancel 동작 sandbox 검증 |
| C-03 | 조직자가 자기 회로에 join | A (backend) | routes.spec (organizer-may-join) | 0f276c4 정책 확정 |
| C-04 | 3/3 fill → active → 모두 contribute → payout | A (sandbox) | KyeContract.spec lifecycle | — |
| C-05 | 1명 default + policy=cancel | A (sandbox) | KyeContract.spec | — |
| C-06 | 1명 default + policy=pro_rata | A (sandbox) | KyeContract.spec | — |
| C-07 | 1명 default + policy=organizer_cover | A (sandbox) | KyeContract.spec | — |
| C-08 | 조직자 manual ExecuteRound (95afe17 신규) | P | regress-organizer-decision (source) | UI 노출 검증, 실제 트리거는 testnet 확인 필요 |
| C-09 | 조직자 cancel after active | M | — | 컨트랙트가 status='created' 만 EmergencyCancel 허용 |

## 4. initData / 인증 패턴

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| I-01 | 유효 initData (TG 안) | A | (모든 spec) | — |
| I-02 | No initData (일반 브라우저) | A | regress-public-get | GET public, write 401 + Telegram 모달 |
| I-03 | Expired initData (>24h) | A | (will add) | regress-initdata-expiry |
| I-04 | 변조된 initData (HMAC fail) | A | (will add) | regress-initdata-tamper |
| I-05 | "missing initData" UI 표시 | A | regress-friendly-errors | INTERNAL_AUTH_MESSAGES deny-list |

## 5. 네트워크 / 외부 의존

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| N-01 | Backend 5xx | A | regress-network-resilience | (will add) |
| N-02 | Supabase 미설정 | A | strict-page filter | env-aware skip |
| N-03 | Toncenter rate-limit (429) | A | regress-network-resilience | retry 표기 |
| N-04 | 체인 컨펌 지연 (>30s) | A | regress-contribute-lock | 90s watchdog |
| N-05 | Indexer lag (1+ 분) | M | — | UI 가 contributePending 으로 안내 |

## 6. Race / 다중 클릭

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| R-01 | Contribute 더블 클릭 | A | regress-rapid-clicks (will add) | submittedAt lock |
| R-02 | Join 더블 클릭 (다른 슬롯) | A | regress-rapid-clicks | 60s lock in backend |
| R-03 | 두 멤버가 같은 슬롯 동시 join | A (backend) | routes.spec | pending_joins lock |
| R-04 | ExecuteRound 다중 호출 | M | — | 컨트랙트 idempotent (require status check) |

## 7. 입력 경계값 (form fuzz)

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| E-01 | member_count = 0 / 1 / 31 | A | (will add for TG) | — |
| E-02 | contribution = 0 / 음수 | A | (will add for TG) | — |
| E-03 | roundIntervalSec 미허용 | A | (will add for TG) | ALLOWED_INTERVALS |
| E-04 | name 비어있음 / 매우 김 | A | (will add for TG) | zod min/max |
| E-05 | feeRateBps < 200 또는 > 1000 | A | (will add for TG) | zod schema |

## 8. 라우팅 / 새로고침

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| P-01 | 직접 `/kye/<addr>` nav | A | regress-isme-derivation | global /me fetch 필요 |
| P-02 | Bot deep-link `?startapp=join_X` | A | regress-startapp-routing | 4 source 모두 처리 |
| P-03 | 새로고침 중 contribute | A | regress-contribute-lock | submittedAt 잃지만 myStatus 가 인덱서로 재동기화 |
| P-04 | 뒤로가기 / 앞으로가기 | M | — | Next router 표준 |

## 9. 디바이스 / 뷰포트

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| D-01 | Mobile portrait | A | chromium-mobile project | — |
| D-02 | Desktop 1280 | A | chromium-desktop project | MainButton 폴백 visible |
| D-03 | Tablet 768 | M | — | 별도 project 추가 가능 |
| D-04 | TG WebApp 안 | A (withInitData) | — | — |
| D-05 | TG WebApp 밖 | A | regress-mainbutton (stub 감지) | SDK stub 가드 (ef35b4d) |

## 10. i18n / 언어

| ID | 시나리오 | 자동화 | 회귀 spec | 발견된 이슈 |
|---|---|---|---|---|
| L-01 | 한국어 사용자 (language_code='ko') | A | (모든 spec) | — |
| L-02 | 영어 사용자 | A | (모든 spec) | — |
| L-03 | Browser fallback locale | M | — | detectLang() 동작 |

## 자동화 추가 대상 (이번 sweep)

체크된 시나리오 중 회귀 spec 이 빠진 것들:
- I-03/I-04 (initData expiry/tamper) → `regress-initdata-tamper.spec.ts`
- N-01/N-03 (backend/upstream 실패) → `regress-network-resilience.spec.ts`
- R-01/R-02 (rapid clicks) → `regress-rapid-clicks.spec.ts`
- E-01~05 (form fuzz) → `regress-create-form-fuzz.spec.ts`
- W-02 (multi-TG vault collision) → `regress-multi-account-vault.spec.ts`

## 자동화 불가 / 수동 체크리스트

- W-03 wallet swap mid-life: 실제 TonConnect 재연결 필요
- V-02 vault re-activation 중간: 실제 wallet popup 필요
- V-05 외부 top-up: TON CLI 또는 외부 wallet 필요
- C-08 실제 ExecuteRound 트리거: testnet contract + 라운드 마감 시각 도래 필요
- C-09 active 후 cancel: 컨트랙트 변경 필요
- N-05 indexer lag: 인덱서 일부러 stall 시켜야 함
- R-04 ExecuteRound 다중 호출: testnet 동시 broadcast
- P-04 뒤로가기/앞으로가기: Next router 표준 동작 (회귀 매우 적음)
- D-03 tablet 뷰포트: viewport 추가만 하면 됨 (별도 PR)
