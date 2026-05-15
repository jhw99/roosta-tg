# Roosta GSD v1.0 — Full Specification

**Telegram-Native ROSCA Protocol on TON**

(This file is the source of truth for the full GSD v1.0. Sections 1–12 plus the Appendix are included as originally written.)

---

## 1. Executive Summary

### 1.1 One-line definition

Roosta is on-chain infrastructure for starting, running, and settling a ROSCA (*kye*) with friends on Telegram. A smart contract handles contributions and payouts automatically, the Telegram bot delivers every notification, and the Mini App is where joining and management happen.

### 1.2 Why now, why TON

- ROSCAs are a social protocol at heart. Telegram provides free trust infrastructure.
- Telegram Mini App = zero friction to join.
- Cheap TON gas.
- Direct fit with unbanked markets.

### 1.3 Differentiation

- Explicit risk allocation to the organizer.
- Time value priced into the protocol via α_max.
- Telegram-native notifications.
- A real ROSCA primitive, not yield-optimizing DeFi — positioned as portable credit for the unbanked.

### 1.4 Business model

Platform fee is 0.5% flat of each round's payout.

---

## 2. Product Model

### 2.1 Core concepts

- Circle (*kye*): N members, fixed cadence, one person takes the pool per round.
- Organizer: creates and runs the circle. Earns at least 1.5% of the round fee.
- Member: receives the pool on their turn.
- Round: weekly cycle (1/2/3/4 weeks).

### 2.2 Parameters

| Parameter | Range | Set by |
|---|---|---|
| Members N | 2 – 30 | Organizer |
| Contribution C | Any USDT amount | Organizer |
| Round interval | 1/2/3/4 weeks | Organizer |
| Fee rate F | ≥ 2% | Organizer |
| Platform share | 0.5% fixed | Fixed |
| Organizer share | F − 0.5% | Automatic |
| Time adjustment α_max | ≥ 0% | Organizer |
| Slot order | Preassigned (MVP) | Organizer |
| Default policy | ProRata / Cancel / OrganizerCover | Organizer |

### 2.3 Fee model

```
pool = N × C
platform_fee = pool × 0.005
organizer_fee = pool × (F − 0.005)
winner_payout = pool × (1 − F) × (1 + adjustment(k))
```

### 2.4 Time adjustment (zero-sum)

```
adjustment(k) = α_max × (k - (N+1)/2) / ((N-1)/2)
```

k=1: -α_max. k=N: +α_max. Middle: 0. Sums to 0 across all rounds.

**Solvency over zero-sum (F-01).** Zero-sum is an aspiration. If defaults
reduce the cumulative pool below what a later-round payout requires, the
contract caps the per-round payout at `myBalance() - SELF_KEEP` and emits
`PayoutCapped(intended, actual, deficit)`. Solvency takes precedence over
the strict zero-sum invariant; the deficit is accounted for off-chain and
the loss is borne by the late-round winner (or, under `OrganizerCover`, by
the organizer who is expected to `TopUp`).

### 2.6 UI soft limits

- F + α_max > 20%: "Slot 1 receives less than 80% of the pool"
- F > 10%: "Fee well above market average"
- α_max > 30%: "Large gap between slots"
- interval × N > 12 months: "Long-running circle (over a year)"

### 2.7 Default policies

- **ProRata:** the round's payout scales down proportionally.
- **Cancel:** round cancelled, circle terminated. Refunds use a **pull pattern** (F-02): the contract credits each member's refund to a `refunds[member]` map and emits `KyeCancelled`; members then send a `ClaimRefund` message to withdraw their portion. This avoids `EmergencyCancel` attempting N×N transfers in a single transaction and hitting the action limit.
- **OrganizerCover** (F-05): the pool is always computed as `memberCount × contribution`, and any shortfall accumulates in the `pendingShortfall` state field. The winner is paid the intended amount in full; if balance is insufficient, execution falls through to the F-01 cap path and emits `OrganizerCoverShortfall(organizer, roundNum, deficit)`. The organizer tops up the balance via a `TopUp` message.

**Grace window (F-08).** If `ExecuteRound` is called while at least one member is in default, defaults can only be applied once `GRACE_WINDOW_SEC = 300` seconds (5 minutes) have passed since the round became eligible. Rounds where every member has contributed execute immediately.

---

## 3. System Architecture

