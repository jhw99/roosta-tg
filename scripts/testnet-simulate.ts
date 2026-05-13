/**
 * Multi-member testnet simulation.
 *
 * 1. Generate 3 fresh member keypairs.
 * 2. Fund each from the deployer wallet (0.5 TON each).
 * 3. Deploy a fresh kye via KyeFactory.createKye (3 members, 0.05 TON, 7d interval).
 * 4. Each generated member sends JoinKye with their order (1..3).
 * 5. Read getters to verify status=Active, joinedCount=3, members filled.
 *
 * Required env:
 *   WALLET_MNEMONIC      deployer mnemonic
 *   TON_API_KEY          toncenter v2 API key
 *   TON_FACTORY_ADDRESS  factory address (testnet, EQ...)
 *
 * Optional:
 *   PLATFORM_TREASURY_ADDRESS (default = deployer's address)
 */
import { mnemonicNew, mnemonicToWalletKey, type KeyPair } from '@ton/crypto';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { Address, beginCell, toNano, type Cell } from '@ton/core';

const ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const WEEK = 7n * 24n * 60n * 60n;

const OP_CREATE_KYE = 1778788698;
const OP_JOIN_KYE = 1824226712;

function buildCreateKyeBody(p: {
  organizer: Address;
  memberCount: bigint;
  contribution: bigint;
  roundIntervalSec: bigint;
  feeRateBps: bigint;
  timeAdjustmentMaxBps: bigint;
  defaultPolicy: bigint;
  salt: bigint;
}): Cell {
  return beginCell()
    .storeUint(OP_CREATE_KYE, 32)
    .storeAddress(p.organizer)
    .storeUint(p.memberCount, 8)
    .storeCoins(p.contribution)
    .storeUint(p.roundIntervalSec, 32)
    .storeUint(p.feeRateBps, 16)
    .storeUint(p.timeAdjustmentMaxBps, 16)
    .storeUint(p.defaultPolicy, 8)
    .storeUint(p.salt, 64)
    .endCell();
}

function buildJoinKyeBody(orderNum: number): Cell {
  return beginCell().storeUint(OP_JOIN_KYE, 32).storeUint(orderNum, 8).endCell();
}

async function waitForSeqno(
  client: TonClient,
  address: Address,
  prevSeqno: number,
  label: string,
  timeoutMs = 120_000,
): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await client.runMethod(address, 'seqno');
      const s = Number(res.stack.readNumber());
      if (s > prevSeqno) {
        console.log(`  [${label}] confirmed (seqno ${prevSeqno} -> ${s})`);
        return s;
      }
    } catch {
      // account may not yet be initialized
    }
  }
  throw new Error(`[${label}] timed out waiting for seqno > ${prevSeqno}`);
}

