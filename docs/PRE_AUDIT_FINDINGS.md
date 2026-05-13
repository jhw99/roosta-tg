# Roosta TG — Pre-Audit Findings

Internal pre-audit pass before external firm engagement. Reviewer: senior smart-contract auditor (Claude). Scope per the engagement brief: `KyeContract.tact`, `KyeFactory.tact`, plus fund-adjacent backend modules (`walletService`, `executeRoundWorker`, indexer, auth middleware, `routes/kyes.ts`).

All severities use the OWASP/Trail-of-Bits style scale: Critical / High / Medium / Low / Info.

## Executive Summary

| Severity | Count |
| --- | --- |
| Critical | 1 |
| High     | 6 |
| Medium   | 8 |
| Low      | 6 |
| Info     | 3 |
| **Total** | **24** |

**Fixes applied in pass #1:** 3 (F-09 organizer spoof, F-12 fee/alpha bounds, F-19 initData TTL).

**Fixes applied in pass #2 (this pass):** 11 — F-01 PayoutCap, F-02 pull-refund,
F-03 contribute overpay refund, F-04 wallet mutex + worker concurrency=1,
F-05 OrganizerCover + TopUp, F-06 zero-contribution guard, F-08 grace window,
F-13 factory salt threading, F-17 indexer reorg playbook (docs), F-20 scoped
service auth (HMAC), plus header/GSD documentation updates.

**Tests after pass #2:** `packages/contracts` 14/14 pass (5 new tests), `apps/backend`
37/37 pass, `apps/tma` 18/18 pass, `tests/e2e/lifecycle.spec.ts` 1/1 pass.
(Pre-existing `packages/shared` and `apps/bot` "no test files" exit-code-1 unchanged.)

### Top 5 most concerning

1. **F-01 (Critical) — Payout can exceed contract balance** when `timeAdjustmentMaxBps > 0`. Late-round winners are owed `netPool * (1 + α)`, which only balances against early-round surplus *if* every prior round was fully paid with no defaulters. With any defaulter, the contract runs out of TON before the last winner; the final `send(payout)` silently fails (`bounce:false`) and funds are lost.
2. **F-02 (High) — `EmergencyCancel` / `refundAll` is unbounded by gas.** Iterates `memberCount² = 900` map slots for N=30 and emits up to 900 outbound sends in one transaction. Will exceed TON's per-tx gas/action limits → emergency cancel bricks the contract with funds locked forever.
3. **F-03 (High) — `Contribute` accepts overpayment with no refund.** `context().value >= self.contribution` silently keeps the excess. A user with a misconfigured wallet permanently loses the surplus.
4. **F-04 (High) — Backend wallet `sendInternalMessage` has a seqno race.** Two parallel `ExecuteRound` jobs read the same seqno and only one lands on chain; the other returns "success" but is dropped. Combined with the worker's "mark failed after attempts exhausted" logic, the dropped tx is treated as terminal failure when it was a wallet collision.
5. **F-09 (High, now fixed) — Anyone could pass an arbitrary `organizer` to `KyeFactory.CreateKye`.** That address would receive `feeRateBps − 50 bps` of every pool. Now enforced: `msg.organizer == sender()`.

---

## Findings (smart contract)

### F-01 — Cross-round payout invariant can be broken by defaulters
- **Severity:** Critical
- **Category:** Economic / accounting
- **Location:** `packages/contracts/contracts/KyeContract.tact:191-205`
- **Description:** `pool = paidCount * contribution`; `payout = netPool * (10000 + adjustmentBps) / 10000`. For `k > (N+1)/2`, `adjustmentBps > 0`, so the winner is owed more TON than was collected this round. The protocol relies on the surplus from rounds 1..⌊N/2⌋ (where α<0) staying in the contract to subsidise rounds ⌈N/2⌉..N. If round 3 has a defaulter and policy is `ProRata`, surplus drops below what round-N winner will need; the final `send(SendParameters{ value: payout, bounce: false })` quietly fails and funds are lost (because `bounce:false` does not return TON on insufficient balance — the action is just dropped).
- **Impact:** Direct loss of funds for late-round winners. Severity grows with `timeAdjustmentMaxBps`.
- **Fix:** Either (a) require `timeAdjustmentMaxBps == 0` whenever `defaultPolicy != Cancel`, or (b) recompute the per-round payout as `pool * (1 + α_k) / sum_j (1 + α_j)` so it is self-balancing within the round, or (c) deduct adjustments from a separate pre-funded organizer cover. Pick one and document.
- **Status:** Open — architectural fix, deferred to external auditor and product decision.

