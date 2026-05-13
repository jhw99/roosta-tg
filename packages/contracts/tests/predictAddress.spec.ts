import { describe, it, expect, beforeEach } from 'vitest';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { contractAddress, toNano } from '@ton/core';
import '@ton/test-utils';

import {
  KyeContract,
  KyeInit,
} from '../build/KyeContract/KyeContract_KyeContract';
import {
  KyeFactory,
  loadKyeCreatedEvt,
} from '../build/KyeFactory/KyeFactory_KyeFactory';

const WEEK = 7 * 24 * 60 * 60;

describe('predictAddress: offline === sandbox', () => {
  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let organizer: SandboxContract<TreasuryContract>;
  let treasury: SandboxContract<TreasuryContract>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    organizer = await blockchain.treasury('organizer');
    treasury = await blockchain.treasury('treasury');
  });

  it('factory child address matches contractAddress(0, KyeContract_init(init))', async () => {
    const factory = blockchain.openContract(
      await KyeFactory.fromInit(deployer.address, treasury.address),
    );
    await factory.send(
      deployer.getSender(),
      { value: toNano('1') },
      { $$type: 'Deploy', queryId: 0n },
    );

    const memberCount = 4n;
    const contribution = toNano('2');
    const roundIntervalSec = BigInt(WEEK);
    const feeRateBps = 250n;
    const timeAdjustmentMaxBps = 100n;
    const defaultPolicy = 0n;

    const init: KyeInit = {
      $$type: 'KyeInit',
      organizer: organizer.address,
      memberCount,
      contribution,
      roundIntervalSec,
      feeRateBps,
      timeAdjustmentMaxBps,
      defaultPolicy,
      platformTreasury: treasury.address,
      salt: 7n,
    };
    const stateInit = await KyeContract.init(init);
    const predicted = contractAddress(0, stateInit);

    const res = await factory.send(
      organizer.getSender(),
      { value: toNano('0.5') },
      {
        $$type: 'CreateKye',
        organizer: organizer.address,
        memberCount,
        contribution,
        roundIntervalSec,
        feeRateBps,
        timeAdjustmentMaxBps,
        defaultPolicy,
        salt: 7n,
      },
    );

    // Parse the KyeCreatedEvt and compare to the offline prediction.
    let observed: string | null = null;
    for (const tx of res.transactions) {
      const outMsgs: any[] = Array.from(tx.outMessages?.values?.() ?? []);
      for (const m of outMsgs) {
        if (m.info?.type !== 'external-out') continue;
        try {
          const slice = m.body.beginParse();
          if (slice.remainingBits < 32) continue;
          const op = slice.preloadUint(32);
          if (op !== 507026390) continue;
          const evt = loadKyeCreatedEvt(m.body.beginParse());
          observed = evt.kyeAddress.toString();
        } catch (_) {}
      }
    }
    expect(observed).not.toBeNull();
    expect(observed).toBe(predicted.toString());
  });
});
