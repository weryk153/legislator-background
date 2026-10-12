import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchElectionJson } from '../src/lib/fetchElectionJson';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('election request recovery', () => {
  it('讀取 JSON，並在完成後清除逾時計時器', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"areas":[]}')));
    expect(await fetchElectionJson('/map')).toEqual({ areas: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('HTTP 失敗可再次請求成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response('{"ok":true}')));
    await expect(fetchElectionJson('/map')).rejects.toThrow('HTTP 503');
    expect(await fetchElectionJson('/map')).toEqual({ ok: true });
  });
  it('逾時中止卡住的請求，讓畫面可離開載入狀態', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const assertion = expect(fetchElectionJson('/map', 100)).rejects.toThrow('連線逾時，請重試');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
