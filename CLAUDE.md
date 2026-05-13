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
