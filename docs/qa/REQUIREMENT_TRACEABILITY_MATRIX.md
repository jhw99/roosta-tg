# Roosta-TG — Requirement Traceability Matrix

소스: `docs/GSD-FULL.md`, `docs/USER_GUIDE_ORGANIZER.md`, `docs/USER_GUIDE_MEMBER.md`, `docs/BETA_LAUNCH.md`, `docs/GASLESS_ARCHITECTURE.md`, `packages/contracts/src/*.tact`, `apps/backend/src/routes/*`, `apps/tma/src/app/**`.

상태 코드: ✅ PASS · ❌ FAIL · ⚠️ Partial · ⏳ Not yet verified · 🚧 Spec gap

| ID | 기획 의도 | 사용자 시나리오 | 관련 화면/기능 | 구현 파일 | 테스트 파일 | 상태 | Gap / Risk | 조치 |
|---|---|---|---|---|---|---|---|---|
| RQ-HEALTH-01 | `/health` 가 항상 200 응답 | 운영 monitoring | n/a | `apps/backend/src/index.ts` | smoke | ⏳ | none | smoke script |
| RQ-AUTH-01 | initData 가 검증된 요청만 보호 라우트 통과 | TG 외부에서 직접 호출 시 401 | `/me`, `/relay`, `/kyes/*` (writes) | `apps/backend/src/middleware/initData.ts` | `routes.spec.ts` | ⏳ | HMAC 변조 / 만료 케이스 자동화 | integration spec |
| RQ-AUTH-02 | initData 만료 (24h) 후 거부 | 1일 이상 지난 initData → 401 | 동일 | 동일 | none | ⏳ | none | integration spec |
| RQ-KYE-PUBLIC-01 | GET /kyes/:id 는 public (초대 링크 외부 브라우저 작동) | 일반 브라우저 사용자가 링크 클릭 → 200 | `apps/backend/src/index.ts` PUBLIC_KYE_GET | `apps/backend/src/routes/kyes.ts` | none → 회귀 spec 추가 예정 | ⏳ | fix commit 4feb400 — 회귀 spec 필요 (이전 sweep 에서 발견) | `regress-public-get.spec.ts` |
| RQ-KYE-PUBLIC-02 | GET /kyes/:id/rounds 도 public | 동일 | 동일 | 동일 | none | ⏳ | none | 회귀 spec |
| RQ-KYE-AUTH-01 | POST /kyes/:id/join 은 initData 필수 | 인증 없이 호출 시 401 | `apps/backend/src/middleware/initData.ts` | none | ⏳ | none | integration spec |
| RQ-FRIENDLY-ERR-01 | API 에러 메시지가 한국어 + 사용자 친화 | 401 → "이 링크는 텔레그램의 Roosta 미니앱에서 열어주세요" | `apps/tma/src/lib/api.ts` friendlyMessage | `api.spec.ts` (부분) | ⏳ | fix 4feb400 — 회귀 spec | `regress-friendly-errors.spec.ts` |
| RQ-USDC-BAL-01 | test_usdc_balance 가 faucet/relay 동기화 | faucet 또는 withdraw 호출 후 /me 의 testUsdcBalance 갱신 | `apps/backend/src/routes/{me,relay}.ts` | none | ⏳ | fix f29f312 — 회귀 spec | `regress-balance-sync.spec.ts` (integration) |
| RQ-CIRCLE-CREATE-01 | 조직자가 circle 생성 (N, contribution, interval, fee, α_max, policy) | /create 에서 폼 입력 → 가상 vault 활성화 → CreateKye intent → 봇 invite | `apps/tma/src/app/create/page.tsx`, `packages/contracts/src/KyeFactory.tact` | `contracts/tests/KyeContract.spec.ts` | ⏳ | TonConnect popup 부분은 manual | e2e (gasless 부분만) |
| RQ-CIRCLE-DELETE-01 | 조직자가 status=Created 일 때만 delete 가능 | /kye/:id → Delete → cancelled | `apps/tma/src/app/kye/[address]/page.tsx` | none | ⏳ | none | E2E + state guard |
| RQ-INVITE-LINK-01 | invite 링크가 `t.me/RoostaApp_Bot/app?startapp=join_<addr>` 형식 | 공유 버튼 → URL 형식 검증 + 미니앱에서 deep-link routing | `apps/tma/src/app/kye/[address]/page.tsx` share, `apps/tma/src/components/Providers.tsx` startparam handler | none | ⏳ | fix ac33112 — 회귀 spec | `regress-startapp-routing.spec.ts` |
| RQ-JOIN-01 | 일반 사용자가 invite link 로 join 가능 (3단계 자동 onboarding) | /join/:addr → faucet → vault.activate → JoinKye | `apps/tma/src/app/join/[address]/page.tsx` | none | ⏳ | fix 465c060 — 회귀 spec (TonConnect 부분 manual) | `regress-join-onboarding.spec.ts` |
| RQ-MAINBUTTON-01 | MainButton 폴백이 desktop(≥640px) 에도 보임 + disabled 시에도 보임 | viewport 1280 에서 join 페이지 → 버튼 visible | `apps/tma/src/components/MainButtonShim.tsx` | none | ⏳ | fix f52ac82 — 회귀 spec | `regress-mainbutton.spec.ts` |
| RQ-WALLET-BAL-01 | wallet 페이지가 test USDC balance 만 표시 (실제 TON 표시 X) | /wallet → balance = user.testUsdcBalance | `apps/tma/src/app/wallet/page.tsx` | none | ⏳ | fix f29f312 (UI 측) — 회귀 spec | `regress-balance-sync.spec.ts` (UI 측) |
| RQ-CONTRIB-01 | 멤버는 라운드 마감 전 vault top-up + contribution 자동 처리 | /wallet top-up → contract 자동 인출 | `KyeContract.tact`, `apps/tma/src/app/wallet/page.tsx` | `contracts/tests/` | ⏳ | TonConnect 필요 부분 manual | e2e + contract |
| RQ-PAYOUT-01 | 라운드 실행 시 정해진 멤버에게 payout | scheduler 또는 public action → execute → 멤버 vault 잔액 ↑ | `KyeContract.tact` | `contracts/tests/` | ⏳ | none | sandbox e2e |
| RQ-PAYOUT-FORMULA-01 | 시간 보정 (α_max) 가 정확 | k-th payout = netPool × (10000 + α_max × (2k-N-1)/(N-1)) / 10000 | `KyeContract.tact` | `contracts/tests/` | ⏳ | none | unit test |
| RQ-DEFAULT-01 | 미납 발생 시 grace 후 default policy (ProRata/Cancel/OrganizerCover) | 마감 후 미납 → policy 적용 → 봇 알림 | `KyeContract.tact`, `apps/backend/src/scheduler/*` | `contracts/tests/` | ⏳ | 정책별 분기 자동화 | sandbox + integration |
| RQ-NOTIF-01 | 라운드 24h/1h 전 bot 알림 | scheduler → grammY DM | `apps/backend/src/notifications/templates.ts`, `apps/bot/src/*` | `notifications.spec.ts` | ✅ unit | 실제 grammY API 호출은 mock | dev OK |
| RQ-RELAY-SIG-01 | relay 가 ed25519 + seqno 매칭 안 되면 거부 | 변조된 signature 또는 stale seqno → 401/409 | `apps/backend/src/routes/relay.ts` | `routes.spec.ts` | ⚠️ | seqno 재사용 (replay) E2E 미확인 | integration |
| RQ-RELAY-ALLOWLIST-01 | relay 는 vault 주소로 가는 메시지만 허용 (악성 program 호출 거부) | 무관한 주소로 가는 intent → 거부 | 동일 | none | ⏳ | none | integration |
| RQ-VAULT-DEPLOY-01 | predictVaultAddress 가 결정적 + 실제 deploy 주소와 일치 | activate → on-chain 확인 | `apps/tma/src/lib/vault.ts`, `packages/contracts/src/RoostaVault.tact` | `contracts/tests/predictAddress.spec.ts` | ✅ unit | none | OK |

## 미검증 / 회귀 spec 필요 카운트

총 22 개 ID 중:
- ✅ 2 (notifications 단위, predictAddress)
- ⚠️ 1 (relay sig — 부분)
- ⏳ 19 (대부분 회귀 / 신규 spec 필요)
- 🚧 0 (이번 단계에서는 spec 공백 0 — docs/ 가 풍부하여 가정 정책 불필요)

**미검증이 0 이 아니므로 본 매트릭스 기준 릴리즈 불가.** 이번 sweep 에서 6 개 회귀 + 핵심 contract / API integration spec 을 추가합니다.
