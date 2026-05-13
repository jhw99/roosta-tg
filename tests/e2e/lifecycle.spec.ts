// Epic 7B — Story 7.1
// End-to-end sandbox integration test: full 5-member, 5-round kye lifecycle.
//
// Scenario: 5 members join in Preassigned order, each round all 5 contribute,
// executeRound is called, and the winner is members[k-1]. Payout follows the
// GSD §2.4 zero-sum time adjustment:
//   adjustmentBps(k) = (2k - N - 1) * alphaMax / (N - 1)
//   payout(k)        = netPool * (10000 + adjustmentBps(k)) / 10000
// With N=5, alphaMax=1000bps the adjustments are -1000, -500, 0, +500, +1000
// (i.e. 90%, 95%, 100%, 105%, 110% of netPool), summing to zero.

import { describe, it, expect } from 'vitest';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Cell } from '@ton/core';
import '@ton/test-utils';

import {
  KyeContract,
  KyeInit,
  loadKyeActivated,
  loadRoundExecuted,
  loadPayoutSent,
  loadFeeDistributed,
  loadKyeCompleted,
  loadMemberJoined,
} from '../../packages/contracts/build/KyeContract/KyeContract_KyeContract';
import { KyeFactory, loadKyeCreatedEvt } from '../../packages/contracts/build/KyeFactory/KyeFactory_KyeFactory';

const WEEK = 7 * 24 * 60 * 60;

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

function parseEmits<T>(transactions: any[], opcode: number, parser: (slice: any) => T): T[] {
  const out: T[] = [];
  for (const tx of transactions) {
    const outMsgs: any[] = Array.from(tx.outMessages?.values?.() ?? []);
    for (const m of outMsgs) {
      if (m.info?.type !== 'external-out') continue;
      const body: Cell = m.body;
      try {
        const slice = body.beginParse();
        if (slice.remainingBits < 32) continue;
        const op = slice.preloadUint(32);
        if (op !== opcode) continue;
        out.push(parser(body.beginParse()));
      } catch (_) {
        /* ignore non-emit external-out */
      }
    }
  }
  return out;
}

// Collect emits in transaction order: returns list of {opcode, tx_idx, msg_idx}
function collectEmitOpcodes(transactions: any[]): number[] {
  const ops: number[] = [];
  for (const tx of transactions) {
    const outMsgs: any[] = Array.from(tx.outMessages?.values?.() ?? []);
    for (const m of outMsgs) {
      if (m.info?.type !== 'external-out') continue;
      try {
        const slice = (m.body as Cell).beginParse();
        if (slice.remainingBits < 32) continue;
        ops.push(slice.preloadUint(32));
      } catch (_) {}
    }
  }
  return ops;
}

