import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.json') ? [path] : [];
  });
}

it('已發布資料不新增未處理的造字或 Unicode 替換字元', () => {
  const unresolved: string[] = [];
  function visit(value: unknown, path: string) {
    if (typeof value === 'string' && /[\uFFFD\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(value)) {
      unresolved.push(`${path}: ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`);
    }
  }
  for (const file of [...files('src/data'), ...files('public/data')]) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    // 人物以穩定 slug 定位，新增人物不應改變既有缺字的允許位置。
    if (file === 'src/data/officials.json') {
      for (const official of data) visit(official, `${file}/${official.slug}`);
    } else visit(data, file);
  }
  // 監察院原始申報尚無可靠對照；前端明示「劉宜〔缺字〕」，不可猜測身分。
  // 只允許這個確切原始值／位置，新增或改變的造字一律使檢查失敗。
  expect(unresolved).toEqual([
    'src/data/officials.json/c-楊家俍-民進黨-桃園市第08選舉區/donations/0/topDonors/5/donorName: 劉宜\uE8CD',
  ]);
});
