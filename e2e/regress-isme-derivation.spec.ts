import { test, expect } from './fixtures/strict-page';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Regression for commit 3201bf5 — `me` must be derived locally on the
 * kye detail page.
 *
 * Backend's GET /kyes/:id became public (fix 4feb400) and therefore
 * cannot stamp `members[].isMe`. The TMA used to rely solely on the
 * backend stamp, so the Contribute CTA never rendered. The fix
 * compares each member's userId against the logged-in /me user.id
 * locally and keeps backend stamp as a fallback.
 *
 * Companion regression: the global /me fetch in Providers.tsx — without
 * it, direct navigation to /kye/<addr> leaves the store's user=null
 * and the local isMe derivation has nothing to compare against.
 */
const KYE_PAGE = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'app', 'kye', '[address]', 'page.tsx',
);
const PROVIDERS = path.join(
  __dirname, '..', 'apps', 'tma', 'src', 'components', 'Providers.tsx',
);

test.describe('regress-isme-derivation — kye detail', () => {
  test('me derivation falls back to local userId compare', () => {
    const src = fs.readFileSync(KYE_PAGE, 'utf8');
    // The fix shape: `m.isMe || (user && m.userId === user.id)`
    expect(src).toMatch(/m\.isMe\s*\|\|\s*\(user\s*&&\s*m\.userId\s*===\s*user\.id\)/);
    // And it must NOT regress to "isMe only" (the bug shape).
    expect(src).not.toMatch(/members\.find\(\(m\)\s*=>\s*m\.isMe\)\s*\?\?\s*null;/);
  });
});

test.describe('regress-isme-derivation — Providers global /me fetch', () => {
  test('Providers fetches /me on mount when initData present', () => {
    const src = fs.readFileSync(PROVIDERS, 'utf8');
    // Must import api.me and call it from a useEffect hooked up at
    // app boot so every route has user/kyes hydrated, not just `/`.
    expect(src).toMatch(/api\.me\(\)/);
    expect(src).toMatch(/setUser\(data\.user\)/);
    // And it must only run when initData exists (avoid spurious 401s
    // outside Telegram).
    expect(src).toMatch(/getInitData\(\)/);
  });
});
