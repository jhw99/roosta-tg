import { describe, it, expect, beforeEach } from 'vitest';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { keyPairFromSeed, sign, KeyPair } from '@ton/crypto';
import '@ton/test-utils';

import { RoostaVault } from '../build/RoostaVault/RoostaVault_RoostaVault';

/** Mirror of the contract's signed-cell layout in RoostaVault.tact. */
function buildSignedCell(args: {
  seqno: bigint;
  validUntil: bigint;
  target: Address;
  amount: bigint;
  mode: bigint;
  vault: Address;
  body: Cell;
}): Cell {
  return beginCell()
    .storeUint(args.seqno, 64)
    .storeUint(args.validUntil, 32)
    .storeAddress(args.target)
    .storeCoins(args.amount)
    .storeUint(args.mode, 8)
    .storeAddress(args.vault)
    .storeRef(args.body)
    .endCell();
}

function pubKeyToInt(kp: KeyPair): bigint {
  return BigInt('0x' + kp.publicKey.toString('hex'));
}

describe('RoostaVault', () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let ownerWallet: SandboxContract<TreasuryContract>;
  let relayer: SandboxContract<TreasuryContract>;
  let stranger: SandboxContract<TreasuryContract>;
  let target: SandboxContract<TreasuryContract>;
  let sessionKey: KeyPair;
  let vault: SandboxContract<RoostaVault>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    ownerWallet = await blockchain.treasury('owner');
    relayer = await blockchain.treasury('relayer');
    stranger = await blockchain.treasury('stranger');
    target = await blockchain.treasury('target');
    sessionKey = keyPairFromSeed(Buffer.alloc(32, 7));

    vault = blockchain.openContract(
      await RoostaVault.fromInit(ownerWallet.address, pubKeyToInt(sessionKey)),
    );
    // Funding transaction: deploy + fund in one shot (the one-time "approve").
    await vault.send(
      ownerWallet.getSender(),
      { value: toNano('5') },
      { $$type: 'Deploy', queryId: 0n },
    );
  });

  it('deploys deterministically and stores owner + pubkey + seqno', async () => {
    expect((await vault.getOwnerAddr()).toString()).toBe(ownerWallet.address.toString());
    expect(await vault.getPubKey()).toBe(pubKeyToInt(sessionKey));
    expect(await vault.getCurrentSeqno()).toBe(0n);
  });

  it('accepts plain TON top-ups', async () => {
    const before = await vault.getBalance();
    await stranger.send({ to: vault.address, value: toNano('2') });
    expect(await vault.getBalance()).toBeGreaterThan(before);
  });

  it('executes a valid signed intent and forwards funds to the target', async () => {
    const body = beginCell().storeUint(0xdeadbeef, 32).endCell();
    const amount = toNano('1');
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signed = buildSignedCell({
      seqno: 0n,
      validUntil,
      target: target.address,
      amount,
      mode: 1n,
      vault: vault.address,
      body,
    });
    const signature = sign(signed.hash(), sessionKey.secretKey);

    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'VaultExecute',
        seqno: 0n,
        validUntil,
        target: target.address,
        amount,
        mode: 1n,
        body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({
      from: vault.address,
      to: target.address,
      value: amount,
      success: true,
    });
    expect(await vault.getCurrentSeqno()).toBe(1n);
  });

  it('rejects an intent with a bad signature', async () => {
    const body = beginCell().storeUint(1, 32).endCell();
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const wrongKey = keyPairFromSeed(Buffer.alloc(32, 9));
    const signed = buildSignedCell({
      seqno: 0n, validUntil, target: target.address, amount: toNano('1'),
      mode: 1n, vault: vault.address, body,
    });
    const signature = sign(signed.hash(), wrongKey.secretKey);
    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'VaultExecute', seqno: 0n, validUntil, target: target.address,
        amount: toNano('1'), mode: 1n, body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
    expect(await vault.getCurrentSeqno()).toBe(0n);
  });

  it('rejects a replayed / wrong seqno', async () => {
    const body = beginCell().storeUint(1, 32).endCell();
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    // sign for seqno 1 while the vault is still at 0
    const signed = buildSignedCell({
      seqno: 1n, validUntil, target: target.address, amount: toNano('1'),
      mode: 1n, vault: vault.address, body,
    });
    const signature = sign(signed.hash(), sessionKey.secretKey);
    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'VaultExecute', seqno: 1n, validUntil, target: target.address,
        amount: toNano('1'), mode: 1n, body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
  });

  it('rejects an expired intent', async () => {
    const body = beginCell().storeUint(1, 32).endCell();
    const validUntil = 1n; // far in the past
    const signed = buildSignedCell({
      seqno: 0n, validUntil, target: target.address, amount: toNano('1'),
      mode: 1n, vault: vault.address, body,
    });
    const signature = sign(signed.hash(), sessionKey.secretKey);
    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'VaultExecute', seqno: 0n, validUntil, target: target.address,
        amount: toNano('1'), mode: 1n, body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
  });

  it('rejects an intent that would overdraw the vault', async () => {
    const body = beginCell().storeUint(1, 32).endCell();
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const amount = toNano('1000'); // far more than the 5 TON funded
    const signed = buildSignedCell({
      seqno: 0n, validUntil, target: target.address, amount,
      mode: 1n, vault: vault.address, body,
    });
    const signature = sign(signed.hash(), sessionKey.secretKey);
    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.1') },
      {
        $$type: 'VaultExecute', seqno: 0n, validUntil, target: target.address,
        amount, mode: 1n, body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
  });

  it('rejects relay with insufficient gas', async () => {
    const body = beginCell().storeUint(1, 32).endCell();
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signed = buildSignedCell({
      seqno: 0n, validUntil, target: target.address, amount: toNano('1'),
      mode: 1n, vault: vault.address, body,
    });
    const signature = sign(signed.hash(), sessionKey.secretKey);
    const res = await vault.send(
      relayer.getSender(),
      { value: toNano('0.001') }, // below MIN_RELAYER_GAS
      {
        $$type: 'VaultExecute', seqno: 0n, validUntil, target: target.address,
        amount: toNano('1'), mode: 1n, body,
        signature: beginCell().storeBuffer(signature).endCell().beginParse(),
      },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
  });

  it('lets the owner wallet sweep the balance', async () => {
    const res = await vault.send(
      ownerWallet.getSender(),
      { value: toNano('0.05') },
      { $$type: 'OwnerWithdraw', queryId: 0n },
    );
    expect(res.transactions).toHaveTransaction({ from: vault.address, to: ownerWallet.address });
    const after = await blockchain.getContract(vault.address);
    expect(after.balance).toBeLessThan(toNano('0.01'));
  });

  it('rejects OwnerWithdraw from a non-owner', async () => {
    const res = await vault.send(
      stranger.getSender(),
      { value: toNano('0.05') },
      { $$type: 'OwnerWithdraw', queryId: 0n },
    );
    expect(res.transactions).toHaveTransaction({ to: vault.address, success: false });
  });

  it('two sequential intents both succeed and bump seqno', async () => {
    const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
    for (let i = 0n; i < 2n; i++) {
      const body = beginCell().storeUint(i, 32).endCell();
      const signed = buildSignedCell({
        seqno: i, validUntil, target: target.address, amount: toNano('0.5'),
        mode: 1n, vault: vault.address, body,
      });
      const signature = sign(signed.hash(), sessionKey.secretKey);
      const res = await vault.send(
        relayer.getSender(),
        { value: toNano('0.1') },
        {
          $$type: 'VaultExecute', seqno: i, validUntil, target: target.address,
          amount: toNano('0.5'), mode: 1n, body,
          signature: beginCell().storeBuffer(signature).endCell().beginParse(),
        },
      );
      expect(res.transactions).toHaveTransaction({ from: vault.address, to: target.address });
    }
    expect(await vault.getCurrentSeqno()).toBe(2n);
  });
});
