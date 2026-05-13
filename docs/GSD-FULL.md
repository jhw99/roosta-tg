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
| Smart Contract | Tact (TON) |
| Bot | grammY (Telegram Bot API), Node.js |
| Backend | Node.js, Hono, Supabase |
| Database | Supabase (Postgres) — cache / UX layer (chain = source of truth) |
| Infra | Vercel (TMA), Railway (Bot + Backend), TON mainnet |

### 3.2 Data flow

```
[Create]   organizer → TMA → contract deploy → DB metadata → bot invite link
[Join]     member → link → bot /start → TMA → auto-withdraw approval → join tx
[Round]    cron → executeRound → auto-withdraw + payout → event → bot notification
[Default]  withdraw fails → DefaultDetected → bot notification → policy applied
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
PlatformTreasury  — Wallet receiving the 0.5% fee (multisig recommended)
```

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

- `createKye` — KyeFactory deploys a KyeContract. Validates: feeRateBps ≥ 200, N within range, interval valid.
- `joinKye` — Reserves a slot and grants auto-withdraw permission. When the slots fill, the circle activates.
- `executeRound` — Callable by anyone. Pulls contributions → distributes fees → computes adjustment → sends payout → increments `currentRound`.
- `emergencyCancel` — Organizer only.

### 4.4 Events

KyeCreated, MemberJoined, KyeActivated, RoundExecuted, DefaultDetected, PayoutSent, FeeDistributed, KyeCompleted, KyeCancelled.

### 4.5 Gas

executeRound costs 0.05 – 0.1 TON per round (at 30 members). Backend pays.

---

## 5. TMA UI Specification

### 5.1 Screens

Home / Create Kye / Join Kye / Kye Detail / Round History / Wallet / Settings.

### 5.2 Create Kye details

Organizer sets parameters directly. Moving a slider updates the payout table in real time.

### 5.3 Join Kye details

Circle terms + per-slot payout table + warning area + consent checkbox (required when at least one warning fires).

### 5.4 Design

- Auto-switching Telegram dark / light theme
- Primary: #2481cc
- Font: system + Pretendard fallback
- BackButton and MainButton used throughout

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

V2: Lottery/Bidding, organizer reputation NFT, multi-token, discovery.
V3: Token governance, insurance pool, cross-chain, corporate circles.

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
