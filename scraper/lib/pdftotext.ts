import { accessSync, constants, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Resolve only when converting a PDF: importing a parser must not require Poppler.
// No shell or package manager is invoked. An explicit override must be a file path.
export function resolvePdfToText({
  env = process.env,
  platform = process.platform,
}: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}): string {
  if (env.PDFTOTEXT_PATH) {
    if (isExecutable(env.PDFTOTEXT_PATH)) return resolve(env.PDFTOTEXT_PATH);
    throw new Error('PDFTOTEXT_PATH must point to an executable pdftotext file');
  }
  const name = platform === 'win32' ? 'pdftotext.exe' : 'pdftotext';
  const dirs = (env.PATH ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  if (platform === 'darwin') {
    if (env.HOMEBREW_PREFIX) dirs.push(join(env.HOMEBREW_PREFIX, 'bin'));
    dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  }
  for (const dir of dirs) {
    const path = join(dir, name);
    if (isExecutable(path)) return resolve(path);
  }
  throw new Error('pdftotext not found. Install Poppler (Ubuntu: apt-get install poppler-utils; macOS: brew install poppler), or set PDFTOTEXT_PATH.');
}
