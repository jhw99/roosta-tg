import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiError {
  error: string;
  code: string;
}

export const fail = (
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
): Response => c.json<ApiError>({ error: message, code }, status);