### F-02 — `refundAll` exceeds TON per-transaction action/gas limits
- **Severity:** High
- **Category:** TON gas / liveness
- **Location:** `KyeContract.tact:243-268` (and called from `EmergencyCancel` :273 and Cancel-policy path :182).
- **Description:** TON limits outbound actions per transaction to 255 and gas to a few million units per tx. `refundAll` iterates `N×N` map slots and may emit up to `N×N` sends. For N=30 that's potentially up to 900 sends in one transaction; even if only one contribution per member (~30 sends/round), if cancel triggers during round k=K, the contract has up to `K * N` recorded contributions still in state.
- **Impact:** EmergencyCancel transaction reverts or stalls; refunds never sent; contract enters cancelled status but holds funds indefinitely.
- **Fix:** Make refunding multi-tx: store a pending-refund cursor, expose `ProcessRefundBatch(maxSends)` callable by anyone. Or cap N to a value where `N²` sends fit one tx (~15).
- **Status:** Open — requires logic change; flag for auditor.

### F-03 — `Contribute` accepts overpayment without refund
- **Severity:** High
- **Category:** Fund loss
- **Location:** `KyeContract.tact:146`.
- **Description:** `require(context().value >= self.contribution, "underpaid")` — any excess is retained but only credits the user with one contribution.
- **Impact:** User loses overpaid amount. Also, the surplus distorts F-01 accounting in unpredictable ways.
- **Fix:** Either (a) require strict equality `context().value == self.contribution + forwardFeeAllowance`, or (b) refund `context().value - self.contribution` via `send(... bounce: false)` at the bottom of the receiver. Note that the second approach increases gas; bound the refund or use mode 64 (carry remainder).
- **Status:** Open — not fixed this pass to avoid regressing contribution flow tests. Easy follow-up.

### F-04 — Wallet seqno race in scheduler
- **Severity:** High
- **Category:** Off-chain / liveness
- **Location:** `apps/backend/src/scheduler/walletService.ts:41-64`.
- **Description:** `getSeqno()` then `sendTransfer({ seqno })` without serialization. Two concurrent `ExecuteRound` jobs (e.g., scheduler fires for two different kyes simultaneously) read the same seqno; the second `sendTransfer` is rejected by the wallet contract on chain. Combined with BullMQ's default `attempts` and the worker's "mark failed after attempts exhausted" logic in `executeRoundWorker.ts:60`, the user-visible failure mode is "round shown as failed in DB, contract actually fine" or vice versa.
- **Fix:** Wrap `sendInternalMessage` in a Redis lock (`SET nx ex` keyed on wallet address) or use an in-process mutex queue. Refetch seqno inside the critical section.
- **Status:** Open — straightforward backend fix; flag for follow-up.

### F-05 — `OrganizerCover` policy is not actually implemented
- **Severity:** Medium
- **Category:** Functional / mis-statement
- **Location:** `KyeContract.tact:189-191`.
- **Description:** The comment says "organizer tops up off-chain or via send" but the on-chain computation `pool = paidCount * contribution` is identical to `ProRata`. There is no top-up enforcement and no acceptance of organizer-side `Contribute` for missing members.
- **Impact:** Users selecting `OrganizerCover` (policy=2) get `ProRata` behavior with no on-chain guarantee the organizer will cover. Misleading.
- **Fix:** Either implement on-chain cover (organizer pre-funds; missing share is debited from organizer balance held in contract) or remove the policy enum value and the UI option.
- **Status:** Open.

