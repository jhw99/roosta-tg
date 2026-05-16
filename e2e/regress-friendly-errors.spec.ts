import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit 4feb400 — friendly user-facing 4xx messages.
 *
 * `friendlyMessage()` in apps/tma/src/lib/api.ts is module-internal so we
 * cannot call it directly. Instead we assert two invariants on the source
 * file that, together, define the user-visible contract:
 *   (a) the helper exists and is wired into the only ApiError throw
 *       site (the `!res.ok` branch).
 *   (b) the four key Korean strings for 401/403/404/5xx are present.
 *
 * This guards against silent regressions where someone changes the throw
 * message back to "API GET … failed: 401" — the unit test would still
 * pass (ApiError is just a class) but the user UX would degrade.
 */

const API_TS = path.join(
  __dirname,
  '..',
  'apps',
  'tma',
  'src',
  'lib',
  'api.ts',
);

test.describe('regress-friendly-errors — api.ts source contract', () => {
  test('friendlyMessage exists and is the source of ApiError.message', () => {
    const src = fs.readFileSync(API_TS, 'utf8');
    expect(src, 'friendlyMessage helper must exist').toContain('function friendlyMessage');
    // The ONLY place ApiError(...) is thrown should pass friendlyMessage(...)
    // as the message (not a literal `API ${method} ...` template).
    expect(src).toMatch(/throw new ApiError\(\s*friendlyMessage\(/);
    expect(src, 'must not regress to the raw "API … failed" template').not.toMatch(
      /throw new ApiError\(`API \$\{method\}/,
    );
  });

  test('Korean strings for the documented status codes are present', () => {
    const src = fs.readFileSync(API_TS, 'utf8');
    // 401/403 GET — invite-link hint
    expect(src).toMatch(/텔레그램.*Roosta.*미니앱/);
    // 401/403 write — session expired
    expect(src).toMatch(/세션이 만료/);
    // 404
    expect(src).toMatch(/찾을 수 없/);
    // 5xx
    expect(src).toMatch(/서버에.*문제|다시 시도/);
  });

  test('server-provided {error} body takes precedence', () => {
    const src = fs.readFileSync(API_TS, 'utf8');
    expect(src, 'friendlyMessage must read body.error first').toMatch(
      /body[^\n]*&&[^\n]*'error' in body/,
    );
  });
});
