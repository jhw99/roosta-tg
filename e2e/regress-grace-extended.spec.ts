/**
 * Sweep #6 (2026-05-19) — extended grace + organizer Cancel after grace.
 *
 * User decision: don't trust the contract's 5-min hard floor for our
 * UX. Backend scheduler waits ONE FULL round interval after deadline
 * before triggering ExecuteRound. Organizer panel surfaces:
 *  - "before deadline → locked"
 *  - "in grace → countdown, no execute / no cancel"
 *  - "grace expired + defaulter present → Execute round OR Cancel"
 *
 * Source-pinned so a future refactor that drops the grace policy
 * is caught immediately.
 */
import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

const SCHEDULER = path.join(
  __dirname, '..', 'apps', 'backend', 'src', 'scheduler', 'scheduler.ts',
);
const KYE_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'kye', '[address]', 'page.tsx',
);

test.describe('regress-grace-extended — scheduler', () => {
  test('scheduler enforces deadline + roundIntervalSec before triggering', () => {
    const src = fs.readFileSync(SCHEDULER, 'utf8');
    // Must read roundIntervalSec from kye.params.
    expect(src).toMatch(/roundIntervalSec/);
    // Must compute earliest trigger = deadline + intervalSec.
    expect(src).toMatch(/earliestTriggerSec[\s\S]{0,80}intervalSec/);
    // Must `continue` (skip enqueue) when nowSec < earliestTriggerSec.
    expect(src).toMatch(/nowSec\s*<\s*earliestTriggerSec[\s\S]{0,40}continue/);
  });
});

test.describe('regress-grace-extended — organizer panel', () => {
  test('panel computes beforeGrace / inGrace / graceExpired states', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/beforeGrace/);
    expect(src).toMatch(/inGrace/);
    expect(src).toMatch(/graceExpired/);
  });

  test('Execute button is locked before deadline AND in grace', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/canExecute\s*=\s*graceExpired/);
    expect(src).toMatch(/disabled=\{executingRound\s*\|\|\s*!canExecute\}/);
  });

  test('Cancel button gates on graceExpired AND hasDefaulter', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/canCancel\s*=\s*graceExpired\s*&&\s*hasDefaulter/);
  });

  test('countdown is shown to the organizer during grace', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/organizerGraceCountdown/);
  });

  test('myRole panel spells out pay-vs-receive for current member', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/myRolePayThisRound/);
    expect(src).toMatch(/myRoleReceiveAt|myRoleAlreadyReceived/);
    // calculate_payout import to compute the slot-specific payout.
    expect(src).toMatch(/calculate_payout/);
  });
});
