import { describe, it, expect, beforeEach } from 'vitest';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano, beginCell, Cell } from '@ton/core';
import '@ton/test-utils';

import {
  KyeContract,
  KyeInit,
  loadKyeCreated,
  loadMemberJoined,
  loadKyeActivated,
  loadRoundExecuted,
  loadPayoutSent,
  loadFeeDistributed,
  loadDefaultDetected,
  loadKyeCompleted,
  loadKyeCancelled,
} from '../build/KyeContract/KyeContract_KyeContract';
import {
  KyeFactory,
  loadKyeCreatedEvt,
} from '../build/KyeFactory/KyeFactory_KyeFactory';

const WEEK = 7 * 24 * 60 * 60;

// Parse Tact `emit()` external-out messages from transaction outMessages.
function parseEmits<T>(transactions: any[], opcode: number, parser: (slice: any) => T): T[] {
  const out: T[] = [];
  for (const tx of transactions) {
    const outMsgs: any[] = Array.from(tx.outMessages?.values?.() ?? []);
    for (const m of outMsgs) {
      // emit() produces external-out messages: info.type === 'external-out'
      if (m.info?.type !== 'external-out') continue;
      const body: Cell = m.body;
      try {
        const slice = body.beginParse();
        if (slice.remainingBits < 32) continue;
        const op = slice.preloadUint(32);
        if (op !== opcode) continue;
        out.push(parser(body.beginParse()));
      } catch (_) {}
    }
  }
  return out;
}

// Opcodes mirror KyeContract_opcodes / KyeFactory_opcodes.
const OP = {
  KyeCreated: 2693900936,
  MemberJoined: 4164037672,
  KyeActivated: 3111286301,
  RoundExecuted: 523671663,
  DefaultDetected: 1251687681,
  PayoutSent: 3251024742,
  FeeDistributed: 2466659621,
  KyeCompleted: 2131495301,
  KyeCancelled: 1996042817,
  KyeCreatedEvt: 507026390,
};

async function deployFactory(blockchain: Blockchain, owner: SandboxContract<TreasuryContract>, treasury: SandboxContract<TreasuryContract>) {
  const factory = blockchain.openContract(await KyeFactory.fromInit(owner.address, treasury.address));
  const res = await factory.send(owner.getSender(), { value: toNano('1') }, { $$type: 'Deploy', queryId: 0n });
  expect(res.transactions).toHaveTransaction({ from: owner.address, to: factory.address, deploy: true, success: true });
  return factory;
}

function makeInit(organizer: Address, treasury: Address, opts: Partial<KyeInit> = {}): KyeInit {
  return {
    $$type: 'KyeInit',
    organizer,
    memberCount: opts.memberCount ?? 3n,
    contribution: opts.contribution ?? toNano('1'),
    roundIntervalSec: opts.roundIntervalSec ?? BigInt(WEEK),
    feeRateBps: opts.feeRateBps ?? 300n,
    timeAdjustmentMaxBps: opts.timeAdjustmentMaxBps ?? 0n,
    defaultPolicy: opts.defaultPolicy ?? 0n,
    platformTreasury: treasury,
    salt: opts.salt ?? 0n,
  };
}

