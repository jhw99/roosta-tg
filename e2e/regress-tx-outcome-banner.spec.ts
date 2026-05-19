/**
 * Sweep #9 — explicit success / failure banner after every tx.
 *
 * User feedback (2026-05-19): "트랜잭션이 실패하거나 성공했을 때 성공했다
 * 실패했다 하는 인터페이스가 있어야 해". The old code:
 *   - failed contribute → just left the same state, no toast
 *   - succeeded contribute → myStatus flipped silently
 *   - insufficient balance → no pre-flight, user wasted gas-equivalent
 *
 * The new flow surfaces:
 *   - immediate pre-flight failure (vault balance < required) as ❌
 *   - success on myStatus='paid' as ✅ contributeSuccess
 *   - watchdog soft-success (balance dropped but indexer slow) as ✅
 *     contributeSubmittedSoft
 *   - watchdog hard-failure (balance unchanged) as ❌ contributeStuck
 *   - signAndRelay throw as ❌ with the error message
 */
import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

const KYE_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'kye', '[address]', 'page.tsx',
);
const WALLET = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'wallet', 'page.tsx',
);

test.describe('regress-tx-outcome-banner — kye contribute', () => {
  test('txOutcome state surfaces success / failure', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/txOutcome/);
    expect(src).toMatch(/setTxOutcome/);
    expect(src).toMatch(/kind:\s*['"]success['"]/);
    expect(src).toMatch(/kind:\s*['"]failed['"]/);
  });

  test('pre-flight insufficient-balance check fires BEFORE signAndRelay', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    // Must compare vault.state.balance against required (contribution + margin).
    expect(src).toMatch(/balance\s*<\s*required[\s\S]{0,150}contributeFailedInsufficient/);
  });

  test('success banner shown when myStatus flips to paid', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/myStatus === ['"]paid['"][\s\S]{0,200}setTxOutcome\([\s\S]{0,80}success/);
    expect(src).toMatch(/contributeSuccess/);
  });

  test('watchdog distinguishes soft-success from hard-failure', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/contributeSubmittedSoft/);
    expect(src).toMatch(/contributeStuck/);
    // decreased path → soft success; not-decreased → failed.
    expect(src).toMatch(/decreased[\s\S]{0,200}contributeStuck/);
  });

  test('signAndRelay throw routes to failed banner', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/catch \(e\)[\s\S]{0,200}setTxOutcome\([\s\S]{0,80}failed/);
  });
});

test.describe('regress-tx-outcome-banner — wallet deposit / withdraw', () => {
  test('msg + err banners render with icons and dismiss buttons', () => {
    const src = fs.readFileSync(WALLET, 'utf8');
    // ✅ green banner for success.
    expect(src).toMatch(/✅/);
    expect(src).toMatch(/text-green-900/);
    // ❌ red banner for error.
    expect(src).toMatch(/❌/);
    expect(src).toMatch(/text-red-900/);
    // Dismiss buttons.
    expect(src).toMatch(/setMsg\(null\)/);
    expect(src).toMatch(/setErr\(null\)/);
  });
});
