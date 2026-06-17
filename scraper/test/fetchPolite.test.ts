import { describe, it, expect, vi } from 'vitest';
import { fetchPolite } from '../lib/fetchPolite';

describe('fetchPolite', () => {
  it('retries on failure then succeeds', async () => {
    let calls = 0;
    const fakeFetch = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error('network');
      return new Response('ok', { status: 200 });
    });
    const res = await fetchPolite('https://x', { retries: 2, delayMs: 0, fetchImpl: fakeFetch });
    expect(await res.text()).toBe('ok');
    expect(calls).toBe(2);
  });

  it('throws after exhausting retries', async () => {
    const fakeFetch = vi.fn(async () => { throw new Error('down'); });
    await expect(fetchPolite('https://x', { retries: 1, delayMs: 0, fetchImpl: fakeFetch })).rejects.toThrow(/down/);
  });
});
