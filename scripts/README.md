# `scripts/`

Operational scripts for Roosta. **All scripts are idempotent** — running
twice does the right thing.

| Script | Purpose |
|---|---|
| `mainnet-deploy.ts` | Deploys `KyeFactory` to TON testnet or mainnet, prints a markdown log row for `docs/MAINNET_DEPLOY.md` §11 |
| `capture-userguide.ts` | Generates the 13 user-guide screenshots using Playwright |
| `capture-userguide-fallback.py` | Sandbox-friendly fallback renderer for the same 13 PNGs (no browser required) |

---

## `mainnet-deploy.ts`

### What it does

1. Reads env vars (`TON_NETWORK`, `WALLET_MNEMONIC`, `PLATFORM_TREASURY_ADDRESS`, …)
2. Loads the pre-built `KyeFactory` artifact from `packages/contracts/build/`
3. Deterministically computes the factory's address + `StateInit` hash from
   `(owner, platformTreasury)`
4. Checks the deployer wallet balance (must be ≥ 0.3 TON)
5. Sends the deploy message via `@ton/ton`'s `WalletContractV4`
6. Polls until the contract becomes `active`
7. Prints a markdown log row ready to paste into MAINNET_DEPLOY.md §11

### Required env vars

| Var | Required | Notes |
|---|---|---|
| `TON_NETWORK` | yes | `testnet` or `mainnet` |
| `WALLET_MNEMONIC` | yes | 24-word BIP39 mnemonic |
| `PLATFORM_TREASURY_ADDRESS` | yes | Multisig address (see below) |
| `OWNER_ADDRESS` | no | Factory owner. Defaults to deployer wallet |
| `TON_API_KEY` | recommended | toncenter API key |
| `DEPLOYER_HANDLE` | no | Used in log row, defaults to `$USER` |
| `DRY_RUN` | no | `1` = compute address + log row but don't send |

### Testnet dry-run first (mandatory)

```bash
# 1. Generate / pick a testnet wallet, fund via https://t.me/testgiver_ton_bot
# 2. Deploy a temporary treasury (or pass a test address)
TON_NETWORK=testnet \
WALLET_MNEMONIC="word1 word2 ... word24" \
PLATFORM_TREASURY_ADDRESS="kQDtest...treasury" \
TON_API_KEY="<get from toncenter.com>" \
pnpm tsx scripts/mainnet-deploy.ts
```

Expected output ends with:

```
[deploy] confirmed after N polls

--- MAINNET_DEPLOY.md §11 log row (full) ---
| 2026-05-12 | KyeFactory | EQA…full | 0x…full | EQTr…full | <signer 1> + <signer 2> | <smoke-test kye> | jhenry |
```

If the wallet has insufficient funds the script fails fast with:

```
Deployer wallet kQAxx... has insufficient funds (0 TON < 0.3 TON required).
Fund the wallet first: https://t.me/testgiver_ton_bot
```

### Switching to mainnet

Identical command, change one var:

```bash
TON_NETWORK=mainnet \
WALLET_MNEMONIC="..." \
PLATFORM_TREASURY_ADDRESS="EQ...the multisig you deployed in step 3 of MAINNET_DEPLOY.md" \
TON_API_KEY="..." \
DEPLOYER_HANDLE="jhenry" \
pnpm tsx scripts/mainnet-deploy.ts
```

> ⚠ Before running on mainnet:
> 1. The testnet dry-run must have succeeded end-to-end with the same code.
> 2. The treasury must be a real 2-of-N multisig (see below), not a hot wallet.
> 3. Two signers must be in the same room / call to co-sign the resulting log row.

### Multisig setup for `PLATFORM_TREASURY_ADDRESS`

We use the official TON multisig contract (https://multisig.ton.org/).

1. Visit https://multisig.ton.org/ (or use the Tonkeeper multisig UI).
2. Create a new multisig with:
   - **Signers**: 3 hardware wallets (Ledger or air-gapped) held by
     separate operators
   - **Threshold**: 2 of 3
3. Fund the multisig with 0.5 TON for storage rent.
4. Copy the multisig address — this is your `PLATFORM_TREASURY_ADDRESS`.
5. Document the signer set in `docs/MAINNET_DEPLOY.md` §3.
6. **Never** use the deployer wallet as a signer.

Alternative: use `@ton/multisig` programmatically:

```ts
import { MultisigContract } from '@ton/multisig';
// owners = [Address.parse('EQ...alice'), Address.parse('EQ...bob'), Address.parse('EQ...carol')];
const ms = MultisigContract.create({ workchain: 0, threshold: 2, owners });
```

### Troubleshooting

- **`@ton/ton is not installed`** — the script type-checks without `@ton/ton`
  installed, but the actual deploy needs it: `pnpm add -w @ton/ton`.
- **`Failed to query deployer balance`** — usually a toncenter rate limit.
  Get a free API key at https://toncenter.com and set `TON_API_KEY`.
- **`Contract already deployed`** — the script is idempotent. If the
  computed address is already `active`, it skips the send and still emits
  the log row. To deploy a *different* factory, change `OWNER_ADDRESS` or
  `PLATFORM_TREASURY_ADDRESS`.

---

## `capture-userguide.ts`

Generates `docs/screenshots/{organizer-1..7,member-1..6}.png` by driving
the TMA dev server through Playwright in `?demo=1` mode.

### Setup

```bash
pnpm add -Dw playwright
pnpm exec playwright install chromium
```

### Run

```bash
# Detects existing dev server on port 3000; otherwise spawns one.
pnpm tsx scripts/capture-userguide.ts
```

### Fallback

If you are running in a sandbox without Chromium, use:

```bash
python3 scripts/capture-userguide-fallback.py
```

This produces the same 13 PNGs from a pure-PIL stub (not real TMA
renders). Re-run `capture-userguide.ts` in a normal dev environment to
replace them.
