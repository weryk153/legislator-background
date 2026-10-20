import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';
import { createReactionHandler, type ReactionEnv } from '../server/reactions';

// 真實 SQLite 執行正式 SQL，避免以模擬計數器掩蓋 upsert/transaction 問題。
let sql: DatabaseSync;
let env: ReactionEnv;
const handle = createReactionHandler(['alice', 'bob', '中文姓名']);
const base = 'https://example.test/api/reactions';
const statement = (query: string, values: SQLInputValue[] = []) => ({
  query, values,
  bind(...next: SQLInputValue[]) { return statement(query, next); },
});
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('migrations/reactions/0001_reactions.sql', 'utf8'));
  env = {
    REACTION_SECRET: 'test-secret-only-not-for-deployment-0123456789',
    REACTIONS_DB: {
      prepare: statement,
      async batch(statements: ReturnType<typeof statement>[]) {
        sql.exec('BEGIN');
        try {
          const result = statements.map(s => ({ results: sql.prepare(s.query).all(...s.values), success: true }));
          sql.exec('COMMIT'); return result;
        } catch (error) { sql.exec('ROLLBACK'); throw error; }
      },
    } as unknown as D1Database,
  };
});
afterEach(() => sql.close());
async function visitor() {
  const result = await handle({ request: new Request(base), env });
  expect(result.status).toBe(200);
  const cookie = result.headers.get('Set-Cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  return cookie.split(';')[0];
}
function vote(cookie: string, choice: unknown, candidate = 'alice', extra: Record<string, string> = {}) {
  return handle({
    request: new Request(`${base}?candidate=${encodeURIComponent(candidate)}`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.test', 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ choice }),
    }), env,
  });
}
const read = (candidate: string, cookie = '') => handle({
  request: new Request(`${base}?candidate=${encodeURIComponent(candidate)}`, { headers: { Cookie: cookie } }), env,
});

describe('公開候選人表態', () => {
  it('支持、重送、改選與取消保持一個瀏覽器一個選擇，取消刪除資料', async () => {
    const cookie = await visitor();
    expect(await (await vote(cookie, 1)).json()).toEqual({ support: 1, oppose: 0, choice: 1 });
    expect(await (await vote(cookie, 1)).json()).toEqual({ support: 1, oppose: 0, choice: 1 });
    expect(await (await vote(cookie, -1)).json()).toEqual({ support: 0, oppose: 1, choice: -1 });
    expect(await (await vote(cookie, 0)).json()).toEqual({ support: 0, oppose: 0, choice: 0 });
    expect(sql.prepare('SELECT * FROM candidate_reactions').all()).toHaveLength(0);
  });
  it('不同訪客共用累計，選擇僅回傳給本人，候選人之間不混票', async () => {
    const a = await visitor(), b = await visitor();
    await vote(a, 1); await vote(b, -1); await vote(a, 1, 'bob');
    expect(await (await read('alice', a)).json()).toEqual({ support: 1, oppose: 1, choice: 1 });
    expect(await (await read('alice', b)).json()).toEqual({ support: 1, oppose: 1, choice: -1 });
    expect(await (await read('alice')).json()).toEqual({ support: 1, oppose: 1, choice: 0 });
    expect(await (await read('bob')).json()).toEqual({ support: 1, oppose: 0, choice: 0 });
    const rows = sql.prepare('SELECT visitor FROM candidate_reactions').all();
    expect(new Set(rows.map(r => r.visitor)).size).toBe(3);
    expect(JSON.stringify(rows)).not.toContain(a.split('=')[1].split('.')[0]);
  });
  it('並行重送不會多算，獨立訪客也不會遺失票數', async () => {
    const cookies = await Promise.all(Array.from({ length: 8 }, visitor));
    await Promise.all(cookies.flatMap(cookie => [vote(cookie, 1), vote(cookie, 1)]));
    expect(await (await read('alice')).json()).toEqual({ support: 8, oppose: 0, choice: 0 });
  });
  it('未知候選人、無效選擇、跨站請求、偽造或缺少 cookie 無法寫入', async () => {
    const cookie = await visitor();
    expect((await vote(cookie, 1, 'unknown')).status).toBe(404);
    expect((await vote(cookie, 3)).status).toBe(400);
    expect((await vote(cookie, '1')).status).toBe(400);
    expect((await vote(cookie, 1, 'alice', { Origin: 'https://other.test' })).status).toBe(403);
    expect((await vote(cookie + 'bad', 1)).status).toBe(401);
    expect((await vote('', 1)).status).toBe(401);
    expect(sql.prepare('SELECT * FROM candidate_reactions').all()).toHaveLength(0);
  });
  it('讀取結果不快取，中文 slug 可正確表態', async () => {
    const cookie = await visitor();
    const response = await vote(cookie, 1, '中文姓名');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await response.json()).toEqual({ support: 1, oppose: 0, choice: 1 });
  });
  it('無法連線或缺少設定時不假裝票數為零', async () => {
    const request = new Request(`${base}?candidate=alice`);
    expect((await handle({ request, env: {} })).status).toBe(503);
    sql.exec('DROP TABLE candidate_reactions');
    expect((await handle({ request, env })).status).toBe(503);
  });
  it('限制頻繁提交，已儲存的選擇不受拒絕請求影響', async () => {
    const cookie = await visitor();
    for (let i = 0; i < 60; i++) expect((await vote(cookie, 1)).status).toBe(200);
    const response = await vote(cookie, -1);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await (await read('alice', cookie)).json()).toEqual({ support: 1, oppose: 0, choice: 1 });
  });
  it('超大或非 JSON 內容拒絕寫入', async () => {
    const cookie = await visitor();
    const request = new Request(`${base}?candidate=alice`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 1, padding: 'x'.repeat(600) }),
    });
    expect((await handle({ request, env })).status).toBe(413);
    expect((await vote(cookie, 1, 'alice', { 'Content-Type': 'text/plain' })).status).toBe(403);
  });
});
