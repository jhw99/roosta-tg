import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { initDataMiddleware } from './initData.js';

/**
 * F-20: scoped bot-only bypass middleware.
 *
 * Two acceptance modes:
 *   1. Legacy: `x-service-token` literally equals `SERVICE_TOKEN`. Accepted on
 *      any route this middleware is mounted on (kept for backward compat).
 *   2. Scoped HMAC: `x-service-token` equals `hmac_sha256(SERVICE_TOKEN, scope)`
 *      where `scope` is one of {@link ServiceScope}. The route declares the
 *      required scope; mismatches fall through to initData verification.
 *
 * The bot's BackendClient constructs the right scope header per endpoint:
 *   - GET  /me                          -> "bot:read-user"
 *   - GET  /kyes/:id                    -> "bot:read-kye"
 *   - PUT  /me/notification-settings    -> "bot:update-settings"
 *
 * For a multi-process or multi-tenant setup, replace this with short-lived
 * JWTs signed by a KMS-managed key.
 */
export type ServiceScope =
  | 'bot:read-user'
  | 'bot:read-kye'
  | 'bot:update-settings';

export function signServiceScope(secret: string, scope: ServiceScope): string {
  return createHmac('sha256', secret).update(scope).digest('hex');
}

function constantEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const serviceOrInitDataMiddleware = (
  botToken: string | undefined,
  serviceToken: string | undefined,
  requiredScope?: ServiceScope,
): MiddlewareHandler => {
  const initData = initDataMiddleware(botToken);
  return async (c, next) => {
    const provided = c.req.header('x-service-token');
    const tgIdHdr = c.req.header('x-service-telegram-id');
    if (serviceToken && provided && tgIdHdr) {
      const legacyMatch = constantEq(provided, serviceToken);
      const scopedMatch = requiredScope
        ? constantEq(provided, signServiceScope(serviceToken, requiredScope))
        : false;
      if (legacyMatch || scopedMatch) {
        const tgId = Number(tgIdHdr);
        if (Number.isFinite(tgId)) {
          c.set('tgUser', { user: JSON.stringify({ id: tgId }) });
          await next();
          return;
        }
      }
    }
    return initData(c, next);
  };
};