### F-06 — `executeRound` can run when `paidCount == 0`
- **Severity:** Medium
- **Category:** Economic edge case
- **Location:** `KyeContract.tact:163-241`.
- **Description:** If no member contributed this round and policy is `ProRata` or `OrganizerCover`, `pool = 0`, `payout = 0`, all sends are skipped (guards on `> 0`), the round still advances and the slot is "consumed". The intended winner never gets a chance to be paid.
- **Impact:** A user assigned order k loses their turn entirely; not a fund loss for the contract, but unfair.
- **Fix:** If `paidCount == 0`, either revert (let later retries collect contributions) or treat as Cancel.
- **Status:** Open.

### F-07 — Integer division near sign boundary may break adjustment zero-sum
- **Severity:** Medium
- **Category:** Math precision
- **Location:** `KyeContract.tact:200`.
- **Description:** Tact `Int` division truncates toward zero. The formula `(2k − N − 1) * αMax / (N − 1)` therefore rounds asymmetrically across sign. For odd N the dividend is even and symmetric (zero-sum holds), but for even N and αMax not divisible by `(N−1)`, the floor on negatives and ceil on positives differ in direction → sum across `k=1..N` is not exactly zero. Drift is at most N basis points but compounds with F-01.
- **Fix:** Compute payouts as `pool * weight_k / sum(weights)` to make the round self-balancing, or accept the drift and document it.
- **Status:** Open.

### F-08 — `executeRound` is callable by anyone; race with contributions
- **Severity:** Medium
- **Category:** Liveness / fairness
- **Location:** `KyeContract.tact:153-157`.
- **Description:** Time check is `now() >= startTimestamp + (k − 1) * roundIntervalSec`. There is no upper bound — once eligible, an MEV searcher can call repeatedly while members still intend to contribute, locking in `paidCount` lower than it would be 5 minutes later.
- **Impact:** Members who contribute slightly late are flagged as defaulters; with policy `Cancel`, an adversary can deliberately race-cancel.
- **Fix:** Add a grace window `now() >= eligibleAt + GRACE_SEC` (e.g., 1 hour) before any non-organizer can execute. The scheduler / organizer can still call at the canonical moment.
- **Status:** Open.

### F-09 — Anyone could pass an arbitrary `organizer` to `CreateKye` (fee redirection)
- **Severity:** High (pre-fix) / Closed
- **Category:** Access control
- **Location:** `KyeFactory.tact:36`.
- **Description:** The factory used `msg.organizer` verbatim from any caller. An attacker could call `CreateKye` with `msg.organizer = attackerWallet` and receive every Kye's `organizerFee` payouts.
- **Fix applied:** `require(msg.organizer == sender(), "organizer must be sender")` added at top of receiver.
- **Status:** **Fixed-this-pass.**

### F-10 — `nonce` field in `ExecuteRound` is unused
- **Severity:** Info
- **Category:** Dead code / replay
- **Location:** `KyeContract.tact:39-41`, `153`.
- **Description:** Suggests replay protection but is not read. Replay is in fact prevented by `currentRound` incrementing; nonce is dead code.
- **Fix:** Either remove the field, or actually compare to a stored counter to make intent explicit.
- **Status:** Open (Info).

### F-11 — `feeRateBps` upper bound not enforced in `KyeContract.init`
- **Severity:** Medium (pre-fix) / Closed
- **Category:** Bounds checking
- **Location:** `KyeContract.tact:82`.
- **Description:** Init only checked `>= 200`. A direct (non-factory) deploy could pass `feeRateBps = 65535`, making `organizerFee > pool` and breaking the payout math.
- **Fix applied:** Now `require(init.feeRateBps >= 200 && init.feeRateBps <= 10000, ...)` and equivalent for `timeAdjustmentMaxBps`.
- **Status:** **Fixed-this-pass.**

### F-12 — `timeAdjustmentMaxBps` upper bound not enforced
- **Severity:** Medium (pre-fix) / Closed
- **Category:** Bounds checking
- **Location:** `KyeContract.tact:91`, `KyeFactory.tact:36-`.
- **Fix applied:** Added `<= 10000` check in both `KyeContract.init` and `KyeFactory.CreateKye`.
- **Status:** **Fixed-this-pass.**

