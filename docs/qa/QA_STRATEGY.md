# Roosta-TG — QA Strategy

Owner: QA Gatekeeper agent  •  Source of truth for `qa:*` scripts and release gating.
Mirror of the Solana version at the sister project; same gates, different stack.

## 1. Purpose

이 문서는 Roosta-TG (Telegram mini app + Hono 백엔드 + grammY 봇 + Tact 컨트랙트) 의 릴리즈 가능 여부 객관적 기준을 정의합니다.

"테스트가 돌긴 했다" 가 아니라 **"실제 사용자가 겪을 모든 시나리오가 검증되었다"** 를 입증할 수 있어야 합니다.

## 2. Real-environment principle

Production-like 검증의 정의:

- TMA frontend: `next build && next start` (Vercel 동일 빌드). dev server 결과는 evidence 로 인정 안 함.
- Backend: `pnpm --filter backend build && node dist/index.js` (Railway 동일 실행 경로).
- 텔레그램 initData: Playwright 가 **실제 verifier 가 통과시키는 서명** 을 만들어 사용. mock middleware 금지.
- 체인: testnet TON (live) 또는 contracts/sandbox. mock RPC 금지.
- Supabase: staging 프로젝트 (별도) 또는 secrets.local.json 의 dev 키. 운영 DB 직접 호출 금지.
- TonConnect: 가능한 한 gasless relay 경로로 우회 (session key 서명 + `/relay` 엔드포인트). 활성화 (vault deploy) 처럼 진짜 TonConnect popup 이 필요한 경우는 manual checklist 로 분리.

## 3. Test levels

| Level | Tool | Scope | Mock policy | Gating |
|---|---|---|---|---|
| typecheck | `tsc --noEmit` (각 workspace) | 정적 타입 | n/a | 실패 = 릴리즈 불가 |
| lint | `next lint` (tma), 각 workspace eslint | 코드 스타일 + react-hooks | n/a | 실패 = 릴리즈 불가 |
| unit | Vitest (apps/tma, apps/backend, packages/shared) | 컴포넌트 / 함수 단위 | Mock 허용 (외부 SDK), 우리 코드 mock 금지 | 실패 = 릴리즈 불가 |
| contracts | Vitest + @ton/sandbox (packages/contracts) | 컨트랙트 lifecycle | n/a (sandbox 가 실제 VM) | 실패 = 릴리즈 불가 |
| integration | Playwright API request fixture | 백엔드 라우트 + DB 통합 | Mock 금지 — 실제 backend + Supabase | 실패 = 릴리즈 불가 |
| e2e | Playwright browser (chromium) | TMA → backend → 체인/sandbox 전체 | Mock 금지 (TonConnect 우회는 session-key 서명으로 대체) | 실패 = 릴리즈 불가 |
| e2e:prod | 위와 동일, `next start` + 백엔드 dist 실행 | 동일 시나리오 prod 번들에서 재실행 | 동일 | 실패 = 릴리즈 불가 |
| smoke | `scripts/qa-smoke.mjs` | 라우트 200/예상 4xx | n/a | 실패 = 릴리즈 불가 |
| manual | QA_REPORT 끝의 checklist | 사람이 직접 확인해야 하는 항목 (TonConnect popup 등) | n/a | 검증 누락 = 릴리즈 불가 |

## 4. Mock policy

- Unit (Vitest): 외부 SDK 의 일부 (TonClient, grammY) 는 mock 가능. **우리** 백엔드 라우트 / TMA hook / 컨트랙트는 mock 금지.
- Integration / E2E: Mock 일체 금지. 예외:
  - **TonConnect popup**: session-key gasless 경로로 우회 (서명 자체는 진짜 ed25519, 단지 popup 만 생략). 활성화·top-up·withdraw-to-owner 같이 wallet popup 이 필수인 케이스는 manual checklist 로.
  - **Telegram initData**: Playwright 가 production verifier 가 통과시키는 진짜 서명 생성 (`e2e/fixtures/init-data.ts`). middleware mock 금지.
  - **결제·메인넷·운영 DB**: 항상 testnet / staging / sandbox.

## 5. Browser-error policy (E2E)

다음은 모두 즉시 fail:

- `console.error`
- `pageerror` (uncaught exception)
- failed network request (status >= 400, 의도된 negative test 제외)
- hydration mismatch warning
- React Strict 위반
- blank screen > 2s
- stuck loading state > 30s
- broken navigation (404 on linked route)

`e2e/fixtures/strict-page.ts` 가 모든 spec 에 자동 적용.

## 6. Production-like 절차

`qa:e2e:prod`:
1. `pnpm --filter @roosta-tg/tma build` — 실패 시 종료.
2. `pnpm --filter @roosta-tg/backend build` — 실패 시 종료.
3. 백엔드 `node apps/backend/dist/index.js` 백그라운드 기동 (PORT=3101).
4. TMA `next start -p 3100` 백그라운드.
5. 헬스 대기 (TMA + backend `/health` 둘 다 30s 안에 200).
6. Playwright suite 실행 (config 의 webServer 가 1+2+3+4 를 wrap).
7. 종료 시 두 프로세스 정리.

## 7. Done definition

`qa:all` 모든 단계 PASS + `REQUIREMENT_TRACEABILITY_MATRIX.md` 미검증 0 + 직전 세션에서 fix 한 6 개 버그 회귀 spec 모두 PASS 일 때만 "완료".

완료 보고는 항상:
- 변경 파일 목록
- 실행 QA 명령어 + 출력 요약
- 새 회귀 테스트 이름
- 미검증 요구사항 (0 이어야 함)
- 사람이 직접 확인해야 하는 manual checklist 결과
- 남은 리스크

## 8. Failure handling

- 우회·skip·`it.skip`·`xit`·warnings 상향 모두 PR 차단.
- 발견된 버그는 CLAUDE.md 의 Bug Fix Rule 8단계:
  1. 재현 시나리오 → 2. 실패 테스트 → 3. 실패 확인 → 4. 원인 → 5. 최소 수정 → 6. 전체 게이트 재실행 → 7. 회귀 테스트 → 8. QA_REPORT 갱신.
- 외부 의존 장애 (testnet TON 일시 503 등) 는 "Blocked (external)" 분류 + 재시도 정책 + 빈도 기록.

## 9. Regression rule

직전 세션에서 fix 한 6 개 버그는 각각 회귀 spec 한 개 이상이 필수:

| Fix commit | 버그 | 회귀 spec |
|---|---|---|
| 4feb400 | public GET /kyes/:id (Hono double-match) | `e2e/regress-public-get.spec.ts` |
| 4feb400 | friendly 4xx 메시지 | `e2e/regress-friendly-errors.spec.ts` |
| f29f312 | test_usdc_balance 서버 추적 | `e2e/regress-balance-sync.spec.ts` (또는 backend unit) |
| ac33112 | startapp=join_<addr> deep-link routing | `e2e/regress-startapp-routing.spec.ts` |
| f52ac82 | MainButton fallback (sm:hidden, disabled-hides) | `e2e/regress-mainbutton.spec.ts` |
| 465c060 | join 자동 onboarding | `e2e/regress-join-onboarding.spec.ts` (TonConnect 부분은 manual) |

회귀 spec 이 없는 fix 는 다음 sweep 까지 "릴리즈 불가" 사유로 카운트.
