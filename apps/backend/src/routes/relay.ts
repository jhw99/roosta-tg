/**
 * POST /relay — gasless relayer endpoint.
 *
 * The TMA signs a `VaultIntent` with the user's session key and posts it here.
 * The backend wallet wraps it in a `VaultExecute` message and broadcasts it,
 * paying the TON gas. The RoostaVault contract is the real security boundary
 * (it re-verifies the signature, seqno and expiry); this route additionally
 * validates everything off-chain so a forged or stale intent never costs gas.
 *
 * Auth: Telegram initData (mounted in index.ts) — prevents anonymous spam.
 * The ed25519 signature over the intent is the actual authorization.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { Address, Cell, toNano } from '@ton/core';
import { signVerify } from '@ton/crypto';
import {
  buildSignedIntentCell,
  buildVaultExecuteBody,
  type VaultIntent,
} from '@roosta/shared/vaultMessages';
import { fail } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { readVaultState } from '../lib/vault.js';
import { sendInternalMessage, getWalletContext } from '../scheduler/walletService.js';
import { getSupabase } from '../lib/supabase.js';
import { extractTelegramUser, resolveOrCreateUser } from '../lib/currentUser.js';

export const relay = new Hono();

/**
 * GET /relay/operator-status — diagnostic for the relayer/faucet wallet.
 * Returns the backend wallet address + on-chain TON balance, so any
 * "broadcast failed" / "faucet broadcast failed" failure mode is
 * immediately attributable. No auth: leaks only operator wallet
 * address + balance (already public on chain via tonscan).
 */
relay.get('/operator-status', async (c) => {
  try {
    const ctx = await getWalletContext();
    const addr = ctx.wallet.address.toString();
    let balance = 0n;
    try {
      balance = await ctx.client.getBalance(ctx.wallet.address);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'getBalance failed for operator wallet');
    }
    return c.json({
      operatorAddress: addr,
      balanceNano: balance.toString(),
      balanceTON: (Number(balance) / 1e9).toFixed(4),
      lowFunds: balance < 1_000_000_000n, // < 1 TON
    });
  } catch (e) {
    return fail(c, 500, 'operator_init_failed', (e as Error).message);
  }
});

// GET /relay/state?vault=<address> — current on-chain vault state. The TMA
// calls this to learn the seqno it must put in the next intent, and to show
// the vault's deposited balance.
relay.get('/state', async (c) => {
  const vaultRaw = c.req.query('vault');
  if (!vaultRaw) return fail(c, 400, 'missing_vault', 'vault query param required');
  let vaultAddress: Address;
  try {
    vaultAddress = Address.parse(vaultRaw);
  } catch (e) {
    return fail(c, 400, 'invalid_encoding', (e as Error).message);
  }
  try {
    const state = await readVaultState(vaultAddress);
    return c.json({
      deployed: state.deployed,
      seqno: state.seqno.toString(),
      balance: state.balance.toString(),
      pubKey: state.pubKey.toString(16).padStart(64, '0'),
    });
  } catch (e) {
    logger.error({ err: (e as Error).message, vault: vaultRaw }, 'vault state read failed');
    return fail(c, 502, 'vault_read_failed', 'could not read vault state');
  }
});

// Gas the backend wallet attaches to the VaultExecute message. Covers the
// vault's compute + action phases and the forwarded message's gas; the user's
// deposited funds cover only the forwarded `amount` itself.
const RELAY_GAS_BUDGET = toNano('0.1');

const RelayBody = z.object({
  vaultAddress: z.string().min(10),
  intent: z.object({
    seqno: z.string().regex(/^\d+$/),
    validUntil: z.string().regex(/^\d+$/),
    target: z.string().min(10),
    amount: z.string().regex(/^\d+$/),
    mode: z.number().int().min(0).max(255),
    body: z.string().min(1), // base64 BOC of the inner message body
  }),
  signature: z.string().min(1), // base64 of the 64-byte ed25519 signature
});

function pubKeyToBuffer(pubKey: bigint): Buffer {
  return Buffer.from(pubKey.toString(16).padStart(64, '0'), 'hex');
}

