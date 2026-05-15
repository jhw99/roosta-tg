# Mainnet Deployment Runbook

Story 7.3. Step-by-step procedure to ship Roosta to TON mainnet. Follow in order; do not skip pre-flight.

---

## 1. Pre-Flight

- [ ] All contract tests pass on testnet: `pnpm --filter contracts test`
- [ ] Indexer + scheduler tests green: `pnpm --filter backend test`
- [ ] Bot end-to-end tests green: `pnpm --filter bot test`
- [ ] TMA Lighthouse score ≥ 90 on mobile.
- [ ] Treasury keypair generated **offline** (air-gapped machine, hardware wallet preferred).
- [ ] Multisig (2-of-3) signers identified and key fingerprints exchanged out-of-band. Recommended composition: founder, co-founder, external advisor.
- [ ] External audit findings (Critical/High) all resolved and re-audited.
- [ ] Bug bounty live for ≥ 7 days.
- [ ] `SECURITY_CHECKLIST.md` sign-off gates all checked.

## 2. Build Production Artifacts

```bash
cd packages/contracts
pnpm install --frozen-lockfile
pnpm build
```

Capture the init code hashes for both `KyeFactory` and `KyeContract`:

```bash
pnpm exec blueprint print-hash KyeFactory
pnpm exec blueprint print-hash KyeContract
```

Record both hashes in `MAINNET_DEPLOY.md` under Section 9 (Deployment Log) **before** deploying. These hashes will be cross-referenced against Tonscan to detect tampering.

## 3. Deploy `PlatformTreasury` Multisig

Use the standard TON multisig (e.g., `https://multisig.ton.org` or the TonKeeper multisig flow). Configure:

- Threshold: 2-of-3
- Signers: the three pre-agreed addresses
- Label: `Roosta Platform Treasury`

Verify on Tonscan and record the multisig address.

## 4. Deploy `KyeFactory`

```bash
cd packages/contracts
TON_NETWORK=mainnet \
PLATFORM_TREASURY=<multisig-address> \
DEPLOYER_MNEMONIC="<deployer-mnemonic>" \
pnpm exec blueprint run deployFactory --mainnet
```

The script:
1. Connects to mainnet via `@ton/blueprint`.
2. Deploys `KyeFactory` with the multisig address baked into init data.
3. Funds the factory with 0.5 TON for storage.
4. Prints the factory address.

Record the factory address. Send a 0-value test message and confirm it is processed.

## 5. Verify on Tonscan

1. Open `https://tonscan.org/address/<factory-address>`.
2. Click **Source code → Verify**.
3. Upload `KyeFactory.tact`, `KyeContract.tact`, and the compiled BoC.
4. Confirm the init code hash on Tonscan matches the one recorded in Section 2.
5. Repeat the verification once a `KyeContract` instance is deployed via the factory (see Section 8).

## 6. Configure Backend Environment

Production `.env` for backend and bot (stored in Railway secrets, never in git):

```
TON_NETWORK=mainnet
TON_RPC_URL=https://toncenter.com/api/v2/jsonRPC
TON_RPC_API_KEY=<toncenter-key>
TON_FACTORY_ADDRESS=<deployed-factory>
PLATFORM_TREASURY_ADDRESS=<multisig>
SCHEDULER_WALLET_MNEMONIC=<gas-payer-mnemonic>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
BOT_TOKEN=<bot-token>
SERVICE_TOKEN=<internal-jwt-secret>
SENTRY_DSN=<sentry-dsn>
NODE_ENV=production
LOG_LEVEL=info
```

Fund the scheduler wallet with 20 TON (sufficient for ~200 rounds of gas at 0.1 TON each). Set a low-balance alert at 5 TON via Sentry.

## 7. Deploy TMA (Vercel)

```bash
cd apps/tma
vercel --prod
```

Set Vercel env vars: `NEXT_PUBLIC_TON_NETWORK=mainnet`, `NEXT_PUBLIC_FACTORY_ADDRESS=<factory>`, `NEXT_PUBLIC_BACKEND_URL=https://api.roosta.app`.

In BotFather, update the Mini App URL to the Vercel production domain.