| Layer | Tech |
|---|---|
| TMA Frontend | Next.js 15, Tailwind v4, Zustand, TON Connect SDK |
| Smart Contract | Tact (TON) — `KyeFactory`, `KyeContract`, `RoostaVault` (per-user proxy) |
| Bot | grammY (Telegram Bot API), Node.js |
| Backend | Node.js, Hono, Supabase, gasless **relayer** (`POST /relay`) |
| Database | Supabase (Postgres) — cache / UX layer (chain = source of truth) |
| Infra | Vercel (TMA), Railway (Bot + Backend), TON mainnet |

### 3.2 Data flow

Every user has a per-user `RoostaVault` (gasless proxy). Members fund it once;
afterwards every action is a session-key-signed intent the backend relayer
broadcasts. See [`docs/GASLESS_ARCHITECTURE.md`](GASLESS_ARCHITECTURE.md).

```
[Activate] owner wallet  → TonConnect tx → deploys & funds RoostaVault (one-time)
[Create]   organizer TMA → sign intent → /relay → factory deploys child kye → DB row
[Join]     member TMA    → sign intent → /relay → kye.JoinKye → MemberJoined event
[Round]    cron          → executeRound → contributions + payout → event → bot DM
[Default]  no contribute → DefaultDetected → policy applied (ProRata/Cancel/Cover)
[Delete]   organizer (status=Created) → sign EmergencyCancel intent → /relay
[Withdraw] member        → sign intent → /relay → vault forwards to any address
```

### 3.3 Responsibility lines (R&R)

- Platform: contract correctness, bot reliability, TMA availability, scheduler accuracy, gas.
- Organizer: member recruiting / vetting / first-line dispute handling. Compensation: organizer fee.
- Member: maintain wallet balance, approve auto-withdraw, confirm circle terms.

---

## 4. Smart Contract Specification

### 4.1 Structure

```
KyeFactory.tact   — Creates and manages circle instances
KyeContract.tact  — A single circle instance
RoostaVault.tact  — Per-user gasless proxy (deposit + signed-intent execute + owner-withdraw)
PlatformTreasury  — Wallet receiving the 0.5% fee (multisig recommended)
```

The vault is the user's on-chain identity inside every kye: `organizer` and
each `members[i]` is a vault address, not the user's EOA wallet. The kye
contract itself is unchanged by this — it works with whatever sender
address shows up. See [`docs/VAULT_SECURITY_REVIEW.md`](VAULT_SECURITY_REVIEW.md)
for the threat model and audit findings (V-01 … V-17).

### 4.2 State

```
organizer: Address
members: map<Int, Address>
memberCount: Int
contribution: Int
roundIntervalSec: Int
feeRateBps: Int
timeAdjustmentMaxBps: Int
defaultPolicy: Int  (0=ProRata, 1=Cancel, 2=OrganizerCover)
payoutOrder: map<Int, Int>
currentRound: Int
startTimestamp: Int
status: Int  (0=Created, 1=Active, 2=Completed, 3=Cancelled)
platformTreasury: Address
```

### 4.3 Functions

- `createKye` — KyeFactory deploys a KyeContract. Validates: `feeRateBps ≥ 200`,
  `N` within range, interval within `[60 s, 90 days]`. (The 60 s lower bound
  enables a 1-minute test preset on testnet; mainnet UI hides it but the
  contract bound stays.)
- `joinKye` — Reserves a slot and grants auto-withdraw permission. When all
  slots fill, the circle activates. **The organizer may opt into a slot of
  their own** — they are not auto-included, but the contract no longer
  rejects them. They still collect the organizer fee on every round.
- `executeRound` — Callable by anyone. Pulls contributions → distributes fees
  → computes adjustment → sends payout → increments `currentRound`.
- `emergencyCancel` — Organizer only. Allowed while the kye is `Created` (not
  yet activated) or `Active`. Pre-activation usage is exposed in the TMA as
  **"Delete circle"**.

### 4.4 Events

`KyeCreated`, `MemberJoined`, `KyeActivated`, `RoundExecuted`, `DefaultDetected`,
`PayoutSent`, `FeeDistributed`, `KyeCompleted`, `KyeCancelled`, plus vault-side
`VaultDeployed`, `VaultFunded`, `VaultExecuted`, `VaultWithdrawn`.

### 4.5 Gas

- `executeRound` costs 0.05 – 0.1 TON per round (at 30 members). **Backend
  scheduler pays.**
- `createKye` / `joinKye` / `contribute` / `emergencyCancel`: forwarded by the
  user's RoostaVault. The relayer (backend wallet) attaches gas to the
  `VaultExecute` message; the vault uses `SEND_MODE_PAY_GAS_SEPARATELY` to
  forward only the action's nominal amount, so the user's deposited funds
  cover only the real action cost — **users never pay TON gas after the
  one-time vault activation**.

