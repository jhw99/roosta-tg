# Security Checklist — Roosta v1.0

Story 7.2. This document is the security baseline for the Roosta ROSCA protocol prior to mainnet launch. It enumerates the threat surface across the on-chain layer (Tact contracts on TON), the off-chain services (backend, bot, scheduler), and the data layer (Supabase). It is intended as a pre-audit briefing and an internal go/no-go checklist.

---

## 1. Reentrancy Analysis — `executeRound`

TON does not have synchronous external calls. All inter-contract communication happens via asynchronous messages processed in subsequent transactions, so the classic EVM `call`-into-`fallback` reentrancy pattern is structurally impossible. State changes in `executeRound` are committed before any outbound message is processed.

That said, each external `send` carries its own risk surface and must be reviewed:

| Outbound send in `executeRound` | Destination | Risk surface | Mitigation |
|---|---|---|---|
| Pull contribution request (per member) | Member wallet (jetton transfer) | A wallet may bounce / fail. | Failures classified as `DefaultDetected`; round-state machine handles partial collection. |
| Platform fee transfer | `platformTreasury` | If treasury is wrong, fees leak. | Treasury baked into init data; verified at deploy. |
| Organizer fee transfer | `organizer` | Organizer may be a contract that rejects. | Bounce handler logs but does not revert round. |
| Payout to winner | `members[k]` | Winner may have stale address. | Address frozen at `joinKye`; bounce returns funds to contract (manual claim). |
| `RoundExecuted` event emit | external-out | None (output-only). | N/A |

The round-counter increment (`currentRound++`) happens **before** any send, so even if a downstream message triggers a callback in a future transaction, it cannot re-enter the same round. Manually verify in `KyeContract.tact` that `currentRound` is written prior to the first `send`.

## 2. Integer Overflow

All monetary fields are typed as Tact `coins` (uint120) or `Int as int257`. Tact runtime enforces bounds and throws on overflow.

Monetary computations to audit:

- `pool = N * C` — with max N=30 and any realistic C, well below 2^120.
- `fee = pool * feeRateBps / 10000` — intermediate product bounded by pool × 10000, safe.
- `platform_fee = pool * 50 / 10000` — same.
- `adjustment = (2k - N - 1) * timeAdjustmentMaxBps / (N - 1)` — signed; verify int257 used to allow negative intermediates.
- `payout = net_pool * (10000 + adjustment) / 10000` — intermediate may reach pool × 20000 if α_max is huge; still bounded.

TypeScript side: all monetary math uses `BigInt` (`packages/contracts/src/*`, `apps/backend/src/services/*`). No `Number` arithmetic on coin amounts. The lint rule in `eslint.config.js` flags `Number()` casts on jetton fields.

## 3. Permission Checks

| Function | Caller restriction | Additional gate |
|---|---|---|
| `emergencyCancel` | Organizer only (`sender == organizer`) | Status must be Active or Created. |
| `joinKye` | Any address **except** the organizer (`sender != organizer`) | Slot not taken; status == Created. |
| `executeRound` | Anyone (permissionless poke) | `now() >= startTimestamp + currentRound * roundIntervalSec`. Time-gated. |
| `Contribute` (jetton pull notification) | Only addresses in `members` map | Round must be open for collection. |
| `createKye` (Factory) | Anyone | Factory enforces param bounds: `feeRateBps >= 200`, `2 <= N <= 30`, `roundIntervalSec ∈ {7,14,21,28} days`. |

The organizer **cannot** be a member. This prevents self-collusion attacks where the organizer takes a slot and a fee.

## 4. Event Tampering & Replay

Events are emitted as TON external-out messages from the contract itself; external parties cannot forge them. The indexer (`apps/backend/src/indexer/`) consumes them and writes to Supabase.

Replay protection in the indexer:

- Unique key on `events` table: `(tx_hash, event_type, lt)`.
- Idempotent upserts on `rounds` keyed by `(kye_id, round_num)`.
- Notification dedup: `(user_id, event_id)` unique in `notifications`.

A re-org or duplicate poll cannot double-credit a payout or send duplicate Telegram notifications.

## 5. Secret Management

Secrets are environment-only; never committed.

| Secret | Owner | Rotation cadence |
|---|---|---|
| `BOT_TOKEN` | Bot service | On suspected leak; quarterly otherwise. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only | Quarterly; never exposed to TMA or bot. |
| `WALLET_MNEMONIC` (scheduler gas-payer) | Scheduler service | Annually or on rotation event; balance kept low (< 50 TON). |
| `SERVICE_TOKEN` (backend → bot internal API) | Both | Quarterly. |
| `SENTRY_DSN` | All | On compromise. |

Rotation steps documented in `MAINNET_DEPLOY.md` Section 6. Secrets verified absent from git via pre-commit `gitleaks` hook.

## 6. RLS Audit (Supabase)

Every table has explicit RLS policies. Default-deny is enforced via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

| Table | anon role | authenticated role | service_role |
|---|---|---|---|
| `users` | read own row (by telegram_id init data) | same | full |
| `kyes` | read public metadata of public kyes | read kyes they belong to | full |
| `kye_members` | read for kyes they belong to | same | full |
| `rounds` | read for kyes they belong to | same | full |
| `events` | none | read for kyes they belong to | full |
| `notifications` | none | read own | full |
| `notification_settings` | none | read/write own | full |

Write paths go exclusively through the backend (service_role). The TMA never holds the service key.

Verified via `supabase/migrations/*_rls.sql` and integration test `tests/rls.spec.ts` (must pass before deploy).

## 7. Pre-Audit Checklist (External Firm)

**In scope:**
- `packages/contracts/src/KyeContract.tact`
- `packages/contracts/src/KyeFactory.tact`
- Build artifacts (init code hash to be captured in `MAINNET_DEPLOY.md`)

**Out of scope:**
- TMA frontend (apps/tma)
- Backend API (apps/backend)
- Telegram bot (apps/bot)
- Supabase schema (covered by internal review only)

**Threat model summary:**
1. Malicious organizer — UI soft limits + ToS; on-chain enforces param bounds and prevents organizer from being a member.
2. Mass default — handled by `defaultPolicy` (ProRata/Cancel/OrganizerCover); no funds stuck.
3. Contract bug freezing funds — `emergencyCancel` allows organizer to refund pro-rata; no admin upgrade path (immutable by design).
4. Front-running `executeRound` — permissionless, idempotent, time-gated; no MEV surface.
5. Griefing via failed jetton pulls — caught as `DefaultDetected`, does not block round progress.

**Deliverables expected from audit firm:**
- Findings report (Critical/High/Medium/Low/Info).
- Re-audit of fixes within scope.
- Public PDF for publication.

## 8. Sign-off Gates

- [ ] All Epic 7A tests green on testnet (≥ 100 round executions).
- [ ] Indexer replay test: re-ingest last 1k events, no duplicate side-effects.
- [ ] RLS integration tests green.
- [ ] `gitleaks` clean on `main`.
- [ ] External audit complete; all Critical/High resolved.
- [ ] Treasury multisig (2-of-3) verified on Tonscan.
- [ ] Bug bounty live (Immunefi or equivalent) at least 7 days before mainnet announce.