## 8. Deploy Bot + Backend (Railway)

```bash
railway up --service backend
railway up --service bot
```

Confirm:
- Backend health endpoint: `curl https://api.roosta.app/health` returns 200.
- Bot replies to `/start` in Telegram.
- Indexer is consuming events: tail logs for `event_ingested` lines.
- Scheduler heartbeat: `event_type=scheduler_tick` every 60 seconds.

## 9. Mainnet Smoke Test

Create a 2-member test kye with minimum contribution (1 USDT):

1. Organizer (founder account) creates a kye via TMA. Params: N=2, C=1 USDT, F=2%, α_max=0, weekly.
2. Second test account joins via invite link.
3. Wait for round 1 execution (or trigger manually via `pnpm exec scripts/force-round.ts` against mainnet).
4. Confirm:
   - On-chain: `PayoutSent` event observed on Tonscan.
   - DB: `rounds` table has a row with `executed_at` set and the correct `tx_hash`.
   - Bot: both members received Telegram notifications.
   - Treasury: received 0.5% fee.
5. Allow round 2 to execute, completing the kye.
6. Verify `KyeCompleted` event fires.

Record the smoke test kye address in Section 10 of this runbook.

## 10. Rollback Plan

If a Critical bug surfaces post-launch:

**P0 — funds at immediate risk:**
1. Pause new circle creation: set `FACTORY_PAUSED=true` env var on backend; TMA hides the Create button.
2. Notify all active organizers via bot DM with a templated message.
3. For each affected kye, organizer calls `emergencyCancel`; contract refunds pro-rata.
4. Publish incident post on `@RoostaSupportBot` and Telegram channel within 30 minutes.
5. Open public post-mortem within 72 hours.

**P1 — bug exists but funds are safe:**
1. Disable affected feature flag on TMA.
2. Allow existing circles to complete naturally.
3. Patch contract for the next factory deployment (next-generation factory; old factory deprecated).

**P2 — UX bug:**
1. Standard hotfix branch → PR → deploy.
2. No user comms required unless ≥ 10 users affected.

Communication templates in `BETA_LAUNCH.md` Section 5.

## 11. Deployment Log (fill in at deploy time)

The deploy is driven by `scripts/mainnet-deploy.ts`. **Run the testnet
dry-run first**, then re-run with `TON_NETWORK=mainnet`. See
`scripts/README.md` for full env-var documentation and multisig setup.

```bash
# 1. Dry-run (mandatory — never skip this)
TON_NETWORK=testnet \
WALLET_MNEMONIC="..." \
PLATFORM_TREASURY_ADDRESS="kQ...testnet-multisig" \
TON_API_KEY="..." \
pnpm tsx scripts/mainnet-deploy.ts

# 2. Real deploy
TON_NETWORK=mainnet \
WALLET_MNEMONIC="..." \
PLATFORM_TREASURY_ADDRESS="EQ...mainnet-multisig" \
TON_API_KEY="..." \
DEPLOYER_HANDLE="jhenry" \
pnpm tsx scripts/mainnet-deploy.ts
```

The script prints a markdown row at the end. Append it to the table
below and have two signers sign off in the indicated column.

### Deployment log