### 4.6 RoostaVault

```
init(owner: Address, ownerPubKey: Int)
receive()                          // accept plain TON (deposits, payouts, refunds)
receive(VaultExecute)              // relayer-delivered, session-key-signed intent
receive(OwnerWithdraw)             // owner-wallet escape hatch (sweeps everything)
get currentSeqno()                 // replay guard
get pubKey()                       // session pubkey
get balance()                      // self balance (nanoTON)
```

`VaultExecute` includes `{seqno, validUntil, target, amount, mode, body,
signature}`. The signed cell additionally binds the vault's `myAddress()` so
an intent cannot be replayed against another vault. Replay protection is by
monotonic `seqno`; `validUntil` bounds the relay window. Tests:
`packages/contracts/tests/RoostaVault.spec.ts` (11 cases).

---

## 5. TMA UI Specification

### 5.1 Screens

Home / Create Circle / Join Circle / Circle Detail / Round History / Wallet / Settings.

- **Home** — "My Circles" list (member + organizer roles, cancelled hidden).
  When the organizer hasn't yet joined any slot the circle still shows up.
  Header has a wallet icon (top-right) that routes to Wallet.
- **Create Circle** — parameters + live payout preview. First-time create
  triggers the **one-time vault activation** TonConnect transaction
  (~0.5 TON funding) on submit; subsequent creates are gasless.
