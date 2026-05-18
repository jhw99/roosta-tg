/**
 * TonConnect mock harness.
 *
 * The TonConnect SDK fetches https://config.ton.org/wallets-v2.json and
 * opens a popup that needs a real wallet on the other side. For E2E, we
 * intercept those calls and pre-populate localStorage with a synthetic
 * "wallet connected" state so `useTonAddress()` returns immediately.
 *
 * Limitations:
 *   - This only fakes the connection state. Real signTransaction() calls
 *     still fail (no real wallet bridge); specs that need a signed tx
 *     should mock the tonConnectUI methods directly OR use the gasless
 *     `signAndRelay` path (session key, no popup).
 *   - Address validation in the TMA happens via @ton/core; we use a real
 *     non-bounceable testnet address constant below.
 */
import type { Page } from '@playwright/test';

// Real-looking TON testnet address (non-bounceable, masterchain).
// Picked from a known mock — does not need to exist on chain for UI-only
// flows. Specs that actually want a deployed wallet should override.
export const MOCK_OWNER_ADDRESS = '0QDmock00000000000000000000000000000000000000000A';

const TONCONNECT_LS_KEY = 'ton-connect-storage_bridge-connection';

/**
 * Inject pre-connection state BEFORE the app boots so the TonConnect
 * provider initialises with an "already connected" wallet.
 */
export async function installTonConnectMock(
  page: Page,
  owner: string = MOCK_OWNER_ADDRESS,
): Promise<void> {
  // 1. Stub the wallets-v2 manifest fetch so the SDK doesn't 4xx/CORS in CI.
  await page.route('https://config.ton.org/wallets-v2.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    }),
  );

  // 2. Seed localStorage with a synthetic bridge-connection blob shaped like
  //    what @tonconnect/sdk persists after a successful injected connect.
  //    The TMA only reads `connectItems.tonAddr.address` to derive the
  //    owner address, so we keep the rest minimal.
  await page.addInitScript(
    ({ key, owner }) => {
      const blob = {
        type: 'injected',
        device: {
          platform: 'browser',
          appName: 'qa-mock',
          appVersion: '1.0.0',
          maxProtocolVersion: 2,
          features: [],
        },
        provider: 'injected',
        jsBridgeKey: 'qa',
        connectEvent: {
          event: 'connect',
          id: 1,
          payload: {
            items: [
              {
                name: 'ton_addr',
                address: owner,
                network: '-3', // testnet
                walletStateInit: '',
              },
            ],
            device: {
              platform: 'browser',
              appName: 'qa-mock',
              appVersion: '1.0.0',
              maxProtocolVersion: 2,
              features: [],
            },
          },
        },
        nextRpcRequestId: 0,
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(blob));
      } catch {
        // swallow — some sandboxes restrict storage
      }
    },
    { key: TONCONNECT_LS_KEY, owner },
  );
}

/** Convenience: clear any previously-injected TonConnect state. */
export async function clearTonConnectMock(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, TONCONNECT_LS_KEY);
}
