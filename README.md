# Roosta

**Telegram-native ROSCA protocol on TON.** Friends start, run, and settle rotating savings circles entirely inside Telegram. Smart contracts handle contributions and payouts; a Telegram bot pushes every notification; a Mini App handles enrollment and management.

See [`docs/GSD-FULL.md`](docs/GSD-FULL.md) for the full product specification, and [`docs/INDEX.md`](docs/INDEX.md) for the full doc index. Coding rules: [`CLAUDE.md`](CLAUDE.md).

---

## Architecture

```
            +-------------------------------------------+
            |              Telegram Client              |
            |   +------------+       +--------------+   |
            |   |  Mini App  |       |     Bot      |   |
            |   | (Next.js)  |       |   (grammY)   |   |
            |   +-----+------+       +------+-------+   |
            +---------|---------------------|-----------+
                      |                     |
                      v                     v
                +--------------------------------+
                |     Backend (Hono, Node)       |
                |  +---------+  +-------------+  |
                |  | Indexer |  |  Scheduler  |  |
                |  +----+----+  +------+------+  |
                +-------|--------------|---------+
                        |              |
              +---------+              +---------+
              v                                  v
      +---------------+                +------------------+
      |   Supabase    |                |  TON  mainnet    |
      |  (Postgres,   |                |  KyeFactory      |
      |     RLS)      |                |  KyeContract*N   |
      +---------------+                +------------------+
```

- **Chain = source of truth.** Supabase is a cache for UX speed.
- **Indexer** consumes external-out events from `KyeContract` and writes idempotently.
- **Scheduler** polls due rounds and calls the permissionless `executeRound`.
- **Bot** turns DB events into Telegram notifications (ko / en).
- **Mini App** is the only authenticated user-facing write surface.

## Quickstart

Prerequisites: Node 20+, pnpm 9+, a TON testnet wallet, a Supabase project.

```bash
git clone <this-repo>
cd Roosta-TG
cp .env.example .env             # fill in TON_RPC_URL, SUPABASE_URL, BOT_TOKEN, ...
pnpm install
pnpm --filter shared build
pnpm --filter contracts build    # Tact compile
pnpm dev                         # all apps in parallel
```

Per-app:

```
pnpm --filter backend dev        # http://localhost:3001/health
pnpm --filter tma dev            # http://localhost:3000
pnpm --filter bot dev            # logs "BOT_TOKEN not set, skipping" if absent
```

Point a development bot's Mini App URL at `http://localhost:3000` via BotFather to test the full flow.

## Workspace Layout

```
apps/
  tma/        Next.js 15 mini app (Tailwind v4, Zustand, TON Connect)
  backend/    Hono API + indexer + scheduler
  bot/        grammY Telegram bot
packages/
  contracts/  Tact smart contracts (KyeFactory, KyeContract)
  shared/     shared types and i18n
  config/     shared eslint / tsconfig
supabase/     migrations + RLS policies
docs/         GSD, security, deploy runbook, user guides, ToS, privacy
tests/        cross-package integration tests
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | run all apps in parallel |
| `pnpm -r build` | build every package/app |
| `pnpm -r test` | run all test suites |
| `pnpm --filter contracts test` | Tact sandbox tests |
| `pnpm --filter backend test` | indexer, scheduler, API |
| `pnpm --filter bot test` | bot handler unit tests |
| `pnpm --filter tma test` | components + Playwright e2e |
| `pnpm db:migrate` | apply `supabase/migrations/*.sql` |

CI runs the full matrix on every PR; merges to `main` require all green.

## Documentation

| Doc | Audience | Language |
|---|---|---|
| [docs/INDEX.md](docs/INDEX.md) | everyone | en |
| [docs/GSD-FULL.md](docs/GSD-FULL.md) | engineers, product | ko |
| [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) | auditors, engineers | en |
| [docs/MAINNET_DEPLOY.md](docs/MAINNET_DEPLOY.md) | operators | en |
| [docs/BETA_LAUNCH.md](docs/BETA_LAUNCH.md) | launch team | en |
| [docs/TOS.md](docs/TOS.md) | users | ko + en |
| [docs/PRIVACY.md](docs/PRIVACY.md) | users | ko + en |
| [docs/USER_GUIDE_ORGANIZER.md](docs/USER_GUIDE_ORGANIZER.md) | organizers | ko |
| [docs/USER_GUIDE_MEMBER.md](docs/USER_GUIDE_MEMBER.md) | members | ko |
| [docs/FAQ.md](docs/FAQ.md) | users | ko |

## Contributing

Branch from `main`, follow conventional commits (`feat:`, `fix:`, `chore:`, `docs:`), open a PR. CI must be green. New contract code requires:

1. Unit tests in `packages/contracts/tests/`
2. Gas snapshot update
3. Reviewer with audit experience signed off

Security disclosures: `security@roosta.app` (PGP key on the website). Do **not** open public issues for vulnerabilities.

## Status

Epic 7A and 7B verified green. This release contains the launch-readiness documentation (Epic 7C / Stories 7.2–7.5). See `docs/INDEX.md`.

## License

MIT for application code. Smart contracts carry no warranty; use at your own risk.