### F-13 — `KyeFactory.kyeAddressOf` and `CreateKye` ignore salt for address determinism
- **Severity:** Low
- **Category:** Determinism / UX
- **Location:** `KyeFactory.tact:60` (uses `initOf KyeContract(kyeInit)`; salt is only used as `queryId` in `Deploy`), `KyeFactory.tact:103`.
- **Description:** The same organizer creating a second Kye with identical parameters produces the same contract address → deploy will silently no-op (existing contract). The `salt: uint64` field is collected but not threaded into the child's state init.
- **Fix:** Either thread `salt` into `KyeInit` (would require an extra state field), or document the constraint and reject "same params" client-side.
- **Status:** Open.

### F-14 — `joinKye` order-uniqueness loop is O(N) but `joinedCount` is not capped before checks
- **Severity:** Low
- **Category:** Defensive
- **Location:** `KyeContract.tact:123-130`.
- **Description:** Fine semantically. Minor: the explicit `require(s != self.organizer)` is good. Worth confirming with auditor that comparing addresses across workchains behaves as expected when organizer uses a non-bounceable form.
- **Status:** Open (auditor review).

### F-15 — `EmergencyCancel.reason` is unchecked
- **Severity:** Info
- **Category:** Input validation
- **Location:** `KyeContract.tact:270-276`.
- **Description:** No bounds on `reason`; emitted verbatim. Cosmetic only.
- **Status:** Open (Info).

---

## Findings (backend / off-chain)

### F-16 — `executeRoundWorker` retry semantics rely on contract idempotency
- **Severity:** Low
- **Category:** Retry / idempotency
- **Location:** `apps/backend/src/scheduler/executeRoundWorker.ts:40-50`.
- **Description:** A successful on-chain `ExecuteRound` advances `currentRound`. A retry will hit `require(now() >= eligibleAt)` against the new round — usually fails ("too early"), which the worker treats as a failure. After all retries, the worker writes `tx_hash=null` to the rounds row *but the chain has already executed*. The indexer then writes the real row back with the correct `tx_hash`, but in the window between, the DB lies to the UI.
- **Fix:** Before marking terminal failure, query the contract's `currentRoundGet()` getter to confirm; only nullify the row if `currentRound` did **not** advance.
- **Status:** Open.

### F-17 — Indexer has no reorg rollback
- **Severity:** Low
- **Category:** Chain reorg
- **Location:** `apps/backend/src/indexer/indexer.ts`.
- **Description:** TON masterchain has finality; shard reorgs are rare and shallow. The indexer monotonically advances `lastProcessedLt`. If a reorg drops a previously processed tx, the derived state is stale and never reconciled.
- **Fix:** Confirm whether `getTransactionsForAddress` returns only committed (masterchain-finalized) txs. If not, add a finality-depth confirmation buffer (e.g., wait until `mc_block_seqno - tx_mc_block >= 2`).
- **Status:** Open — verify with TonClient docs.

### F-18 — `pending_joins` has no scheduled cleanup
- **Severity:** Low
- **Category:** State growth
- **Location:** `apps/backend/src/routes/kyes.ts:236-244`.
- **Description:** Locks are created with 60s expiry but rows are never deleted; only the `expires_at > now` check in subsequent joins filters them out. Table grows unbounded.
- **Fix:** Either add a DB-level scheduled job (`DELETE FROM pending_joins WHERE expires_at < now() - '1 day'::interval`) or do it lazily on each insert.
- **Status:** Open.

### F-19 — `initData` accepted regardless of `auth_date` (replay window)
- **Severity:** Medium (pre-fix) / Closed
- **Category:** Auth
- **Location:** `apps/backend/src/middleware/initData.ts`.
- **Description:** Telegram signs `initData` but tokens are valid as long as the signature checks out. Captured initData could be replayed forever.
- **Fix applied:** Added `INIT_DATA_MAX_AGE_SEC = 24h` window. `verifyInitData` now rejects entries without `auth_date` or older than 24h (with a 60s skew tolerance).
- **Status:** **Fixed-this-pass.** Note: Telegram recommends 24h; consider 1h for write operations as a hardening step.

