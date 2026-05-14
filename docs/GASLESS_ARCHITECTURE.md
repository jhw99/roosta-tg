# Gasless Architecture — Roosta Proxy Vault

Status: implementation in progress. Mainnet deploy intentionally out of scope.

## Goal

Polymarket-style UX: the user signs **one** on-chain transaction ever (fund their
vault). Every subsequent action — create circle, join, contribute every round —
is a signed *intent* relayed by Roosta's backend, which pays the TON gas.

## Why a vault (and not EVM-style approve)

TON jettons have no `approve`/`allowance`. The portable pattern is a per-user
**proxy contract** (`RoostaVault`) that:

- holds the user's funds (native TON for the MVP, jUSDT later),
- is the user's *on-chain identity* — `KyeContract` sees the vault address as the
  member/organizer, so **`KyeContract` and `KyeFactory` need zero changes**,
- executes **signed intents**: the relayer delivers a user-signed message; the
  vault verifies the ed25519 signature, checks a monotonic seqno + `validUntil`,
  then forwards the inner message to its target.

## Keys

- **Owner wallet** — the user's real TonConnect wallet. Signs exactly one tx
  (the funding/deploy). Can always recover funds via `OwnerWithdraw`
  (`sender() == owner`), even if the session key is lost.
- **Session key** — a fresh ed25519 keypair generated in the TMA at setup,
  persisted in Telegram CloudStorage. Signs all intents locally — no wallet
  popup, no gas. The vault is bound to this key via `ownerPubKey`.

Compromise of the session key is bounded: the vault only holds what the user
deposited, and the owner wallet can withdraw at any time. Key rotation =
withdraw + redeploy with a new session key.

## Contracts

### `RoostaVault`

```
init(owner: Address, ownerPubKey: Int as uint256)
```

Address is deterministic in `(owner, ownerPubKey)`, so the TMA predicts it and
the funding transaction both deploys and funds it.

Storage: `owner`, `ownerPubKey`, `seqno` (replay guard).

Receivers:
- bare `receive()` / `receive(Slice)` — accept plain TON: deposits, payouts,
  refunds. Emits `VaultFunded`.
- `receive(VaultExecute)` — relayer path. Rebuilds the signed cell
  `(seqno, validUntil, target, amount, mode, myAddress(), body)`, verifies
  `checkSignature` against `ownerPubKey`, requires `seqno == self.seqno` and
  `now() <= validUntil`, bumps `seqno`, forwards the inner message. `myAddress()`
  in the hash domain-separates intents per vault.
- `receive(OwnerWithdraw)` — `sender() == owner`, sweeps balance to owner.

Permissionless relay: anyone may deliver a `VaultExecute`; the signature is the
only gate. Relayer just has to attach enough TON for gas.

### `KyeFactory` / `KyeContract`

Unchanged. `CreateKye` already requires `msg.organizer == sender()` — with the
vault as sender, the organizer *is* the vault. Contributions are message value;
the vault forwards them. Payouts/fees/refunds are sent to vault addresses, which
the bare receiver accepts.

## Relayer (backend)

- `POST /relay` — body `{ vaultAddress, execute }`. The backend wallet wraps the
  user-signed `VaultExecute` in an internal message with a gas budget and
  broadcasts it. Reuses `walletService.sendInternalMessage` + the F-04 mutex.
- Replay/abuse: the vault's on-chain `seqno` is authoritative. The backend also
  tracks last-seen seqno per vault to reject stale intents early.

## TMA flow

1. Connect wallet.
2. Generate session key → Telegram CloudStorage. Compute vault address.
3. **One-time**: TonConnect tx — send funding TON to the vault address with
   `stateInit` (deploys + funds).
4. Thereafter: build intent → sign with session key → `POST /relay`. No popups,
   no gas.
5. Withdraw: session-key `VaultExecute` to self, or owner-wallet `OwnerWithdraw`.

## Out of scope

- Mainnet deployment.
- jUSDT migration (tracked separately; the vault forwards whatever the inner
  message needs, so the jetton switch is additive).
