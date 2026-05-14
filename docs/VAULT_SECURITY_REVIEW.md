# RoostaVault — Security Review

Internal pre-audit review of the gasless proxy-vault system: the
`RoostaVault` contract, the backend relayer (`POST /relay`), and the
vault-as-identity integration with `KyeFactory` / `KyeContract`.

Scope reviewed:
- `packages/contracts/contracts/RoostaVault.tact`
- `packages/shared/src/vaultMessages.ts`
- `apps/backend/src/routes/relay.ts`, `apps/backend/src/lib/vault.ts`
- `apps/backend/src/routes/me.ts` (`PATCH /me/vault`)
- TMA: `lib/sessionKey.ts`, `lib/vault.ts`, `hooks/useVault.ts`

Severity: Critical / High / Medium / Low / Info.
Status: fixed / mitigated / accepted / phase-2.

This is an internal review. An external audit is still required before any
mainnet deployment (explicitly out of scope here).

---

## Trust model (summary)

- **Owner wallet** — the user's real TonConnect wallet. Signs exactly one
  transaction (vault funding/deploy). Can always sweep funds via
  `OwnerWithdraw`.
- **Session key** — ed25519 keypair in the TMA (Telegram CloudStorage). Signs
  all intents. Its compromise is bounded: an attacker can drain only what the
  vault holds, and the owner wallet can withdraw at any time.
- **Relayer** — the backend wallet. Pays gas. Its compromise costs gas funds
  (~tens of TON), never user funds — it cannot forge an intent.
- **Vault** — holds user funds, is the user's on-chain identity in every
  `KyeContract`.

---

## Contract findings — RoostaVault.tact

### V-01 — Signature forgery — Critical — mitigated
`receive(VaultExecute)` verifies `checkSignature(signed.hash(), signature,
ownerPubKey)`. The signed cell is rebuilt on-chain from the message fields, so a
relayer cannot alter `target`/`amount`/`body` without invalidating the
signature. `myAddress()` is included in the hash, so an intent signed for one
vault cannot be replayed against another. Covered by tests
`rejects an intent with a bad signature` and the domain-separation test in
`vaultMessages.spec.ts`.

### V-02 — Replay of a captured intent — High — mitigated
`seqno` must equal the contract's current `seqno` exactly; it is incremented
**before** the `send` action is queued. Tact processes one inbound message per
transaction and `send` only queues an action (no synchronous re-entry), so the
increment cannot be skipped or re-entered. `validUntil` additionally bounds how
long a captured-but-unrelayed intent stays usable. Covered by
`rejects a replayed / wrong seqno` and `rejects an expired intent`.

### V-03 — Draining below storage rent — Medium — mitigated
`require(msg.amount <= myBalance() - SELF_KEEP)` keeps `SELF_KEEP` (0.05 TON)
in the contract so it is not frozen for rent. The relayer's incoming value is
in `myBalance()` at check time, so a forwarded `amount` can technically consume
part of the relayer's gas contribution — this is the relayer's choice (it sized
`RELAY_GAS_BUDGET`) and never costs the user, so it is accepted. Covered by
`rejects an intent that would overdraw the vault`.

### V-04 — Relay with insufficient gas — Medium — mitigated
`require(context().value >= MIN_RELAYER_GAS)` rejects a relay that would fail
mid-action-phase. Covered by `rejects relay with insufficient gas`.

### V-05 — Action-phase abort on OwnerWithdraw — Low — fixed
Initial implementation `emit`-ed *after* `SendRemainingBalance`, which zeroes
the balance and left the emit's external message unable to pay its fee →
action-phase abort. Fixed by emitting before the sweep. Covered by
`lets the owner wallet sweep the balance`.

### V-06 — Unauthorized withdrawal — High — mitigated
`OwnerWithdraw` requires `sender() == self.owner`. Covered by
`rejects OwnerWithdraw from a non-owner`.

### V-07 — Bounced inner message — Low — accepted
The forwarded inner message uses `bounce: true`. If the target rejects it (e.g.
a `KyeContract` rejecting a late `Contribute`), the funds bounce back to the
vault and land in the bare/`Slice` receiver, so funds are recovered. The
`seqno` is already consumed, so the user must sign a fresh intent — standard
behavior, accepted.

### V-08 — Unrestricted `mode` field — Low — accepted
The contract does not constrain the send `mode`; the user signs it. A user
could sign a `SendRemainingBalance` intent and drain their own vault. This is
the user's prerogative over their own funds and does not worsen the
session-key-compromise scenario (a compromised key can already drain via
repeated `amount` intents). The TMA always uses `PAY_GAS_SEPARATELY` (mode 1).