describe('KyeFactory + KyeContract (sandbox)', () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let organizer: SandboxContract<TreasuryContract>;
  let treasury: SandboxContract<TreasuryContract>;
  let m1: SandboxContract<TreasuryContract>;
  let m2: SandboxContract<TreasuryContract>;
  let m3: SandboxContract<TreasuryContract>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    organizer = await blockchain.treasury('organizer');
    treasury = await blockchain.treasury('treasury');
    m1 = await blockchain.treasury('m1');
    m2 = await blockchain.treasury('m2');
    m3 = await blockchain.treasury('m3');
  });

  it('factory deploys a KyeContract and emits KyeCreatedEvt', async () => {
    const factory = await deployFactory(blockchain, deployer, treasury);
    const res = await factory.send(
      organizer.getSender(),
      { value: toNano('0.5') },
      {
        $$type: 'CreateKye',
        organizer: organizer.address,
        memberCount: 3n,
        contribution: toNano('1'),
        roundIntervalSec: BigInt(WEEK),
        feeRateBps: 300n,
        timeAdjustmentMaxBps: 0n,
        defaultPolicy: 0n,
        salt: 1n,
      },
    );
    expect(res.transactions).toHaveTransaction({ from: organizer.address, to: factory.address, success: true });

    const evts = parseEmits(res.transactions, OP.KyeCreatedEvt, loadKyeCreatedEvt);
    expect(evts.length).toBe(1);
    expect(evts[0]!.organizer.toString()).toBe(organizer.address.toString());

    // child should be deployed
    const childAddr = await factory.getKyeAddressOf(
      organizer.address,
      3n,
      toNano('1'),
      BigInt(WEEK),
      300n,
      0n,
      0n,
      1n, // salt passed in CreateKye above
    );
    const child = blockchain.openContract(KyeContract.fromAddress(childAddr));
    const status = await child.getStatusGet();
    expect(status).toBe(0n);
    const mc = await child.getMemberCountGet();
    expect(mc).toBe(3n);
  });

  it('factory rejects feeRateBps below 200', async () => {
    const factory = await deployFactory(blockchain, deployer, treasury);
    const res = await factory.send(
      organizer.getSender(),
      { value: toNano('0.5') },
      {
        $$type: 'CreateKye',
        organizer: organizer.address,
        memberCount: 3n,
        contribution: toNano('1'),
        roundIntervalSec: BigInt(WEEK),
        feeRateBps: 100n,
        timeAdjustmentMaxBps: 0n,
        defaultPolicy: 0n,
        salt: 2n,
      },
    );
    expect(res.transactions).toHaveTransaction({ from: organizer.address, to: factory.address, success: false });
  });

  async function deployKyeDirect(opts: Partial<KyeInit> = {}) {
    const init = makeInit(organizer.address, treasury.address, opts);
    const kye = blockchain.openContract(await KyeContract.fromInit(init));
    const res = await kye.send(deployer.getSender(), { value: toNano('1') }, { $$type: 'Deploy', queryId: 0n });
    expect(res.transactions).toHaveTransaction({ from: deployer.address, to: kye.address, deploy: true, success: true });
    return kye;
  }

  it('three members join in order; KyeActivated when full', async () => {
    const kye = await deployKyeDirect();
    const j1 = await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    expect(j1.transactions).toHaveTransaction({ from: m1.address, to: kye.address, success: true });
    const j2 = await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    expect(j2.transactions).toHaveTransaction({ from: m2.address, to: kye.address, success: true });
    const j3 = await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });
    expect(j3.transactions).toHaveTransaction({ from: m3.address, to: kye.address, success: true });

    const joined = [
      ...parseEmits(j1.transactions, OP.MemberJoined, loadMemberJoined),
      ...parseEmits(j2.transactions, OP.MemberJoined, loadMemberJoined),
      ...parseEmits(j3.transactions, OP.MemberJoined, loadMemberJoined),
    ];
    expect(joined.length).toBe(3);

    const activated = parseEmits(j3.transactions, OP.KyeActivated, loadKyeActivated);
    expect(activated.length).toBe(1);
    expect(await kye.getStatusGet()).toBe(1n);
  });

  it('happy path: all 3 contribute, executeRound pays winner full net pool', async () => {
    const kye = await deployKyeDirect({ feeRateBps: 300n });
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    // All three pre-fund round 1.
    const c = toNano('1');
    const FEE = toNano('0.05'); // forward fee budget
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m3.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    const balBefore = await m1.getBalance();
    const treasuryBefore = await treasury.getBalance();
    const orgBefore = await organizer.getBalance();

    const res = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(res.transactions).toHaveTransaction({ to: kye.address, success: true });

    const rounds = parseEmits(res.transactions, OP.RoundExecuted, loadRoundExecuted);
    expect(rounds.length).toBe(1);
    expect(rounds[0]!.roundNum).toBe(1n);
    expect(rounds[0]!.winner.toString()).toBe(m1.address.toString());

    const pool = c * 3n;
    const platformFee = (pool * 50n) / 10000n;
    const organizerFee = (pool * (300n - 50n)) / 10000n;
    const netPool = pool - platformFee - organizerFee;
    expect(rounds[0]!.payout).toBe(netPool);

    // winner m1 should receive ~netPool (minus tiny tx fees on the inbound transfer)
    const balAfter = await m1.getBalance();
    expect(balAfter - balBefore).toBeGreaterThan(netPool - toNano('0.05'));

    // treasury and organizer fees credited
    expect((await treasury.getBalance()) - treasuryBefore).toBeGreaterThan(platformFee - toNano('0.01'));
    expect((await organizer.getBalance()) - orgBefore).toBeGreaterThan(organizerFee - toNano('0.01'));

    expect(await kye.getCurrentRoundGet()).toBe(2n);
  });

  it('ProRata default: missing contributor reduces pool', async () => {
    const kye = await deployKyeDirect({ feeRateBps: 300n, defaultPolicy: 0n });
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const FEE = toNano('0.05');
    // Only m1 and m2 contribute. m3 defaults.
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    // F-08: advance past the 5-min grace window before executing with defaulters.
    blockchain.now = Math.floor(Date.now() / 1000) + 400;
    const res = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(res.transactions).toHaveTransaction({ to: kye.address, success: true });

    const defaulters = parseEmits(res.transactions, OP.DefaultDetected, loadDefaultDetected);
    expect(defaulters.length).toBe(1);
    expect(defaulters[0]!.member.toString()).toBe(m3.address.toString());

    const rounds = parseEmits(res.transactions, OP.RoundExecuted, loadRoundExecuted);
    const reducedPool = c * 2n;
    const platformFee = (reducedPool * 50n) / 10000n;
    const organizerFee = (reducedPool * (300n - 50n)) / 10000n;
    const netPool = reducedPool - platformFee - organizerFee;
    expect(rounds[0]!.payout).toBe(netPool);
  });

  it('emergencyCancel: organizer cancels, contributions refunded', async () => {
    const kye = await deployKyeDirect();
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const FEE = toNano('0.05');
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    const res = await kye.send(organizer.getSender(), { value: toNano('0.5') }, { $$type: 'EmergencyCancel', reason: 0n });
    expect(res.transactions).toHaveTransaction({ from: organizer.address, to: kye.address, success: true });

    const cancelled = parseEmits(res.transactions, OP.KyeCancelled, loadKyeCancelled);
    expect(cancelled.length).toBe(1);
    expect(await kye.getStatusGet()).toBe(3n);

    // F-02: pull refunds — members claim their refund explicitly.
    expect(await kye.getRefundOf(m1.address)).toBe(c);
    expect(await kye.getRefundOf(m2.address)).toBe(c);

    const balBeforeM1 = await m1.getBalance();
    const balBeforeM2 = await m2.getBalance();
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'ClaimRefund', queryId: 0n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'ClaimRefund', queryId: 0n });
    expect((await m1.getBalance()) - balBeforeM1).toBeGreaterThan(c - toNano('0.1'));
    expect((await m2.getBalance()) - balBeforeM2).toBeGreaterThan(c - toNano('0.1'));
  });

  it('emergencyCancel from non-organizer rejected', async () => {
    const kye = await deployKyeDirect();
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    const res = await kye.send(m1.getSender(), { value: toNano('0.2') }, { $$type: 'EmergencyCancel', reason: 0n });
    expect(res.transactions).toHaveTransaction({ from: m1.address, to: kye.address, success: false });
  });

  it('F-03: Contribute refunds overpayment beyond contribution + fees', async () => {
    const kye = await deployKyeDirect();
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const overpay = toNano('0.5');
    const balBefore = await m1.getBalance();
    const res = await kye.send(
      m1.getSender(),
      { value: c + overpay },
      { $$type: 'Contribute', roundNum: 1n },
    );
    expect(res.transactions).toHaveTransaction({ from: m1.address, to: kye.address, success: true });
    // The contract should have sent an outbound message back to m1 (the refund).
    const refundBack = res.transactions.some((tx: any) => {
      const outs: any[] = Array.from(tx.outMessages?.values?.() ?? []);
      return outs.some((m) => m.info?.dest?.toString?.() === m1.address.toString());
    });
    expect(refundBack).toBe(true);
    // m1's net spend should be close to `c` (contribution), well under c + overpay.
    const balAfter = await m1.getBalance();
    const spent = balBefore - balAfter;
    expect(spent).toBeLessThan(c + toNano('0.2'));
  });

  it('F-02: emergencyCancel uses pull refunds; ClaimRefund pays out', async () => {
    const kye = await deployKyeDirect();
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const FEE = toNano('0.05');
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    const cancel = await kye.send(
      organizer.getSender(),
      { value: toNano('0.5') },
      { $$type: 'EmergencyCancel', reason: 0n },
    );
    expect(cancel.transactions).toHaveTransaction({ from: organizer.address, to: kye.address, success: true });
    expect(await kye.getStatusGet()).toBe(3n);

    // m1 has a refund queued of `c`; m2 / m3 have nothing.
    expect(await kye.getRefundOf(m1.address)).toBe(c);
    expect(await kye.getRefundOf(m2.address)).toBe(0n);

    const balBefore = await m1.getBalance();
    const claim = await kye.send(
      m1.getSender(),
      { value: toNano('0.05') },
      { $$type: 'ClaimRefund', queryId: 0n },
    );
    expect(claim.transactions).toHaveTransaction({ from: m1.address, to: kye.address, success: true });
    const balAfter = await m1.getBalance();
    expect(balAfter - balBefore).toBeGreaterThan(c - toNano('0.1'));

    // Cannot claim twice.
    const claim2 = await kye.send(
      m1.getSender(),
      { value: toNano('0.05') },
      { $$type: 'ClaimRefund', queryId: 0n },
    );
    expect(claim2.transactions).toHaveTransaction({ from: m1.address, to: kye.address, success: false });
  });

  it('F-08: execute with defaulters requires grace window', async () => {
    const kye = await deployKyeDirect({ feeRateBps: 300n, defaultPolicy: 0n });
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const FEE = toNano('0.05');
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    // m3 has not contributed; immediate execute should fail grace check.
    const tooEarly = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(tooEarly.transactions).toHaveTransaction({ to: kye.address, success: false });

    blockchain.now = Math.floor(Date.now() / 1000) + 400;
    const ok = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(ok.transactions).toHaveTransaction({ to: kye.address, success: true });
  });

  it('F-05: OrganizerCover pays full intended payout via cap when balance short', async () => {
    const kye = await deployKyeDirect({ feeRateBps: 300n, defaultPolicy: 2n });
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    await kye.send(m3.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 3n });

    const c = toNano('1');
    const FEE = toNano('0.05');
    // Only 2 of 3 pay; OrganizerCover pool = 3 * c.
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    blockchain.now = Math.floor(Date.now() / 1000) + 400;
    const res = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(res.transactions).toHaveTransaction({ to: kye.address, success: true });

    expect(await kye.getShortfall()).toBe(c);

    // Organizer tops up: shortfall should decrease.
    await kye.send(organizer.getSender(), { value: c + toNano('0.05') }, { $$type: 'TopUp', queryId: 0n });
    expect(await kye.getShortfall()).toBe(0n);
  });

  it('F-13: distinct salts yield distinct child addresses', async () => {
    const factory = await deployFactory(blockchain, deployer, treasury);
    const a1 = await factory.getKyeAddressOf(
      organizer.address, 3n, toNano('1'), BigInt(WEEK), 300n, 0n, 0n, 1n,
    );
    const a2 = await factory.getKyeAddressOf(
      organizer.address, 3n, toNano('1'), BigInt(WEEK), 300n, 0n, 0n, 2n,
    );
    expect(a1.toString()).not.toBe(a2.toString());
  });

  it('boundary: N=2 minimum members lifecycle', async () => {
    const kye = await deployKyeDirect({ memberCount: 2n, feeRateBps: 300n });
    await kye.send(m1.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 1n });
    await kye.send(m2.getSender(), { value: toNano('0.05') }, { $$type: 'JoinKye', orderNum: 2n });
    expect(await kye.getStatusGet()).toBe(1n);

    const c = toNano('1');
    const FEE = toNano('0.05');
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 1n });

    const r1 = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(parseEmits(r1.transactions, OP.RoundExecuted, loadRoundExecuted).length).toBe(1);
    expect(await kye.getCurrentRoundGet()).toBe(2n);

    // Advance time to round 2 eligibility
    blockchain.now = Math.floor(Date.now() / 1000) + WEEK + 10;
    await kye.send(m1.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 2n });
    await kye.send(m2.getSender(), { value: c + FEE }, { $$type: 'Contribute', roundNum: 2n });

    const r2 = await kye.send(deployer.getSender(), { value: toNano('0.5') }, { $$type: 'ExecuteRound', nonce: 0n });
    expect(parseEmits(r2.transactions, OP.RoundExecuted, loadRoundExecuted).length).toBe(1);
    expect(parseEmits(r2.transactions, OP.KyeCompleted, loadKyeCompleted).length).toBe(1);
    expect(await kye.getStatusGet()).toBe(2n);
  });
});
