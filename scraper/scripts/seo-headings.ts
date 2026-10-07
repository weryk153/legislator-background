// 改版前後比對各頁 <title>／<h1>：
//   pnpm exec tsx scraper/scripts/seo-headings.ts --write .superpowers/seo-baseline.json
//   pnpm exec tsx scraper/scripts/seo-headings.ts --check .superpowers/seo-baseline.json
// ALLOWED_H1_CHANGES 列出刻意改動的頁面（首頁 h1 改為報頭站名）。
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractHeadings } from '../lib/seoHeadings';

const DIST = join(process.cwd(), 'dist');
const ALLOWED_H1_CHANGES: Record<string, string[]> = { '/': ['政治人物背景資料庫'] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f === 'index.html' || f === '404.html' ? [p] : [];
  });
}

function scan(): Record<string, { title: string; h1: string[] }> {
  const out: Record<string, { title: string; h1: string[] }> = {};
  for (const f of walk(DIST)) {
    const route = '/' + relative(DIST, f).replace(/index\.html$/, '');
    out[route] = extractHeadings(readFileSync(f, 'utf8'));
  }
  return out;
}

const [mode, file] = process.argv.slice(2);
if (mode === '--write') {
  writeFileSync(file, JSON.stringify(scan(), null, 1));
  console.log(`寫入基準 ${file}`);
} else if (mode === '--check') {
  const base = JSON.parse(readFileSync(file, 'utf8')) as ReturnType<typeof scan>;
  const now = scan();
  const errs: string[] = [];
  for (const [route, b] of Object.entries(base)) {
    const n = now[route];
    if (!n) { errs.push(`${route}：頁面消失`); continue; }
    if (n.title !== b.title) errs.push(`${route}：title「${b.title}」→「${n.title}」`);
    const want = ALLOWED_H1_CHANGES[route] ?? b.h1;
    if (JSON.stringify(n.h1) !== JSON.stringify(want)) errs.push(`${route}：h1 ${JSON.stringify(b.h1)} → ${JSON.stringify(n.h1)}`);
  }
  for (const route of Object.keys(now)) if (!base[route]) errs.push(`${route}：新頁面（基準沒有）`);
  if (errs.length) { console.error(errs.slice(0, 50).join('\n') + `\n共 ${errs.length} 處不同`); process.exit(1); }
  console.log(`${Object.keys(base).length} 頁 title／h1 與基準一致`);
} else {
  console.error('用法：--write <file> | --check <file>'); process.exit(2);
}