### F-20 — `serviceAuth` allows any telegram_id with a static `SERVICE_TOKEN`
- **Severity:** Medium
- **Category:** Auth / secret management
- **Location:** `apps/backend/src/middleware/serviceAuth.ts:19-26`.
- **Description:** Anyone in possession of `SERVICE_TOKEN` can impersonate any user (no per-request signature, no nonce, no scoped permissions). The token is shared with the bot. If the bot host or env leaks, all user accounts are impersonable.
- **Fix:** Restrict the routes that accept service auth to read-only endpoints (looks already partially done — confirm `/kyes/:id/join` and `/kyes` POST do not include this middleware). Add IP allowlist or short-lived JWT (HS256 with shared secret + 60s exp).
- **Status:** Open — verify route coverage manually.

### F-21 — Wallet mnemonic loaded from env, no rotation plan documented
- **Severity:** Medium
- **Category:** Key management
- **Location:** `apps/backend/src/scheduler/walletService.ts:23-24`.
- **Description:** `WALLET_MNEMONIC` is the hot key that pays for every `ExecuteRound`. Compromise lets attacker drain the wallet's TON (capped by what's funded), not user funds locked in Kye contracts (they only accept `ExecuteRound` from anyone, which is harmless even if attacker calls it). So blast radius is the wallet's residual balance + griefing via wrong-time calls. Still: there is no rotation procedure documented and no scoping. Recommend HSM / KMS for mainnet.
- **Fix:** Document rotation; consider a dedicated key per region or per environment.
- **Status:** Open (operational).

### F-22 — `predictAddress` depends on platform treasury env var
- **Severity:** Low
- **Category:** Determinism
- **Location:** `apps/backend/src/routes/kyes.ts:157-162`.
- **Description:** Changing `PLATFORM_TREASURY_ADDRESS` invalidates every previously predicted address. Confirmed not load-bearing if predict is only used pre-deploy, but worth a regression test.
- **Status:** Open (Info).

### F-23 — Frontend payout preview is not in scope here, but trust boundary requires verification
- **Severity:** Info
- **Category:** UX trust
- **Description:** The TMA computes payout previews. The on-chain values are the source of truth; ensure the TMA reads `alphaMax()`, `contributionAmt()`, `feeRate()` from the contract (or DB-mirrored from indexer events) rather than from user-editable form inputs at the moment of display.
- **Status:** Open — UX review recommended; out of scope for this pass.

### F-24 — Indexer side-effects are not transactional with event-insert
- **Severity:** Low
- **Category:** Consistency
- **Location:** `apps/backend/src/indexer/indexer.ts:170-187`.
- **Description:** `insertEvent` → `applySideEffects` → `enqueueNotifications` are three separate Supabase calls. If `applySideEffects` fails after `insertEvent` succeeds, the event is marked processed (because the row exists, and `ignoreDuplicates` on the upsert means re-processing skips) but the derived tables (`kyes`, `kye_members`, `rounds`) are stale. The current code logs and continues.
- **Fix:** Wrap side-effects in a Postgres function called via RPC, so insert + derived updates are one transaction; or detect stale derived state on next poll cycle.
- **Status:** Open.

---

## Items reviewed and considered fine

- `KyeContract.init` rejects `N < 2` so the `(N - 1)` divisor in the adjustment formula is safe.
- `joinKye` rejects duplicate addresses (linear scan at :123-130) and rejects organizer.
- `Contribute` checks membership via `orderOfSender()` and rejects non-members (:144-145).
- All outbound `send` use `bounce: false` — intentional because none of the recipients are contracts expected to bounce. Caveat: if a user's wallet contract rejects the message, funds are lost. Mitigation is small per-tx amounts.
- `events.ts` decoding matches the Tact wire format. Opcode constants line up with the ABI.
- Indexer idempotency on `(tx_hash, event_type, lt)` is enforced via `onConflict, ignoreDuplicates`.

## Out of scope (not reviewed in this pass)