### V-09 — Deterministic-address front-running — Info — accepted
The vault address is `hash(code, data)` and `data` includes `ownerPubKey`. A
third party cannot deploy a vault at the user's address with a different key
(different key → different address), and deploying the *identical* vault
requires knowing the session pubkey and is harmless (same contract, `seqno=0`).

---

## Relayer findings — POST /relay

### V-10 — Anonymous spam — Medium — mitigated
`/relay` is behind Telegram `initData` auth, tying every call to a Telegram
account. The ed25519 signature is re-verified off-chain against the vault's
on-chain pubkey before any gas is spent, so forged or malformed intents are
rejected for free.

### V-11 — Backend gas exhaustion via valid-intent flooding — Medium — phase-2
A user could sign and submit a stream of valid intents (each with the next
seqno), each costing the backend wallet ~0.1 TON. No per-user rate limit is
implemented yet. Mitigations in place: `initData` identifies the spammer; each
intent must actually land on-chain to advance `seqno`, capping throughput.
**Phase-2:** per-user/token-bucket rate limiting on `/relay`, low-balance alert
on the relayer wallet.

### V-12 — Seqno race (double broadcast) — Low — accepted
Two intents signed for the same seqno can both pass the off-chain pre-check if
the first has not yet settled; the second then fails on-chain and wastes one
relay's gas. The contract `seqno` is the authoritative guard, so no double
execution occurs. **Phase-2:** track in-flight seqno per vault in the backend.

### V-13 — Unrestricted relay target — Low — phase-2
The relayer broadcasts to whatever `target` the user signed. Since it is the
user's own vault funds and their own signature, this is not a fund-safety
issue, but the gas subsidy could be spent on unrelated TON activity.
**Phase-2:** whitelist targets to the `KyeFactory` + known `KyeContract`
addresses.

### V-14 — Relayer wallet key compromise — High — accepted/documented
`WALLET_MNEMONIC` (shared with the scheduler) signs relay broadcasts. Its
compromise drains the relayer's gas wallet (bounded, ~tens of TON) but cannot
forge a user intent or touch a vault's balance — the ed25519 signature gate is
independent. Documented in `docs/MAINNET_DEPLOY.md`; mainnet should use a
dedicated, separately-funded relayer key with a low-balance alert.

---

## Integration findings

### V-15 — Vault registration spoofing — Medium — mitigated
`PATCH /me/vault` recomputes the deterministic address from the user's
`wallet_address` + submitted `sessionPubkey` and rejects a mismatch, so a user
cannot register another user's vault. The `users_vault_address_idx` unique
index prevents two users claiming the same vault address.

### V-16 — Vault-as-identity in KyeContract — Info — accepted
`KyeContract` / `KyeFactory` are unchanged. `CreateKye` already enforces
`msg.organizer == sender()`; with the vault as sender, the organizer *is* the
vault. `JoinKye`'s `sender() != organizer` check still holds (vaults are
distinct per user). Payouts/fees/refunds are sent to vault addresses, accepted
by the vault's bare receiver. A user could create a second session key → second
vault → second identity, but multi-identity was already possible with multiple
wallets pre-vault; not a regression.

### V-17 — Session key persistence — Medium — accepted
The session private key lives in Telegram CloudStorage (synced per-user) with a
localStorage fallback. Loss of the key ⇒ the user falls back to `OwnerWithdraw`
from their real wallet to recover funds, then re-activates with a fresh key.
Compromise is bounded to the vault balance. Users are advised (UX copy) to keep
only what they need in the vault.

---

## Test coverage

`packages/contracts/tests/RoostaVault.spec.ts` — 11 cases: deterministic
deploy, plain-TON funding, valid-intent forwarding, bad-signature rejection,
wrong-seqno rejection, expiry rejection, overdraw rejection, low-gas rejection,
owner sweep, non-owner sweep rejection, sequential intents bumping seqno.

`packages/shared/src/__tests__/vaultMessages.spec.ts` — 3 cases: signature
verifies against the session pubkey, per-vault domain separation, encode/decode
round-trip.

## Open items before mainnet (out of scope here)

- External audit of `RoostaVault.tact` + the relayer.
- V-11 rate limiting, V-12 in-flight seqno tracking, V-13 target whitelist.
- Dedicated relayer key, separate from the scheduler key, with balance alerts.
