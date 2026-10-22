import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function check(responses: Array<{ status?: number; body: unknown }>) {
  const mock = `const replies = ${JSON.stringify(responses)};
    globalThis.fetch = async () => {
      const reply = replies.shift();
      if (!reply) throw new Error('unexpected request');
      return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), {status: reply.status ?? 200});
    };`;
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(mock)}`,
    resolve('scraper/scripts/test-judicial-auth.mjs')], {
    encoding: 'utf8', env: { ...process.env, JUDICIAL_API_USER: 'test-user', JUDICIAL_API_PASSWORD: 'test-password' },
  });
  const output = result.stdout + result.stderr;
  expect(output).not.toContain('test-password');
  expect(output).not.toContain('sensitive-token');
  return { code: result.status, output };
}

describe('safe judicial auth diagnostic', () => {
  it('checks Auth and JList without printing the returned token', () => {
    const result = check([{ body: { Token: 'sensitive-token' } }, { body: [{ date: '20261015', list: ['sample-jid'] }] }]);
    expect(result.code).toBe(0);
    expect(result.output).toContain('AUTH OK');
    expect(result.output).toContain('總數: 1');
  });
  it('returns failure on account rejection', () => {
    const result = check([{ body: { error: '驗證失敗' } }]);
    expect(result.code).toBe(1);
    expect(result.output).toContain('驗證失敗');
  });
  it.each([
    { status: 503, body: 'sensitive-token test-password' },
    { body: '{sensitive-token test-password' },
    { body: { error: 'sensitive-token test-password' } },
  ])('withholds arbitrary error bodies and exits nonzero', response => {
    expect(check([response]).code).toBe(1);
  });
  it('returns failure if JList rejects a valid Auth token', () => {
    expect(check([{ body: { Token: 'sensitive-token' } }, { body: { error: '驗證失敗' } }]).code).toBe(1);
  });
});