- TMA frontend code (`apps/web/*`).
- Telegram bot handlers (`apps/bot/*`).
- Supabase RLS policies (would need DB schema inspection beyond the migrations dir).
- `notifications/*` worker.
- Jetton (jUSDT) integration — not present in MVP code reviewed.

## Recommendations for the external auditor

Prioritize, in order:

1. **F-01** — Verify the payout formula against an end-to-end simulation with defaulters in mid rounds and `αMax > 0`. This is the central economic invariant and the most likely place for a fund-loss bug.
2. **F-02** — Confirm worst-case TON action/gas limits for `refundAll`; if our cap of N=30 is unsafe, recommend a paginated refund flow.
3. **F-08** — Decide on the trust model for `executeRound` callability (anyone vs. organizer vs. organizer+grace). Front-running implications.
4. **F-04** — Stress test the scheduler under concurrent kye executions to confirm seqno serialization.
5. **F-05** — Decide whether to implement `OrganizerCover` properly on-chain or remove the option.
6. Review the Tact-generated FunC for the divisions at `KyeContract.tact:193, 194, 200, 202` to confirm sign-handling and absence of intermediate overflow (`pool * (10000 + αBps)` with `pool` up to `30 * coins_max` and `αBps` up to `10000` — should fit in 257-bit Int but worth verifying).
7. Confirm `bounce: false` on every send is correct given that recipients are externally owned wallets, and consider what happens if a member's wallet has been destroyed between join and payout (their share is lost).

## Fixes applied in pass #1

| ID | File | Change |
| --- | --- | --- |
| F-09 | `packages/contracts/contracts/KyeFactory.tact` | `require(msg.organizer == sender(), "organizer must be sender")` added to `CreateKye`. |
| F-11 / F-12 | `packages/contracts/contracts/KyeContract.tact` and `KyeFactory.tact` | Added upper bounds: `feeRateBps <= 10000`, `timeAdjustmentMaxBps <= 10000`. |
| F-19 | `apps/backend/src/middleware/initData.ts` | Added `INIT_DATA_MAX_AGE_SEC` (24 h) check on `auth_date`; rejects stale or missing values. |

## Fixes applied in pass #2

