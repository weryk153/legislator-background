import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePdfToText } from '../lib/pdftotext';

const dirs: string[] = [];
function executable(name = 'pdftotext', mode = 0o755) {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-tool-'));
  dirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, mode);
  return { dir, path };
}
afterEach(() => {
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('resolvePdfToText', () => {
  it('finds a Linux PATH executable without Homebrew', () => {
    const tool = executable();
    expect(resolvePdfToText({ platform: 'linux', env: { PATH: `/missing:${tool.dir}` } })).toBe(tool.path);
  });
  it('prefers an explicit path, including spaces, over PATH', () => {
    const tool = executable('custom poppler');
    expect(resolvePdfToText({ env: { PDFTOTEXT_PATH: tool.path, PATH: '/missing' } })).toBe(tool.path);
  });
  it('does not silently ignore an invalid explicit path', () => {
    const tool = executable();
    expect(() => resolvePdfToText({ env: { PDFTOTEXT_PATH: '/missing', PATH: tool.dir } })).toThrow('PDFTOTEXT_PATH');
  });
  it('skips non-executable files and respects PATH order', () => {
    const bad = executable('pdftotext', 0o644);
    const good = executable();
    expect(resolvePdfToText({ platform: 'linux', env: { PATH: `${bad.dir}:${good.dir}` } })).toBe(good.path);
  });
  it('supports a Homebrew prefix on macOS when it is absent from PATH', () => {
    const tool = executable();
    mkdirSync(join(tool.dir, 'bin'));
    writeFileSync(join(tool.dir, 'bin', 'pdftotext'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    expect(resolvePdfToText({ platform: 'darwin', env: { PATH: '/missing', HOMEBREW_PREFIX: tool.dir } }))
      .toBe(join(tool.dir, 'bin', 'pdftotext'));
  });
  it('gives installation instructions when missing on Linux', () => {
    expect(() => resolvePdfToText({ platform: 'linux', env: { PATH: '/missing' } })).toThrow('poppler-utils');
  });
  it('can import gazette and parse text without any executable', async () => {
    vi.stubEnv('PATH', '/missing');
    vi.stubEnv('PDFTOTEXT_PATH', '/missing');
    vi.resetModules();
    const gazette = await import('../lib/gazette');
    expect(gazette.parseGazetteAmount('1,234')).toBe(1234);
  });
});