relay.post('/', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = RelayBody.safeParse(raw);
  if (!parsed.success) return fail(c, 400, 'invalid_body', parsed.error.message);
  const { vaultAddress: vaultRaw, intent: intentRaw, signature: sigRaw } = parsed.data;

  let vaultAddress: Address;
  let target: Address;
  let innerBody: Cell;
  let signature: Buffer;
  try {
    vaultAddress = Address.parse(vaultRaw);
    target = Address.parse(intentRaw.target);
    innerBody = Cell.fromBase64(intentRaw.body);
    signature = Buffer.from(sigRaw, 'base64');
  } catch (e) {
    return fail(c, 400, 'invalid_encoding', (e as Error).message);
  }
  if (signature.length !== 64) {
    return fail(c, 400, 'invalid_signature', 'signature must be 64 bytes');
  }

  const intent: VaultIntent = {
    seqno: BigInt(intentRaw.seqno),
    validUntil: BigInt(intentRaw.validUntil),
    target,
    amount: BigInt(intentRaw.amount),
    mode: BigInt(intentRaw.mode),
    body: innerBody,
  };

  // Expiry — reject before touching the chain.
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (intent.validUntil < nowSec) {
    return fail(c, 400, 'intent_expired', 'intent validUntil is in the past');
  }

  // On-chain vault state: must be deployed, seqno must match exactly.
  let vaultState;
  try {
    vaultState = await readVaultState(vaultAddress);
  } catch (e) {
    logger.error({ err: (e as Error).message, vaultAddress: vaultRaw }, 'readVaultState failed');
    return fail(c, 502, 'vault_read_failed', 'could not read vault state');
  }
  if (!vaultState.deployed) {
    return fail(c, 409, 'vault_not_deployed', 'fund the vault before relaying intents');
  }
  if (intent.seqno !== vaultState.seqno) {
    return fail(
      c,
      409,
      'seqno_mismatch',
      `intent seqno ${intent.seqno} != vault seqno ${vaultState.seqno}`,
    );
  }

  // Verify the ed25519 signature against the vault's on-chain session pubkey.
  const signedHash = buildSignedIntentCell(intent, vaultAddress).hash();
  if (!signVerify(signedHash, signature, pubKeyToBuffer(vaultState.pubKey))) {
    return fail(c, 401, 'bad_signature', 'intent signature does not verify');
  }

  // All checks passed — broadcast.
  const executeBody = buildVaultExecuteBody(intent, signature);
  try {
    const { seqno } = await sendInternalMessage(vaultRaw, executeBody, RELAY_GAS_BUDGET);
    logger.info(
      { vaultAddress: vaultRaw, intentSeqno: intent.seqno.toString(), walletSeqno: seqno },
      'relayed vault intent',
    );
    // Server-tracked balance updates. EVERY successful relay outflow
    // debits the vault by intent.amount. If the target is the user's own
    // wallet, we ALSO credit the owner — this is the withdraw path. For
    // contribute / join intents the target is the kye contract and the
    // tokens are conceptually "moved to the pool" — vault decrements,
    // no owner credit. Inflow (payouts) is handled by the indexer.
    try {
      const sb = getSupabase();
      const tg = extractTelegramUser(c);
      if (sb && tg) {
        const user = await resolveOrCreateUser(sb, tg);
        if (user) {
          const currentVault = BigInt(user.test_usdc_vault_balance);
          const debit = intent.amount > currentVault ? currentVault : intent.amount;
          const newVault = currentVault - debit;
          const update: Record<string, string> = {
            test_usdc_vault_balance: newVault.toString(),
          };
          if (user.wallet_address) {
            const isWithdrawToOwner = Address.parse(user.wallet_address).equals(target);
            if (isWithdrawToOwner) {
              update.test_usdc_balance = (
                BigInt(user.test_usdc_balance) + intent.amount
              ).toString();
            }
          }
          await sb.from('users').update(update).eq('id', user.id);
        }
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'relay balance update failed (non-fatal)');
    }
    return c.json({ ok: true, intentSeqno: intentRaw.seqno, walletSeqno: seqno });
  } catch (e) {
    const errMsg = (e as Error).message ?? '';
    logger.error({ err: errMsg, vaultAddress: vaultRaw }, 'relay broadcast failed');
    // Distinguish the two common causes for the operator AND give the
    // user something actionable. The relayer wallet is what pays the gas
    // for VaultExecute; when it runs dry every relay 502s with a TON
    // client "insufficient" / "Account is uninitialized" error.
    const isWalletDry =
      /insufficient|balance|not enough|423/i.test(errMsg) ||
      /Account is uninitialized/i.test(errMsg);
    return fail(
      c,
      502,
      isWalletDry ? 'relayer_dry' : 'broadcast_failed',
      isWalletDry
        ? '운영자 relayer 지갑의 testnet TON이 부족합니다. 잠시 후 다시 시도해주세요. (operator: top up WALLET_MNEMONIC wallet via @testgiver_ton_bot)'
        : `Relay broadcast failed: ${errMsg.slice(0, 160)}`,
    );
  }
});
