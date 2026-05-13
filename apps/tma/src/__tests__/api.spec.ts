import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest, ApiError } from '../lib/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiRequest', () => {
  it('attaches x-telegram-init-data header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest('/me', z.object({ ok: z.boolean() }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInitDataImpl: () => 'INIT_DATA_FIXTURE',
      retries: 0,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers['x-telegram-init-data']).toBe('INIT_DATA_FIXTURE');
  });

  it('retries on 5xx with exponential backoff then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls < 3) return new Response('boom', { status: 503 });
      return jsonResponse({ value: 42 });
    });

    const out = await apiRequest('/thing', z.object({ value: z.number() }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInitDataImpl: () => '',
      retries: 3,
      backoffMs: 1,
    });
    expect(out.value).toBe(42);
    expect(calls).toBe(3);
  });

  it('throws ApiError on 4xx without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 400));
    await expect(
      apiRequest('/x', z.object({ error: z.string() }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInitDataImpl: () => '',
        retries: 3,
        backoffMs: 1,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws when response fails zod validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ wrong: true }));
    await expect(
      apiRequest('/x', z.object({ value: z.number() }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInitDataImpl: () => '',
        retries: 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('eventually gives up after retries exhausted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 502 }));
    await expect(
      apiRequest('/x', z.object({ ok: z.boolean() }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInitDataImpl: () => '',
        retries: 2,
        backoffMs: 1,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