async function main() {
  const mnemonic = (process.env.WALLET_MNEMONIC ?? '').trim();
  const apiKey = process.env.TON_API_KEY;
  const factoryRaw = process.env.TON_FACTORY_ADDRESS ?? '';
  if (!mnemonic || !apiKey || !factoryRaw) {
    throw new Error('Set WALLET_MNEMONIC, TON_API_KEY, TON_FACTORY_ADDRESS');
  }

  const factory = Address.parse(factoryRaw);
  const client = new TonClient({ endpoint: ENDPOINT, apiKey });

  const deployerKey = await mnemonicToWalletKey(mnemonic.split(/\s+/));
  const deployerWallet = WalletContractV4.create({ workchain: 0, publicKey: deployerKey.publicKey });
  const deployerOpened = client.open(deployerWallet);
  console.log('[deployer]', deployerWallet.address.toString({ testOnly: true }));

  // Step 1: generate 3 fresh member keypairs
  console.log('\n[step 1] generating 3 fresh member keypairs...');
  const memberKeys: KeyPair[] = [];
  const memberWallets: WalletContractV4[] = [];
  const memberMnemonics: string[][] = [];
  for (let i = 0; i < 3; i++) {
    const mn = await mnemonicNew(24);
    const k = await mnemonicToWalletKey(mn);
    const w = WalletContractV4.create({ workchain: 0, publicKey: k.publicKey });
    memberMnemonics.push(mn);
    memberKeys.push(k);
    memberWallets.push(w);
    console.log(`  member${i + 1}:`, w.address.toString({ testOnly: true }));
  }

  // Step 2: fund each from deployer (single batched transfer of 3 internal messages)
  console.log('\n[step 2] funding members (0.25 TON each)...');
  let seqno = await deployerOpened.getSeqno();
  await deployerOpened.sendTransfer({
    seqno,
    secretKey: deployerKey.secretKey,
    messages: memberWallets.map((w) =>
      internal({ to: w.address, value: toNano('0.25'), bounce: false }),
    ),
  });
  seqno = await waitForSeqno(client, deployerWallet.address, seqno, 'fund');

  // Step 3: createKye with deployer as organizer
  const salt = BigInt(Date.now());
  const params = {
    organizer: deployerWallet.address,
    memberCount: 3n,
    contribution: toNano('0.05'),
    roundIntervalSec: WEEK,
    feeRateBps: 300n,
    timeAdjustmentMaxBps: 500n,
    defaultPolicy: 0n,
    salt,
  };

  // Predict kye address using factory getter kyeAddressOf
  console.log('\n[step 3] querying kyeAddressOf for predicted child address...');
  const argsBuilder: any[] = [
    { type: 'slice', cell: beginCell().storeAddress(params.organizer).endCell() },
    { type: 'int', value: params.memberCount },
    { type: 'int', value: params.contribution },
    { type: 'int', value: params.roundIntervalSec },
    { type: 'int', value: params.feeRateBps },
    { type: 'int', value: params.timeAdjustmentMaxBps },
    { type: 'int', value: params.defaultPolicy },
    { type: 'int', value: params.salt },
  ];
  const predicted = await client.runMethod(factory, 'kyeAddressOf', argsBuilder);
  const kyeAddr = predicted.stack.readAddress();
  console.log('  predicted kye:', kyeAddr.toString({ testOnly: true }));

  console.log('\n[step 3] sending CreateKye to factory...');
  seqno = await deployerOpened.getSeqno();
  await deployerOpened.sendTransfer({
    seqno,
    secretKey: deployerKey.secretKey,
    messages: [
      internal({ to: factory, value: toNano('0.35'), body: buildCreateKyeBody(params), bounce: true }),
    ],
  });
  seqno = await waitForSeqno(client, deployerWallet.address, seqno, 'createKye');

  // Give factory ~12s to dispatch deploy to child
  console.log('  waiting 15s for child kye to deploy...');
  await new Promise((r) => setTimeout(r, 15_000));

  // Step 4: each member joins
  console.log('\n[step 4] members joining...');
  for (let i = 0; i < 3; i++) {
    const w = memberWallets[i];
    const k = memberKeys[i];
    const opened = client.open(w);
    const order = i + 1;
    let mSeqno = 0;
    try {
      mSeqno = await opened.getSeqno();
    } catch {
      mSeqno = 0;
    }
    console.log(`  member${order} seqno before join: ${mSeqno}`);
    await opened.sendTransfer({
      seqno: mSeqno,
      secretKey: k.secretKey,
      messages: [
        internal({ to: kyeAddr, value: toNano('0.15'), body: buildJoinKyeBody(order), bounce: true }),
      ],
    });
    await waitForSeqno(client, w.address, mSeqno, `member${order}-join`);
  }

  // Allow child kye contract to process all joins
  console.log('\n  waiting 12s for child kye to process all joins...');
  await new Promise((r) => setTimeout(r, 12_000));

  // Step 5: read getters
  console.log('\n[step 5] reading kye state...');
  const statusRes = await client.runMethod(kyeAddr, 'statusGet');
  const status = Number(statusRes.stack.readNumber());
  const roundRes = await client.runMethod(kyeAddr, 'currentRoundGet');
  const round = Number(roundRes.stack.readNumber());
  const joinedRes = await client.runMethod(kyeAddr, 'joinedCountGet');
  const joined = Number(joinedRes.stack.readNumber());
  console.log(`  status = ${status}  (1=Joining, 2=Active, 3=Completed, 4=Cancelled)`);
  console.log(`  currentRound = ${round}`);
  console.log(`  joinedCount = ${joined}`);

  const memberAddrs: string[] = [];
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await client.runMethod(kyeAddr, 'memberAt', [{ type: 'int', value: BigInt(i) }]);
      const addr = r.stack.readAddressOpt();
      memberAddrs.push(addr ? addr.toString({ testOnly: true }) : '(null)');
    } catch (e: any) {
      memberAddrs.push(`(error: ${e?.message ?? e})`);
    }
  }
  console.log('  members:');
  memberAddrs.forEach((a, i) => console.log(`    ${i + 1}: ${a}`));

  // Output summary JSON for capture by parent process
  console.log('\n=== SIMULATION_RESULT_JSON ===');
  console.log(
    JSON.stringify(
      {
        kye_address: kyeAddr.toString({ testOnly: true }),
        status,
        currentRound: round,
        joinedCount: joined,
        members: memberWallets.map((w, i) => ({
          order: i + 1,
          address: w.address.toString({ testOnly: true }),
          mnemonic: memberMnemonics[i].join(' '),
        })),
        on_chain_members: memberAddrs,
        salt: salt.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('[sim] FAILED:', e?.message ?? e);
  console.error(e?.stack);
  process.exit(1);
});