describe('E2E lifecycle: 5-member, 5-round kye (sandbox)', () => {
  it('completes the full lifecycle with correct payouts and events', async () => {
    // ---------- 1. Start sandbox blockchain ----------
    const blockchain = await Blockchain.create();
    const T0 = 1_900_000_000; // arbitrary deterministic anchor (year ~2030)
    blockchain.now = T0;

    const deployer = await blockchain.treasury('deployer');
    const organizer = await blockchain.treasury('organizer');
    const platformTreasury = await blockchain.treasury('platform-treasury');
    const members: SandboxContract<TreasuryContract>[] = [];
    for (let i = 1; i <= 5; i++) {
      members.push(await blockchain.treasury(`m${i}`));
    }

    const CONTRIBUTION = toNano('10');
    const GAS = toNano('0.1');
    const FEE_BPS = 300n; // 3%
    const PLATFORM_BPS = 50n; // 0.5% of pool to platform
    const ORG_BPS = FEE_BPS - PLATFORM_BPS; // 2.5% to organizer
    const ALPHA_MAX = 1000n; // 10%
    const N = 5n;

    // ---------- 2. Deploy KyeFactory ----------
    const factory = blockchain.openContract(
      await KyeFactory.fromInit(organizer.address, platformTreasury.address),
    );
    const factoryDeploy = await factory.send(
      deployer.getSender(),
      { value: toNano('1') },
      { $$type: 'Deploy', queryId: 0n },
    );
    expect(factoryDeploy.transactions).toHaveTransaction({
      from: deployer.address,
      to: factory.address,
      deploy: true,
      success: true,
    });
    console.log('[Setup] KyeFactory deployed at', factory.address.toString());

    // ---------- 3. Deploy Kye via factory ----------
    const createRes = await factory.send(
      organizer.getSender(),
      { value: toNano('0.5') },
      {
        $$type: 'CreateKye',
        organizer: organizer.address,
        memberCount: N,
        contribution: CONTRIBUTION,
        roundIntervalSec: BigInt(WEEK),
        feeRateBps: FEE_BPS,
        timeAdjustmentMaxBps: ALPHA_MAX,
        defaultPolicy: 0n, // ProRata
        salt: 42n,
      },
    );
    expect(createRes.transactions).toHaveTransaction({
      from: organizer.address,
      to: factory.address,
      success: true,
    });
    const createEvts = parseEmits(createRes.transactions, OP.KyeCreatedEvt, loadKyeCreatedEvt);
    expect(createEvts.length).toBe(1);
    const childAddr = await factory.getKyeAddressOf(
      organizer.address,
      N,
      CONTRIBUTION,
      BigInt(WEEK),
      FEE_BPS,
      ALPHA_MAX,
      0n,
      42n,
    );
    const kye = blockchain.openContract(KyeContract.fromAddress(childAddr));
    expect(await kye.getStatusGet()).toBe(0n);
    expect(await kye.getMemberCountGet()).toBe(N);
    console.log('[Setup] Kye deployed at', kye.address.toString());

    // ---------- 4. Five members join in order 1..5 ----------
    let activatedStartTs: bigint | null = null;
    for (let i = 0; i < 5; i++) {
      const orderNum = BigInt(i + 1);
      const res = await kye.send(
        members[i]!.getSender(),
        { value: toNano('0.05') },
        { $$type: 'JoinKye', orderNum },
      );
      expect(res.transactions).toHaveTransaction({
        from: members[i]!.address,
        to: kye.address,
        success: true,
      });
      const joined = parseEmits(res.transactions, OP.MemberJoined, loadMemberJoined);
      expect(joined.length).toBe(1);
      console.log(`[Join] m${i + 1} joined as order ${orderNum}`);

      if (i === 4) {
        // ---------- 5. KyeActivated after 5th join ----------
        const activated = parseEmits(res.transactions, OP.KyeActivated, loadKyeActivated);
        expect(activated.length).toBe(1);
        activatedStartTs = activated[0]!.startTimestamp;
        console.log('[Activate] KyeActivated; startTimestamp =', activatedStartTs.toString());
      }
    }
    expect(activatedStartTs).not.toBeNull();
    expect(await kye.getStatusGet()).toBe(1n);
    // startTimestamp should equal T0 (since blockchain.now was T0 at activation)
    expect(activatedStartTs).toBe(BigInt(T0));

    const startTs = Number(activatedStartTs!);

    // ---------- 6. Round loop ----------
    for (let k = 1; k <= 5; k++) {
      // a. advance time to startTs + (k-1)*interval + 1
      blockchain.now = startTs + (k - 1) * WEEK + 1;
      console.log(`\n[Round ${k}] advancing blockchain.now -> ${blockchain.now}`);

      // b. each member contributes
      for (let i = 0; i < 5; i++) {
        const r = await kye.send(
          members[i]!.getSender(),
          { value: CONTRIBUTION + GAS },
          { $$type: 'Contribute', roundNum: BigInt(k) },
        );
        expect(r.transactions).toHaveTransaction({
          from: members[i]!.address,
          to: kye.address,
          success: true,
        });
      }
      console.log(`[Round ${k}] all 5 members contributed ${CONTRIBUTION} nanoTON each`);

      // Snapshot balances before executeRound
      const winner = members[k - 1]!;
      const winnerBalBefore = await winner.getBalance();
      const treasuryBefore = await platformTreasury.getBalance();
      const orgBefore = await organizer.getBalance();

      // c. anyone calls executeRound
      const exRes = await kye.send(
        deployer.getSender(),
        { value: toNano('0.5') },
        { $$type: 'ExecuteRound', nonce: 0n },
      );
      expect(exRes.transactions).toHaveTransaction({ to: kye.address, success: true });

      // d. assert events fired (RoundExecuted, FeeDistributed, PayoutSent).
      //    Emit order in the contract source: FeeDistributed, PayoutSent, RoundExecuted.
      //    We assert all three are present and log the order.
      const opsInOrder = collectEmitOpcodes(exRes.transactions).filter(
        (op) =>
          op === OP.RoundExecuted ||
          op === OP.FeeDistributed ||
          op === OP.PayoutSent ||
          op === OP.KyeCompleted,
      );
      console.log(`[Round ${k}] emit opcodes in order:`, opsInOrder.map((o) => {
        if (o === OP.FeeDistributed) return 'FeeDistributed';
        if (o === OP.PayoutSent) return 'PayoutSent';
        if (o === OP.RoundExecuted) return 'RoundExecuted';
        if (o === OP.KyeCompleted) return 'KyeCompleted';
        return String(o);
      }));

      const roundEvts = parseEmits(exRes.transactions, OP.RoundExecuted, loadRoundExecuted);
      const feeEvts = parseEmits(exRes.transactions, OP.FeeDistributed, loadFeeDistributed);
      const payoutEvts = parseEmits(exRes.transactions, OP.PayoutSent, loadPayoutSent);
      expect(roundEvts.length).toBe(1);
      expect(feeEvts.length).toBe(1);
      expect(payoutEvts.length).toBe(1);

      // e. winner == members[k-1]
      expect(roundEvts[0]!.winner.toString()).toBe(winner.address.toString());
      expect(roundEvts[0]!.roundNum).toBe(BigInt(k));

      // f. expected payout per GSD 2.4
      const pool = CONTRIBUTION * N;
      const platformFee = (pool * PLATFORM_BPS) / 10000n;
      const organizerFee = (pool * ORG_BPS) / 10000n;
      const netPool = pool - platformFee - organizerFee;
      const adjustmentBps = ((2n * BigInt(k) - N - 1n) * ALPHA_MAX) / (N - 1n);
      const expectedPayout = (netPool * (10000n + adjustmentBps)) / 10000n;
      expect(roundEvts[0]!.payout).toBe(expectedPayout);
      expect(payoutEvts[0]!.amount).toBe(expectedPayout);

      // Winner balance delta. The winner also paid CONTRIBUTION+GAS earlier in this
      // round, but that happened *before* winnerBalBefore was sampled — so the
      // delta we measure here is purely the inbound payout (minus the trivial
      // forward fee on the inbound msg).
      const winnerBalAfter = await winner.getBalance();
      const winnerDelta = winnerBalAfter - winnerBalBefore;
      const GAS_TOLERANCE = toNano('0.05');
      expect(winnerDelta).toBeGreaterThan(expectedPayout - GAS_TOLERANCE);

      // g. platform treasury delta
      const treasuryDelta = (await platformTreasury.getBalance()) - treasuryBefore;
      expect(feeEvts[0]!.platform).toBe(platformFee);
      expect(treasuryDelta).toBeGreaterThan(platformFee - GAS_TOLERANCE);

      // h. organizer delta
      const orgDelta = (await organizer.getBalance()) - orgBefore;
      expect(feeEvts[0]!.organizer).toBe(organizerFee);
      expect(orgDelta).toBeGreaterThan(organizerFee - GAS_TOLERANCE);

      console.log(`[Round ${k}] winner=m${k} payout=${expectedPayout} (adj=${adjustmentBps}bps)`);
      console.log(`[Round ${k}] balance deltas: winner=+${winnerDelta}  treasury=+${treasuryDelta}  organizer=+${orgDelta}`);
      console.log(`[Round ${k}] fees: platform=${platformFee} organizer=${organizerFee} netPool=${netPool}`);

      if (k === 5) {
        // ---------- 7. KyeCompleted after round 5 ----------
        const completed = parseEmits(exRes.transactions, OP.KyeCompleted, loadKyeCompleted);
        expect(completed.length).toBe(1);
        expect(await kye.getStatusGet()).toBe(2n); // Completed
        console.log('[Complete] KyeCompleted fired; status=Completed');
      } else {
        expect(await kye.getCurrentRoundGet()).toBe(BigInt(k + 1));
      }
    }

    // Zero-sum sanity: sum of payouts == 5 * netPool
    const pool = CONTRIBUTION * N;
    const platformFee = (pool * PLATFORM_BPS) / 10000n;
    const organizerFee = (pool * ORG_BPS) / 10000n;
    const netPool = pool - platformFee - organizerFee;
    let sumPayouts = 0n;
    for (let k = 1; k <= 5; k++) {
      const adj = ((2n * BigInt(k) - N - 1n) * ALPHA_MAX) / (N - 1n);
      sumPayouts += (netPool * (10000n + adj)) / 10000n;
    }
    expect(sumPayouts).toBe(netPool * N);
    console.log(`\n[Zero-sum] sum(payouts)=${sumPayouts} == netPool*N=${netPool * N}`);
  }, 120_000);
});