- **Post-create** — full-bleed "Now invite your participants!" card with the
  activation rule restated ("the circle activates once every seat is
  filled"), plus copy/share/Open buttons.
- **Join Circle** — circle terms, per-slot payout table, warnings + consent.
  Organizers may also reach this screen (via the Detail page's "Join as a
  participant" CTA) to claim a slot in their own circle.
- **Circle Detail** — progress, next-round countdown, my contribution status,
  Circle info panel (contribution / interval / fee / policy / α_max /
  members N/total), members list, round history link, Tonscan link, and
  organizer-only **Delete circle** + **Join as a participant** actions
  (status = `Created` only).
- **Wallet** — the user's TonConnect wallet + the **gasless proxy vault**:
  balance, **Top up**, **Withdraw to any address** (signed-intent relay) and
  **Withdraw all to my wallet** (cash-out, gasless).
- **Settings** — language + notification toggles.

### 5.2 Create Circle details

Organizer sets parameters directly. Moving a slider updates the payout table
in real time. The Round-interval selector exposes presets `1m (test, testnet
only) / 1w / 2w / 3w / 4w`; the contract accepts any value in
`[60 s, 90 days]`, so adding/removing presets is an app-layer change.

### 5.3 Join Circle details

Circle terms + per-slot payout table + warning area + consent checkbox
(required when at least one warning fires).

### 5.4 Design

- Auto-switching Telegram dark / light theme
- Primary: #E85D2F (Roosta orange)
- Font: system + Pretendard / Inter fallback
- BackButton and MainButton used throughout
- Long unbroken strings (TON addresses, BoC blobs) always wrap — the page
  never produces a horizontal scrollbar in the Telegram WebView.
- Every relay/top-up/withdraw action shows a full-screen `LoadingOverlay`
  while the request is in flight.

### 5.5 Backend HTTP surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/me` | self + circles (member ∪ organizer, cancelled filtered out) |
| PATCH | `/me/wallet` | persist connected TON wallet |
| PATCH | `/me/vault` | register the deterministic RoostaVault address |
| PATCH | `/me/notification-settings` | per-user toggles |
| GET | `/kyes/:id` | circle detail (kye + members) |
| GET | `/kyes/:id/rounds` | round history |
| POST | `/kyes` | predict child address + pre-insert kye row (gasless flow then signs CreateKye) |
| POST | `/kyes/:id/join` | reserve a slot (pessimistic 60 s lock) |
| GET | `/relay/state?vault=…` | on-chain vault state (deployed/seqno/balance) |
| POST | `/relay` | broadcast a signed `VaultExecute` (gasless relay) |

All authenticated endpoints require a valid Telegram `initData` header. The
relayer additionally re-verifies the ed25519 signature off-chain (against
the vault's on-chain `pubKey`) and rejects stale `seqno` / expired
`validUntil` before spending gas.

---

## 6. Bot Notification Specification

### 6.1 Message matrix

| Event | Recipients | Channel | Message |
|---|---|---|---|
| Circle created | Organizer | DM | Info + invite link + [Open admin] |
| Member joined | Organizer, existing members | Group | "X joined as slot N (n/N)" |
| Slots filled | Everyone | Group + DM | First round schedule |
| 24h before round | Everyone | DM | Time + withdrawal amount + [Top up] |
| Round executed | Everyone | Group | Winner + amount + next schedule |
| Payout | Winner | DM | Amount + tx hash + congrats |
| Default detected | Defaulter | DM | Reason + 24h grace + [Top up now] |
| Default detected | Organizer | DM | Who defaulted + policy + action time |
| Default policy applied | Everyone | Group | Policy + affected amount |
| Circle completed | Everyone | Group + DM | Completion + stats + [Start a new circle] |

### 6.2 Tone

- Friendly and clear. Amounts and times in **bold**.
- 1–2 emoji.
- 1–2 inline buttons per message.
- i18n: Korean + English.

### 6.3 User notification settings

- Round 24h reminder (default ON)
- Round 1h reminder (default OFF)
- Round execution result (default ON)
- Other-member default (organizer only, default ON)
- Other-member payout (group) (default ON)

---

## 7. Epic → Story → Task Breakdown

(Detailed Epic/Story/Tasks live in a separate section of this document or in GitHub Issues. This file keeps only the 7 Epic titles.)

- Epic 1. Project setup & infrastructure
- Epic 2. Smart contract (Tact / TON)
- Epic 3. Database (Supabase)
- Epic 4. Backend (scheduler & API)
- Epic 5. Telegram bot
- Epic 6. TMA frontend
- Epic 7. QA & launch readiness

---

## 8. Timeline

6 weeks to MVP launch (solo developer).

| Week | Milestone |
|:---:|---|
| 1 | Infra + contract scaffolding |
| 2 | Contract complete & tested |
| 3 | DB + backend API |
| 4 | Scheduler + bot |
| 5 | TMA frontend |
| 6 | QA & launch |

---

## 9. NFR

- TMA initial load < 2s
- API p95 < 300ms
- Bot notification latency < 30s
- Round execution drift < 5min
- TMA + API availability 99.5%
- Bot availability 99.0%
- Sentry + Pino logging

---

## 10. Risks

Top items: malicious organizer (UI warnings + Terms), mass default (policies applied automatically), contract bugs (tests + self-audit), regulation (V1 prioritizes overseas markets).

---

## 11. Out of Scope (Roadmap)

V2: Lottery/Bidding, organizer reputation NFT, multi-token, discovery,
jUSDT migration (the vault forwards arbitrary inner bodies, so this is
additive — no contract surgery required).
V3: Token governance, insurance pool, cross-chain, corporate circles.

### 11.1 Gasless Proxy Vault — Post-MVP addition (shipped on testnet)

Originally a roadmap item; now implemented. Per-user `RoostaVault` holds funds
and executes session-key-signed intents the backend relayer broadcasts. The
user signs one TonConnect transaction to fund the vault, then every Roosta
action — create / join / contribute / withdraw / delete — is gasless. Mainnet
deployment is intentionally out of scope of this iteration; see the security
review for the V-01 … V-17 findings and phase-2 hardening list.

---

## 12. Appendix

### 12.1 Payout pseudocode

```python
def calculate_payout(N, C, F_bps, alpha_max_bps, k):
    pool = N * C
    fee = pool * F_bps // 10000
    platform_fee = pool * 50 // 10000
    organizer_fee = fee - platform_fee
    net_pool = pool - fee
    if N == 1:
        adj = 0
    else:
        adj = (2*k - N - 1) * alpha_max_bps // (N - 1)
    payout = net_pool * (10000 + adj) // 10000
    return {"payout": payout, "platform_fee": platform_fee, "organizer_fee": organizer_fee}
```

### 12.2 ERD

```
users (id, telegram_id, wallet_address, language, created_at)
kyes (id, contract_address, organizer_id, name, params jsonb, status, created_at)
kye_members (id, kye_id, user_id, order_num, joined_at, status)
rounds (id, kye_id, round_num, scheduled_at, executed_at, winner_id, payout, tx_hash)
events (id, kye_id, event_type, payload jsonb, tx_hash, processed_at)
notifications (id, user_id, channel, event_id, message, sent_at, status)
notification_settings (user_id, key, value)
```

### 12.4 References

- TON: https://docs.ton.org
- Tact: https://tact-lang.org
- TMA: https://core.telegram.org/bots/webapps
- TON Connect: https://github.com/ton-connect
- grammY: https://grammy.dev
