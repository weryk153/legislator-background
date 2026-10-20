import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCandidacies } from '../../src/lib/candidacy';

// 在 Pages Functions 打包前產生白名單，API 不接受任意人物／自訂 slug。
const candidates = [...loadCandidacies().keys()].sort();
if (!candidates.length) throw new Error('候選人名冊為空，停止產生表態白名單');
mkdirSync('functions/_data', { recursive: true });
writeFileSync('functions/_data/reaction-targets.json', JSON.stringify(candidates) + '\n');
console.log(`表態白名單：${candidates.length} 位 2026 候選人`);
