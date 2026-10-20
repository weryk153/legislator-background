import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { isReactionChoice } from '../src/lib/reactions';

export interface ReactionEnv {
  REACTIONS_DB?: D1Database;
  REACTION_SECRET?: string;
}
const COOKIE = 'civic_reaction';
const MAX_AGE = 180 * 24 * 60 * 60;
const encoder = new TextEncoder();

async function signature(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

async function visitorId(request: Request, secret: string, now: number): Promise<string | null> {
  const cookie = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie) return null;
  const [id, issued, sig] = cookie.split('.');
  if (!/^[a-f0-9-]{36}$/.test(id ?? '') || !/^\d+$/.test(issued ?? '') || !/^[a-f0-9]{64}$/.test(sig ?? '')) return null;
  const age = now - Number(issued);
  if (age < -60 || age >= MAX_AGE) return null;
  const expected = await signature(secret, `cookie|${id}.${issued}`);
  // 固定長度比較，避免依第一個不符字元提早結束。
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return difference === 0 ? id : null;
}

function reply(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Vary': 'Cookie',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}
const unavailable = () => reply({ error: '表態功能暫時無法使用，請稍後再試。' }, 503);

export function createReactionHandler(candidates: readonly string[]) {
  const allowed = new Set(candidates);
  return async ({ request, env }: { request: Request; env: ReactionEnv }): Promise<Response> => {
    const url = new URL(request.url);
    const now = Math.floor(Date.now() / 1000);
    const db = env.REACTIONS_DB;
    const secret = env.REACTION_SECRET;
    if (request.method !== 'GET' && request.method !== 'POST') return reply({ error: '不支援的操作' }, 405, { Allow: 'GET, POST' });
    if (!db || !secret || secret.length < 32) return unavailable();
    if (request.method === 'POST' && (request.headers.get('Origin') !== url.origin
      || request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')) {
      return reply({ error: '請從本站操作。' }, 403);
    }
    try {
      const id = await visitorId(request, secret, now);
      const candidate = url.searchParams.get('candidate');
      // 初始化共用的 HttpOnly cookie；前端只呼叫一次，避免同頁多卡片互相覆寫。
      if (request.method === 'GET' && !candidate) {
        if (id) return reply({ ready: true });
        const value = `${crypto.randomUUID()}.${now}`;
        const sig = await signature(secret, `cookie|${value}`);
        return reply({ ready: true }, 200, {
          'Set-Cookie': `${COOKIE}=${value}.${sig}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
        });
      }
      if (!candidate || !allowed.has(candidate)) return reply({ error: '找不到候選人。' }, 404);
      const voter = id ? await signature(secret, `vote|2026|${candidate}|${id}`) : '';
      const scope = `2026:${candidate}`;
      const statements: D1PreparedStatement[] = [];
      if (request.method === 'POST') {
        if (!id) return reply({ error: '請允許本站 Cookie，再重新整理後表態。' }, 401);
        // 限制實際讀入量，不只信任可偽造的 Content-Length。
        const reader = request.body?.getReader();
        if (!reader) return reply({ error: '缺少表態內容。' }, 400);
        let body = '';
        let bytes = 0;
        const decoder = new TextDecoder();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 512) { await reader.cancel(); return reply({ error: '內容過長。' }, 413); }
          body += decoder.decode(part.value, { stream: true });
        }
        body += decoder.decode();
        let choice: unknown;
        try { choice = JSON.parse(body).choice; } catch { return reply({ error: '表態格式有誤。' }, 400); }
        if (!isReactionChoice(choice)) return reply({ error: '表態格式有誤。' }, 400);
        const bucket = Math.floor(now / 600);
        const keys = [{ key: await signature(secret, `rate|${bucket}|${id}`), max: 60 }];
        // IP 只用於短期限速，不儲存原值；同網路可共享配額，並非一人一票認證。
        const ip = request.headers.get('CF-Connecting-IP');
        if (ip) keys.push({ key: await signature(secret, `ip-rate|${bucket}|${ip}`), max: 300 });
        const rates = await db.batch<{ requests: number }>([
          ...keys.map(({ key }) => db.prepare(
            'INSERT INTO reaction_rate_limits (key, expires_at, requests) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET requests = requests + 1 RETURNING requests'
          ).bind(key, (bucket + 1) * 600)),
          db.prepare('DELETE FROM reaction_rate_limits WHERE expires_at < ?').bind(now),
        ]);
        if (keys.some(({ max }, i) => (rates[i].results[0]?.requests ?? max + 1) > max)) {
          return reply({ error: '操作太頻繁，請稍後再試。' }, 429, { 'Retry-After': String(600 - now % 600) });
        }
        // 傳入「最後希望的選擇」而非 toggle，網路重試或連點不會重複加票。
        statements.push(choice === 0
          ? db.prepare('DELETE FROM candidate_reactions WHERE candidate = ? AND visitor = ?').bind(scope, voter)
          : db.prepare('INSERT INTO candidate_reactions (candidate, visitor, choice) VALUES (?, ?, ?) ON CONFLICT(candidate, visitor) DO UPDATE SET choice = excluded.choice').bind(scope, voter, choice));
      }
      statements.push(db.prepare(
        'SELECT COALESCE(SUM(choice = 1), 0) AS support, COALESCE(SUM(choice = -1), 0) AS oppose, COALESCE(MAX(CASE WHEN visitor = ? THEN choice END), 0) AS choice FROM candidate_reactions WHERE candidate = ?'
      ).bind(voter, scope));
      // 寫入與回傳統計同一個 batch transaction；同時到達的請求也不會造成計數遺失。
      const results = await db.batch(statements);
      return reply(results[results.length - 1].results[0]);
    } catch {
      // 不將資料庫訊息／識別資料傳回瀏覽器或記錄到應用日誌。
      return unavailable();
    }
  };
}
