const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';

export interface PoliteOptions {
  retries?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchPolite(url: string, opts: PoliteOptions = {}): Promise<Response> {
  const { retries = 2, delayMs = 1500, fetchImpl = fetch, headers = {} } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0 && delayMs > 0) await sleep(delayMs);
      const res = await fetchImpl(url, { headers: { 'user-agent': UA, ...headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
