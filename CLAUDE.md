# Roosta-TG — Coding Rules & Repo Conventions

Telegram-native ROSCA on TON. Source of truth: `docs/GSD-FULL.md`.

## Monorepo layout

```
apps/
  tma/        Next.js 15 mini-app (TON Connect + Telegram WebApp SDK)
  bot/        grammY Telegram bot (polling | webhook)
  backend/    Hono API + BullMQ scheduler + TON event indexer
packages/
  contracts/  Tact contracts (KyeFactory, KyeContract)
  shared/     payout math, types, env validation (zod)
  config/     tsconfig / eslint / prettier presets
supabase/migrations/  SQL migrations
```

## Package boundaries

- `@roosta/shared` is dependency-free of any app. Every app imports types & env from here.
- `packages/contracts` only depends on Tact + TON SDKs. Apps consume the generated `build/<Project>/<Project>_<contract>.ts` wrappers.
- Apps never import from each other. Cross-app coordination is via Supabase rows + Redis queues.

## Build & test commands

```
pnpm install
pnpm -r build
pnpm --filter contracts build       # tact
pnpm --filter contracts test        # vitest + @ton/sandbox
pnpm --filter shared test           # vitest
pnpm --filter backend dev           # hono on :3001
pnpm --filter tma dev               # next on :3000
pnpm --filter bot dev               # grammY long-polling (no-op if BOT_TOKEN missing)
```

Tact compile: `pnpm --filter contracts build` (driven by `packages/contracts/tact.config.json`).

## TypeScript rules

- Strict mode everywhere. No `any` (eslint enforces `@typescript-eslint/no-explicit-any: error`).
- `noUncheckedIndexedAccess` is ON; treat array/map access as possibly `undefined`.
- ESM only (`"type": "module"`).

## Domain conventions

- All timestamps are **Unix seconds** (`number` or `int as uint32` on chain). Postgres uses `timestamptz`; convert at the boundary.
- All amounts are stored in **smallest units** (USDT minor units = 10⁻⁶). Use `bigint` in TS, `coins` in Tact.
- All rates are **basis points** (1% = 100 bps). Platform fee is fixed at 50 bps.

## Env loading

- Env is loaded **only** via `@roosta/shared/env`. Apps must call `loadEnv()` from there; never read `process.env` directly outside that module.
- `.env` files are gitignored. `.env.example` documents every variable.

## Security

- Never commit secrets. Bot token, Supabase service role key, Sentry DSN must stay in `.env`.
- Backend verifies Telegram `initData` HMAC in `apps/backend/src/middleware/initData.ts`. Required on all `/me/*` and `/kyes/*` routes.
- Supabase RLS is on for every table; anon role reads public Kye data only.

## Per-package test command

| Package | Command |
|---|---|
| `packages/shared` | `pnpm --filter shared test` |
| `packages/contracts` | `pnpm --filter contracts test` |
| `apps/backend` | `pnpm --filter backend test` (TODO) |
| `apps/bot` | `pnpm --filter bot test` (TODO) |
| `apps/tma` | `pnpm --filter tma test` (TODO) |

## Don't

- Don't push to `main` without `pnpm -r build` passing.
- Don't bypass `loadEnv` for runtime config.
- Don't introduce `any` to silence type errors — narrow with `unknown` + zod.
- Don't reach across app boundaries (e.g. don't import bot code from backend).

# QA / Release Gate Rules

## Absolute QA Gate

이 프로젝트에서 어떤 기능도 아래 조건을 만족하기 전에는 완료로 간주하지 않는다.

1. Typecheck 통과
2. Lint 통과
3. Unit test 통과
4. Integration test 통과
5. Production build 성공
6. Production-like 환경에서 E2E 통과
7. 핵심 사용자 여정 검증
8. 브라우저 console error 없음
9. pageerror 없음
10. failed network request 없음
11. 기획서 요구사항 추적표 기준 미검증 요구사항 없음
12. 수정한 버그에 대한 회귀 테스트 추가 완료

## Product Intent Compliance

코드를 작성하거나 수정하기 전에 반드시 관련 기획 문서를 확인한다.

우선순위:
1. docs/product 또는 docs/spec에 있는 기획서
2. 요구사항정의서
3. 기능정의서
4. 화면정의서
5. 정책서
6. README
7. 기존 코드 패턴

기획서와 코드가 충돌하면 임의로 판단하지 말고 Gap을 보고한다.

## Bug Fix Rule

버그 수정 시 다음 순서를 반드시 따른다.

1. 재현 시나리오 작성
2. 실패하는 테스트 작성
3. 테스트 실패 확인
4. 원인 분석
5. 최소 범위 수정
6. 전체 QA gate 실행
7. 회귀 테스트 추가
8. QA_REPORT.md 업데이트

## E2E Rule

E2E는 dev server 기준만으로 완료하지 않는다.
반드시 production build 또는 production-like preview server에서 실행한다.

E2E 테스트는 다음 오류를 실패로 처리한다.

- console.error
- uncaught exception
- pageerror
- failed request
- hydration error
- unexpected 4xx/5xx response
- accessibility-critical issue
- broken navigation
- blank screen
- stuck loading state

## Mock Policy

Mock은 unit test에서만 기본 허용한다.
E2E에서는 mock을 사용하지 않는 것을 원칙으로 한다.

예외:
- 결제
- 외부 유료 API
- 운영 DB
- 실제 사용자에게 영향을 주는 외부 시스템

예외의 경우에도 sandbox, staging, seed data, contract test 중 하나로 보완한다.

## Done Definition

"완료"라고 말하려면 반드시 아래 증거를 함께 제시해야 한다.

- 변경 파일 목록
- 실행한 QA 명령어
- 테스트 결과
- 요구사항 추적 결과
- 남은 리스크
- 사람이 직접 확인해야 하는 항목