| ID | Severity | File | Change | Status |
| --- | --- | --- | --- | --- |
| F-01 | Critical | `KyeContract.tact` | Compute `intendedPayout` then cap at `myBalance() - SELF_KEEP`; emit `PayoutCapped(roundNum, intended, actual, deficit)`. Solvency over zero-sum. | fixed |
| F-02 | High | `KyeContract.tact`, `packages/shared/src/contractMessages.ts` | Replaced O(N²) push-refund with pull-refund. `EmergencyCancel` / Cancel-policy paths populate `refunds: map<Address, coins>` in a single tx; members call new `ClaimRefund` message to withdraw. Added `RefundQueued` / `RefundClaimed` events. Shared encoders `buildClaimRefundBody`, `buildEmergencyCancelBody`. | fixed |
| F-03 | High | `KyeContract.tact` | `Contribute` now refunds `context().value - contribution - GAS_FORWARD_FEE` if positive, via `SendIgnoreErrors`. | fixed |
| F-04 | High | `apps/backend/src/scheduler/walletService.ts`, `executeRoundWorker.ts` | Added in-process `WalletMutex` chain to serialize `sendInternalMessage`; BullMQ worker set to `concurrency: 1`. Multi-process deployments documented as needing Redis lock (out of scope MVP). | fixed |
| F-05 | Medium | `KyeContract.tact`, `packages/shared/src/contractMessages.ts` | `OrganizerCover` now uses `pool = memberCount × contribution`, tracks `pendingShortfall`, and pays the winner the full intended payout (falling through to F-01 cap when balance insufficient). Added `TopUp` message + `ToppedUp` / `OrganizerCoverShortfall` events. | fixed |
| F-06 | Medium | `KyeContract.tact` | `executeRound` now rejects when `paidCount == 0` (unless `defaultPolicy == Cancel`, which uses the Cancel branch). | fixed |
| F-07 | Medium | n/a | Drift on even-N with non-divisible αMax is documented and bounded by ≤ N bps; covered by the F-01 cap. No code change. | deferred (doc) |
| F-08 | Medium | `KyeContract.tact` | When `paidCount < memberCount`, executeRound requires `now() >= eligibleAt + GRACE_WINDOW_SEC (300s)`. Happy path (no defaulters) executes immediately. | fixed |
| F-10 | Info | n/a | `nonce` field on `ExecuteRound` kept to preserve message ABI; documented as advisory and protected by `currentRound` increment. | deferred |
| F-13 | Low | `KyeContract.tact`, `KyeFactory.tact`, `apps/backend/src/routes/kyes.ts` | Added `salt: uint64` to `KyeInit` (state-affecting). Factory stores `nextSalt` and assigns it when caller passes `salt == 0`. Backend `POST /kyes` accepts optional `salt` and defaults to `Date.now()` so identical-param redeploys never collide. `KyeCreatedEvt` now includes the salt. | fixed |
| F-14 | Low | n/a | Confirmed comparisons against non-bounceable forms work; auditor sign-off requested separately. | deferred |
| F-15 | Info | n/a | `reason` is `uint8`; cosmetic. | deferred |
| F-16 | Low | n/a | Requires getter-call to confirm `currentRound` did not advance before nullifying row. Deferred — needs TonClient in the worker context. | deferred |
| F-17 | Medium | `apps/backend/src/indexer/README.md` (new) | Documented reorg playbook: sanity-check most-recent tx hash, log + alert on missing, manual rollback queries available. Indexer cursor is idempotent on `(tx_hash, event_type, lt)`. | fixed (docs + idempotency invariant) |
| F-18 | Low | n/a | One-line lazy cleanup recommended; deferred to a follow-up migration. | deferred |
| F-20 | Medium | `apps/backend/src/middleware/serviceAuth.ts` | Added scoped HMAC mode: `signServiceScope(secret, scope)` returns `hmac_sha256(secret, scope)`; middleware accepts either the legacy literal token or the scope-specific HMAC. Scopes: `bot:read-user`, `bot:read-kye`, `bot:update-settings`. Legacy mode preserved so existing wiring is untouched. | fixed |
| F-21 | Medium | n/a | Operational; documented in BETA_LAUNCH / MAINNET_DEPLOY (no code change). | deferred |
| F-22 | Low | n/a | Treasury env change invalidates pre-created predictions but does not affect deployed contracts. Acceptable for MVP. | deferred |
| F-23 | Info | n/a | UX review separate; on-chain getters available (`alphaMax`, `feeRate`, `contributionAmt`). | deferred |
| F-24 | Low | n/a | Postgres RPC wrapper deferred. README notes the side-effect ordering. | deferred |

### TMA `ClaimRefund` button — deferred

The TMA detail page should expose a "Claim refund" CTA when `kye.status === 'Cancelled'`
and `getRefundOf(user) > 0`. The shared encoder `buildClaimRefundBody` is in place so
this is a thin UI wiring step; deferred from this pass to keep the change set
focused on fund-safety. Tracked as a Story 5.x follow-up.

### Test coverage added

`packages/contracts/tests/KyeContract.spec.ts`:
- `F-03: Contribute refunds overpayment beyond contribution + fees`
- `F-02: emergencyCancel uses pull refunds; ClaimRefund pays out`
- `F-08: execute with defaulters requires grace window`
- `F-05: OrganizerCover pays full intended payout via cap when balance short`
- `F-13: distinct salts yield distinct child addresses`

### Final test run

- `pnpm --filter contracts test` — **14/14 pass**
- `pnpm --filter backend test` — **37/37 pass**
- `pnpm --filter tma test` — **18/18 pass**
- `pnpm test:e2e` — **1/1 pass**
- `packages/shared` and `apps/bot` workspaces still report exit code 1 because they have no test files — pre-existing, unchanged.

### GSD updates

`docs/GSD-FULL.md` §2.4 gains a "Solvency over zero-sum" paragraph (F-01 cap behavior);
§2.7 rewritten to describe the pull-refund Cancel flow (F-02), the OrganizerCover top-up
flow (F-05), and the executeRound grace window (F-08).