| Date | Contract | Address | Init hash | Treasury multisig | Sign-off (2 signers) | Smoke-test kye | Deployer |
|---|---|---|---|---|---|---|---|
| _example_ | KyeFactory | `EQ...full` | `0x...full` | `EQ...full` | @alice + @bob | `EQ...smoke` | jhenry |
| 2026-05-13 | KyeFactory (**testnet**) | [`EQC_bLp6_c49lMtgAr03DJum9XijYxl4qTGKZV7FUheKdU2p`](https://testnet.tonscan.org/address/EQC_bLp6_c49lMtgAr03DJum9XijYxl4qTGKZV7FUheKdU2p) | `0xa14c1861a7a72ecefc36d5bbb86290dc33d5649e21ca5fa8493f27a592f026dc` | `EQCuWxkqFp94mWsEgC7qw55CsU86ZajhRfMNau_JZU2Z-1ET` (self, testnet only) | n/a (testnet) | [`EQDv9gjRKQ1fP_TcuZXS6Ni9GmQDwVPAU8q7xYPA_BEJKDdN`](https://testnet.tonscan.org/address/EQDv9gjRKQ1fP_TcuZXS6Ni9GmQDwVPAU8q7xYPA_BEJKDdN) (3 members, 0.1 TON × 1w, F=3%, α=5%, ProRata) | jhenry |
| 2026-05-14 | KyeFactory (**testnet**, redeploy — dedicated treasury) | [`EQAfBlrsEtNVum6D14Y3NrcGRwuv7D4lM-XRSyvDmJBbZjB5`](https://testnet.tonscan.org/address/EQAfBlrsEtNVum6D14Y3NrcGRwuv7D4lM-XRSyvDmJBbZjB5) | `0x3646c83fc9ccadfd8e7eb6c04ec697fa7340fbabaa19ad909671ac402ae14725` | [`EQDX9Hb-pcjaScicBU5DYVRpp8SkSe-_LrcK7AVQzJr1Y_nZ`](https://testnet.tonscan.org/address/EQDX9Hb-pcjaScicBU5DYVRpp8SkSe-_LrcK7AVQzJr1Y_nZ) (testnet treasury, replaces self-treasury placeholder) | n/a (testnet) | pending | jhenry |
| 2026-05-15 | KyeFactory (**testnet**, redeploy — flexible interval bounds) | [`EQAZLWZbfzjLgE2xvWSMnP9sGB1MJzn6H6AXnptiw8fqa3kL`](https://testnet.tonscan.org/address/EQAZLWZbfzjLgE2xvWSMnP9sGB1MJzn6H6AXnptiw8fqa3kL) | `0xfd861736e37175135f1d541a01fa3ab8b7b6bf3b30f93499a8d5e5d06e5dd3c0` | `EQDX9Hb-pcjaScicBU5DYVRpp8SkSe-_LrcK7AVQzJr1Y_nZ` (same as previous) | n/a (testnet) | pending | jhenry |

> The 2026-05-15 redeploy replaces the hard-coded `{1,2,3,4} × week` interval
> allow-list with a `[60 s, 90 days]` bound check. The exposed presets now live
> in `apps/backend/src/routes/kyes.ts` (`ALLOWED_INTERVALS`) and the TMA create
> selector. **Before mainnet, drop `60` from `ALLOWED_INTERVALS` and remove the
> 1-min selector entry — no contract redeploy required.**

After the row is appended:

1. Inline-link addresses to Tonscan (`[EQ...](https://tonscan.org/address/EQ...)`).
2. Both signers add their commit signature (`git commit -S`) and PR
   approval to evidence sign-off.
3. Update Section 6 env vars with the new `FACTORY_ADDRESS` and roll
   the backend.

---

## Appendix: Testnet Production Infrastructure (May 2026)

Production-grade infra is live on **testnet** for end-to-end QA, ahead of
mainnet cutover. URLs are redacted in this doc; full values live in
`secrets.local.json` (gitignored).

| Component | Status | Notes |
|-----------|--------|-------|
| Supabase project `roosta-tg` | ACTIVE_HEALTHY | region ap-northeast-2; migrations 0001–0003 applied |
| Railway project `roosta-tg` | provisioned | services: `backend`, `bot`, `redis` (Docker image) |
| Backend service | `<railway-backend-host>` | env wired to testnet factory + Supabase + Redis |
| Bot service | `<railway-bot-host>` | placeholder `TELEGRAM_BOT_TOKEN` until BotFather provisioned |
| TMA (Vercel) | https://roosta-tg.vercel.app | `NEXT_PUBLIC_API_URL` points at Railway backend |
| Multi-member sim | 3 members joined kye on-chain | see `scripts/testnet-simulate.ts` |

For mainnet cutover, re-run the procedure above with:
- `TON_NETWORK=mainnet`, mainnet RPC + factory address
- new Supabase project (separate from testnet)
- new Railway project (rotate `SERVICE_TOKEN`, `WALLET_MNEMONIC`)
- Vercel env vars for production target updated atomically with backend swap
