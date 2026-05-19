import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for organizer decision panel (2026-05-19).
 *
 * User requested: "탈주하거나 계가 터지는 건 만든 계주가 결정할 수 있게 해줘".
 * Implementation: the kye detail page now renders a visible organizer-
 * only panel on active circles with an explicit "Execute round" CTA
 * driving `buildExecuteRoundBody`. The contract still enforces its
 * own grace_window + default policy on receive, but the organizer is
 * the one who chooses WHEN that fires (instead of the scheduler firing
 * silently and the organizer finding out from a bot DM).
 */
const KYE_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'kye', '[address]', 'page.tsx',
);

test.describe('regress-organizer-decision — source contract', () => {
  test('executeRound action wired into signAndRelay with buildExecuteRoundBody', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    expect(src).toMatch(/buildExecuteRoundBody/);
    expect(src).toMatch(/const executeRound = useCallback/);
    // The signAndRelay call inside executeRound must target the kye contract.
    expect(src).toMatch(/signAndRelay[\s\S]{0,200}buildExecuteRoundBody/);
  });

  test('panel is gated to organizer + status=active', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    // Match the JSX guard: {isOrganizer && kye.status === 'active' && (
    expect(src).toMatch(/\{isOrganizer\s*&&\s*kye\.status\s*===\s*['"]active['"]/);
    expect(src).toMatch(/organizerPanel\b/);
  });

  test('panel shows the CURRENT default policy verbatim', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    // The panel body string must include the policy name (pro_rata / cancel /
    // organizer_cover) so the organizer knows what their click will do.
    expect(src).toMatch(/policyProRata/);
    expect(src).toMatch(/policyCancel/);
    expect(src).toMatch(/policyOrganizerCover/);
  });
});
